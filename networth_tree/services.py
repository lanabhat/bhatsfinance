from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction

from insights.services import compute_category_breakdown, compute_holdings, compute_networth
from networth_tree.models import NetWorthTreeNode, NetWorthTreeSnapshot

ZERO = Decimal('0.00')


def _decimal_or_none(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _to_decimal_string(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return str(value.quantize(Decimal('0.01')))


def get_source_values(household_id: int, as_of: date):
    category_breakdown = compute_category_breakdown(household_id, as_of)
    holdings = compute_holdings(household_id, as_of)
    category_values = {row['category_id']: Decimal(str(row['market_value'])) for row in category_breakdown}
    instrument_values = {row['instrument_id']: Decimal(str(row['market_value'])) for row in holdings}
    return category_values, instrument_values


def resolve_snapshot(snapshot: NetWorthTreeSnapshot) -> dict:
    category_values, instrument_values = get_source_values(snapshot.household_id, snapshot.as_of_date)
    networth = compute_networth(snapshot.household_id, snapshot.as_of_date)

    nodes = list(
        snapshot.nodes.select_related('linked_category', 'linked_instrument').order_by('sort_order', 'id')
    )
    by_parent: dict[int | None, list[NetWorthTreeNode]] = {}
    by_id: dict[int, NetWorthTreeNode] = {}
    for node in nodes:
        by_parent.setdefault(node.parent_id, []).append(node)
        by_id[node.id] = node

    resolved_current_by_id: dict[int, Decimal] = {}

    def resolve_current(node: NetWorthTreeNode) -> Decimal:
        if node.id in resolved_current_by_id:
            return resolved_current_by_id[node.id]

        if node.current_value_override is not None:
            current = node.current_value_override
        elif node.kind == NetWorthTreeNode.NodeKind.LINKED_CATEGORY:
            current = category_values.get(node.linked_category_id, ZERO)
        elif node.kind == NetWorthTreeNode.NodeKind.LINKED_INSTRUMENT:
            current = instrument_values.get(node.linked_instrument_id, ZERO)
        else:
            children = by_parent.get(node.id, [])
            if children:
                current = sum((resolve_current(child) for child in children), start=ZERO)
            else:
                current = ZERO

        resolved_current_by_id[node.id] = current
        return current

    for node in nodes:
        resolve_current(node)

    def build_node_dict(node: NetWorthTreeNode) -> dict:
        children = by_parent.get(node.id, [])
        children_payload = [build_node_dict(child) for child in children]
        child_current_sum = sum((resolved_current_by_id[child.id] for child in children), start=ZERO)
        target_value = _decimal_or_none(node.target_value)
        remaining_value = (target_value - child_current_sum) if target_value is not None else None

        return {
            'id': node.id,
            'snapshot': snapshot.id,
            'parent': node.parent_id,
            'name': node.name,
            'kind': node.kind,
            'linked_category_id': node.linked_category_id,
            'linked_instrument_id': node.linked_instrument_id,
            'target_value': _to_decimal_string(target_value),
            'current_value_override': _to_decimal_string(_decimal_or_none(node.current_value_override)),
            'sort_order': node.sort_order,
            'is_collapsed': node.is_collapsed,
            'resolved_current_value': _to_decimal_string(resolved_current_by_id[node.id]),
            'remaining_value': _to_decimal_string(remaining_value),
            'children': children_payload,
        }

    roots = by_parent.get(None, [])
    return {
        'snapshot': {
            'id': snapshot.id,
            'household_id': snapshot.household_id,
            'as_of_date': snapshot.as_of_date.isoformat(),
            'networth': _to_decimal_string(networth),
            'nodes': [build_node_dict(root) for root in roots],
        }
    }


@transaction.atomic
def seed_snapshot(household_id: int, as_of: date) -> NetWorthTreeSnapshot:
    from instruments.models import Instrument

    snapshot, _ = NetWorthTreeSnapshot.objects.get_or_create(
        household_id=household_id,
        as_of_date=as_of,
    )
    snapshot.nodes.all().delete()
    current_networth = compute_networth(household_id, as_of)

    root = NetWorthTreeNode.objects.create(
        snapshot=snapshot,
        parent=None,
        name='Net Worth',
        kind=NetWorthTreeNode.NodeKind.MANUAL_BRANCH,
        current_value_override=current_networth,
        sort_order=0,
    )

    category_breakdown = compute_category_breakdown(household_id, as_of)
    holdings = compute_holdings(household_id, as_of)
    instrument_ids = [row['instrument_id'] for row in holdings]
    instruments = {
        item.id: item
        for item in Instrument.objects.filter(household_id=household_id, id__in=instrument_ids).only('id', 'asset_category')
    }

    holdings_by_category: dict[int | None, list[dict]] = {}
    for row in holdings:
        inst = instruments.get(row['instrument_id'])
        cat_id = inst.asset_category_id if inst else None
        holdings_by_category.setdefault(cat_id, []).append(row)

    for idx, row in enumerate(category_breakdown):
        category_id = row['category_id']
        if category_id is None:
            parent_node = NetWorthTreeNode.objects.create(
                snapshot=snapshot,
                parent=root,
                name=row['category_name'],
                kind=NetWorthTreeNode.NodeKind.MANUAL_BRANCH,
                current_value_override=Decimal(str(row['market_value'])),
                sort_order=idx,
            )
        else:
            parent_node = NetWorthTreeNode.objects.create(
                snapshot=snapshot,
                parent=root,
                name=row['category_name'],
                kind=NetWorthTreeNode.NodeKind.LINKED_CATEGORY,
                linked_category_id=category_id,
                sort_order=idx,
            )

        for jdx, holding in enumerate(sorted(holdings_by_category.get(category_id, []), key=lambda x: x['instrument_name'].lower())):
            NetWorthTreeNode.objects.create(
                snapshot=snapshot,
                parent=parent_node,
                name=holding['instrument_name'],
                kind=NetWorthTreeNode.NodeKind.LINKED_INSTRUMENT,
                linked_instrument_id=holding['instrument_id'],
                sort_order=jdx,
            )

    return snapshot
