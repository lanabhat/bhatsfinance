"""What an import changes: holding and account values/units before vs after.

The same code serves the preview and the apply. `summarise_import` takes the household's
state, runs the import, takes the state again and diffs them; for a preview (dry run)
it then rolls the whole transaction back. So what the preview says will change is
exactly what applying does.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Callable

from django.db import transaction as db_transaction

ZERO = Decimal('0')
VALUE_EPSILON = Decimal('0.01')
UNITS_EPSILON = Decimal('0.000001')


def household_state(household) -> dict[str, dict]:
    """Every holding and cash account with its current value (full, not member-scaled)."""
    from insights.services import compute_holdings
    from instruments.models import Account, Instrument, InstrumentOwnership, Investment
    from instruments.services import compute_account_balance

    holdings = compute_holdings(household.id, date.today(), include_inactive=True, unscaled=True)
    instrument_ids = {h['instrument_id'] for h in holdings}
    active = dict(Instrument.objects.filter(id__in=instrument_ids).values_list('id', 'is_active'))
    inv_members = dict(
        Investment.objects.filter(id__in={h['investment_id'] for h in holdings if h['investment_id']})
        .values_list('id', 'member__full_name')
    )
    owners: dict[int, list[str]] = {}
    for inst_id, name in InstrumentOwnership.objects.filter(instrument_id__in=instrument_ids).values_list('instrument_id', 'member__full_name'):
        owners.setdefault(inst_id, []).append(name)

    state: dict[str, dict] = {}
    for h in holdings:
        inv_id = h['investment_id']
        key = f'inv:{inv_id}' if inv_id else f"inst:{h['instrument_id']}"
        state[key] = {
            'kind': 'holding',
            'name': h['investment_name'] or h['instrument_name'],
            'type': h['instrument_type'],
            'member': (inv_members.get(inv_id) if inv_id else ', '.join(owners.get(h['instrument_id'], []))) or '',
            'value': h['market_value'],
            'units': h['quantity'],
            'last_valued_on': h['last_valued_on'],
            'active': active.get(h['instrument_id'], True),
        }
    for account in Account.objects.filter(household=household, is_active=True).exclude(account_type='broker').select_related('primary_member'):
        state[f'acct:{account.id}'] = {
            'kind': 'account',
            'name': account.name,
            'type': account.account_type,
            'member': account.primary_member.full_name if account.primary_member else '',
            'value': compute_account_balance(account)['current_balance'],
            'units': None,
            'last_valued_on': None,
            'active': True,
        }
    return state


def _num(value) -> str | None:
    return None if value is None else str(value)


def diff(before: dict[str, dict], after: dict[str, dict]) -> dict:
    """Items whose value or units moved (plus new / sold out / closed ones), biggest change first."""
    items = []
    unchanged = 0
    for key in before.keys() | after.keys():
        b, a = before.get(key), after.get(key)
        if a is None:
            status = 'removed'
        elif b is None:
            status = 'new'
        elif b['active'] and not a['active']:
            status = 'closed'
        else:
            value_moved = abs((a['value'] or ZERO) - (b['value'] or ZERO)) >= VALUE_EPSILON
            units_moved = (a['units'] is not None and b['units'] is not None
                           and abs(a['units'] - b['units']) >= UNITS_EPSILON)
            if not value_moved and not units_moved:
                unchanged += 1
                continue
            status = 'sold_out' if (a['units'] is not None and a['units'] == 0 and (b['units'] or 0) > 0) else 'changed'
        ref = a or b
        value_before = b['value'] if b else ZERO
        value_after = ZERO if status in ('removed', 'closed') else a['value']
        items.append({
            'key': key,
            'kind': ref['kind'],
            'name': ref['name'],
            'type': ref['type'],
            'member': ref['member'],
            'status': status,
            'value_before': _num(value_before),
            'value_after': _num(value_after),
            'change': _num(value_after - value_before),
            'units_before': _num(b['units']) if b else None,
            'units_after': _num(a['units']) if a else None,
            'last_valued_before': b['last_valued_on'].isoformat() if b and b['last_valued_on'] else None,
        })
    items.sort(key=lambda i: abs(Decimal(i['change'])), reverse=True)
    total_before = sum((Decimal(i['value_before']) for i in items), ZERO)
    total_after = sum((Decimal(i['value_after']) for i in items), ZERO)
    return {
        'items': items,
        'unchanged_count': unchanged,
        'total_before': str(total_before),
        'total_after': str(total_after),
        'net_change': str(total_after - total_before),
    }


def summarise_import(household, apply_fn: Callable[[], Any], dry_run: bool = False) -> tuple[Any, dict]:
    """Run `apply_fn` and return (its result, the change summary). A dry run is rolled back."""
    with db_transaction.atomic():
        before = household_state(household)
        result = apply_fn()
        summary = diff(before, household_state(household))
        if dry_run:
            db_transaction.set_rollback(True)
    return result, summary


def is_dry_run(data) -> bool:
    """`dry_run` from a JSON body or a multipart form field ("true"/"1")."""
    value = data.get('dry_run')
    return value is True or str(value).lower() in ('true', '1', 'yes')


def record_import(household, kind: str, filename: str, member, summary: dict, counts: dict):
    """Keep a completed import's change summary for the Import History tab."""
    from django.utils import timezone
    from ingestion.models import ImportBatch

    return ImportBatch.objects.create(
        household=household, source=ImportBatch.SourceType.MANUAL, kind=kind, member=member,
        filename=filename[:255], status=ImportBatch.StatusType.COMPLETED, completed_at=timezone.now(),
        summary=summary, counts={k: v for k, v in counts.items() if k != 'change_summary'},
    )
