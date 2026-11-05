"""
IndiaBonds deal sheet import: match each deal to a bond lot (BondDetails) already
recorded, show how they differ, and apply one of four actions per deal.

  create   — new deal, no lot yet: a lot + its buy, under the ISIN's bond instrument
             (or a new one).
  append   — matched lot: apply every value the deal sheet has, automatically; fields it
             doesn't have (credit rating, grace days, maturity value) are left alone and
             the redemption note is added to the lot's notes, not written over them.
  edit     — matched lot: write exactly the final values the user chose per field.
  replace  — matched lot: delete the lot and its buy, create both afresh from the deal
             sheet in the same instrument; coupon-received acks move to the new lot.
  skip     — nothing.

A buy's amount is the settlement amount (the cash debited); the principal / accrued
interest split and the order/deal IDs go in its metadata, and `metadata.order_id` is
how a re-upload recognises a deal it already imported.

After the writes, check_bond_valuations() looks at what the affected holdings are now
worth (compute_holdings: the latest snapshot's unit price × units, else its value plus
later buys, else net invested) and flags anything negative or out of scale.
"""
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.db import transaction as db_transaction

LOT_FIELDS = [
    ('coupon_rate', 'Coupon rate (%)'),
    ('coupon_frequency', 'Coupon frequency'),
    ('first_coupon_date', 'First coupon date'),
    ('maturity_date', 'Maturity date'),
    ('investment_date', 'Invested on'),
    ('quantity', 'Units'),
    ('face_value', 'Face value per unit (₹)'),
    ('issuer_name', 'Issuer'),
    ('bond_type', 'Bond type'),
    ('isin', 'ISIN'),
]
TX_FIELDS = [
    ('amount', 'Buy amount (₹)'),
    ('tx_date', 'Buy date'),
    ('price_per_unit', 'Price per unit (₹)'),
]
# Not on the deal sheet — asked for in the review step (Create / Edit / Replace).
EXTRA_FIELDS = ['credit_rating', 'grace_days', 'maturity_value', 'notes']

DECIMAL_FIELDS = {'coupon_rate', 'face_value', 'amount', 'price_per_unit', 'maturity_value'}
DATE_FIELDS = {'first_coupon_date', 'maturity_date', 'investment_date', 'tx_date'}
INT_FIELDS = {'quantity', 'grace_days'}

SCALE_LOW, SCALE_HIGH = Decimal('0.5'), Decimal('1.5')


class ValuationBlocked(Exception):
    """Raised inside the apply to roll it back when the result would be mis-valued."""

    def __init__(self, issues):
        super().__init__('valuation issues')
        self.issues = issues


# ── values ──────────────────────────────────────────────────────────────────────

def _norm(field: str, value):
    """Comparable/storable form of a value, or None when blank."""
    if value in (None, ''):
        return None
    if field in DECIMAL_FIELDS:
        try:
            return Decimal(str(value))
        except InvalidOperation:
            raise ValueError(f'{field}: “{value}” is not a number')
    if field in DATE_FIELDS:
        return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
    if field in INT_FIELDS:
        return int(Decimal(str(value)))
    return str(value).strip()


def _json(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return format(value.normalize(), 'f') if value == value.to_integral() else format(value, 'f')
    if isinstance(value, date):
        return value.isoformat()
    return value


def _same(field: str, a, b) -> bool:
    return _norm(field, a) == _norm(field, b)


def deal_price_per_unit(deal: dict) -> Decimal | None:
    qty = Decimal(deal['quantity'] or 0)
    if not qty or not deal.get('principal'):
        return None
    return (Decimal(deal['principal']) / qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def deal_values(deal: dict) -> dict:
    """What the deal sheet says, keyed like LOT_FIELDS + TX_FIELDS."""
    return {
        'coupon_rate': deal.get('coupon_rate'),
        'coupon_frequency': deal.get('coupon_frequency'),
        'first_coupon_date': deal.get('first_coupon_date'),
        'maturity_date': deal.get('maturity_date'),
        'investment_date': deal.get('value_date'),
        'quantity': deal.get('quantity'),
        'face_value': deal.get('face_value'),
        'issuer_name': deal.get('issuer_name'),
        'bond_type': deal.get('bond_type'),
        'isin': deal.get('isin'),
        'amount': deal.get('settlement_amount'),
        'tx_date': deal.get('value_date'),
        'price_per_unit': deal_price_per_unit(deal),
    }


def lot_values(lot) -> dict:
    tx = lot.funding_transaction
    values = {field: getattr(lot, field) for field, _ in LOT_FIELDS}
    values.update({
        'amount': tx.amount if tx else None,
        'tx_date': tx.tx_date if tx else None,
        'price_per_unit': tx.price_per_unit if tx else None,
    })
    values.update({f: getattr(lot, f) for f in EXTRA_FIELDS})
    return values


def deal_metadata(deal: dict) -> dict:
    keys = ('order_id', 'deal_id', 'principal', 'accrued_interest', 'accrued_days', 'price',
            'stamp_duty', 'brokerage', 'deal_date', 'security_name', 'security_nature')
    return {**{k: deal.get(k) for k in keys}, 'platform': 'IndiaBonds'}


def appended_notes(existing: str, addition: str) -> str:
    existing, addition = (existing or '').strip(), (addition or '').strip()
    if not addition or addition in existing:
        return existing
    return f'{existing}\n{addition}' if existing else addition


# ── matching ────────────────────────────────────────────────────────────────────

def imported_transaction(household, order_id: str):
    from ledger.models import Transaction
    return Transaction.objects.filter(household=household, metadata__order_id=order_id).first()


def match_lot(household, deal: dict, claimed: set[int]):
    """(lot, already_imported) for a buy deal — the lot its order ID was imported into,
    else an unclaimed lot of the same ISIN invested on the value date, preferring the
    same unit count, then the same buy amount."""
    from instruments.models import BondDetails

    tx = imported_transaction(household, deal['order_id'])
    if tx is not None:
        lot = BondDetails.objects.filter(funding_transaction=tx).select_related('instrument', 'funding_transaction').first()
        if lot is not None and lot.id not in claimed:
            return lot, True
    candidates = [
        lot for lot in BondDetails.objects.filter(
            instrument__household=household, isin=deal['isin'], investment_date=deal['value_date'],
        ).select_related('instrument', 'funding_transaction').order_by('id')
        if lot.id not in claimed
    ]
    if not candidates:
        return None, tx is not None
    settlement = Decimal(deal['settlement_amount'])
    candidates.sort(key=lambda lot: (
        lot.quantity != deal['quantity'],
        not (lot.funding_transaction and lot.funding_transaction.amount == settlement),
    ))
    return candidates[0], False


def field_diff(deal: dict, lot) -> list[dict]:
    file_values = deal_values(deal)
    current = lot_values(lot) if lot else {}
    rows = []
    for field, label in LOT_FIELDS + TX_FIELDS:
        file_value = file_values.get(field)
        cur = current.get(field) if lot else None
        rows.append({
            'field': field, 'label': label,
            'current': _json(cur), 'file': _json(_norm(field, file_value) if file_value not in (None, '') else None),
            'changed': bool(lot) and file_value not in (None, '') and not _same(field, cur, file_value),
        })
    return rows


def sell_plan(household, deal: dict) -> list[dict]:
    """Which lots a sell takes units from — oldest first."""
    from instruments.models import BondDetails

    remaining = int(deal['quantity'])
    plan = []
    for lot in BondDetails.objects.filter(instrument__household=household, isin=deal['isin']) \
            .select_related('instrument').order_by('investment_date', 'id'):
        if remaining <= 0:
            break
        take = min(lot.quantity, remaining)
        if take <= 0:
            continue
        plan.append({'bond_details_id': lot.id, 'instrument_id': lot.instrument_id, 'instrument_name': lot.instrument.name,
                     'quantity_before': lot.quantity, 'quantity_after': lot.quantity - take, 'take': take})
        remaining -= take
    return plan


def preview_deals(household, deals: list[dict]) -> list[dict]:
    """Match each parsed deal (in upload order) and describe what each action would do."""
    claimed: set[int] = set()
    seen_orders: set[str] = set()
    out = []
    for deal in deals:
        item = {'match': None, 'diff': [], 'sell_plan': [], 'extras': {}}
        if deal['order_id'] in seen_orders:
            item['status'] = 'duplicate'
            out.append(item)
            continue
        seen_orders.add(deal['order_id'])

        if deal['side'] == 'sell':
            item['status'] = 'already_imported' if imported_transaction(household, deal['order_id']) else 'new'
            item['sell_plan'] = sell_plan(household, deal)
            out.append(item)
            continue

        lot, already = match_lot(household, deal, claimed)
        item['diff'] = field_diff(deal, lot)
        if lot is None:
            item['status'] = 'already_imported' if already else 'new'
            item['extras'] = {'account_id': _default_account_id(household, deal), 'credit_rating': '',
                              'grace_days': 15, 'maturity_value': None, 'notes': deal.get('notes') or ''}
        else:
            claimed.add(lot.id)
            tx = lot.funding_transaction
            changed = any(r['changed'] for r in item['diff']) or bool(
                deal.get('notes') and deal['notes'] not in (lot.notes or ''))
            item['status'] = 'already_imported' if already and not changed else ('matched_changed' if changed else 'matched_same')
            item['match'] = {
                'bond_details_id': lot.id, 'instrument_id': lot.instrument_id, 'instrument_name': lot.instrument.name,
                'funding': {'id': tx.id, 'tx_date': _json(tx.tx_date), 'amount': _json(tx.amount)} if tx else None,
                'coupon_acks': lot.coupon_acks.count(),
            }
            item['extras'] = {
                'account_id': (tx.account_id if tx else None) or lot.instrument.default_account_id,
                'credit_rating': lot.credit_rating, 'grace_days': lot.grace_days,
                'maturity_value': _json(lot.maturity_value),
                'notes': lot.notes or '',
                'notes_appended': appended_notes(lot.notes, deal.get('notes', '')),
            }
        out.append(item)
    return out


def _default_account_id(household, deal: dict):
    from instruments.services import find_bond_instruments
    inst = find_bond_instruments(household, deal['isin']).first()
    return inst.default_account_id if inst else None


# ── apply ───────────────────────────────────────────────────────────────────────

def _final_values(action: str, deal: dict, lot, given: dict, extras: dict) -> dict:
    """Every LOT/TX/EXTRA field's value to write, normalised."""
    file_values = deal_values(deal)
    if action == 'append':
        values = lot_values(lot)
        values.update({k: v for k, v in file_values.items() if v not in (None, '')})
        values['notes'] = appended_notes(lot.notes, deal.get('notes', ''))
    elif action == 'edit':
        values = lot_values(lot)
        values.update({k: v for k, v in (given or {}).items() if k in values})
        values.update({k: v for k, v in (extras or {}).items() if k in EXTRA_FIELDS})
    else:  # create / replace
        values = {f: None for f in EXTRA_FIELDS}
        values.update({k: v for k, v in file_values.items() if v not in (None, '')})
        values.update({k: v for k, v in (given or {}).items() if v not in (None, '')})
        values.update({k: v for k, v in (extras or {}).items() if k in EXTRA_FIELDS})
    out = {k: _norm(k, v) for k, v in values.items()}
    out['credit_rating'] = out.get('credit_rating') or ''
    out['notes'] = out.get('notes') or ''
    out['grace_days'] = 15 if out.get('grace_days') is None else out['grace_days']
    out['issuer_name'] = out.get('issuer_name') or ''
    out['coupon_frequency'] = out.get('coupon_frequency') or 'annual'
    out['bond_type'] = out.get('bond_type') or 'other'
    missing = [f for f in ('coupon_rate', 'maturity_date', 'investment_date', 'quantity', 'face_value', 'amount', 'tx_date')
               if out.get(f) is None]
    if missing:
        raise ValueError(f'Missing {", ".join(missing)}.')
    return out


def _write_lot(lot, values: dict) -> list[str]:
    changed = []
    for field, _ in LOT_FIELDS:
        if getattr(lot, field) != values[field]:
            setattr(lot, field, values[field])
            changed.append(field)
    for field in EXTRA_FIELDS:
        if getattr(lot, field) != values[field]:
            setattr(lot, field, values[field])
            changed.append(field)
    if changed:
        lot.save()
    return changed


def _create_buy(household, instrument, member, account, deal, values):
    from ledger.models import Transaction

    tx, _ = Transaction.objects.get_or_create(
        household=household, idempotency_key=f"indiabonds-{deal['order_id']}",
        defaults={
            'instrument': instrument, 'account': account, 'member': member,
            'tx_date': values['tx_date'], 'amount': values['amount'],
            'quantity': Decimal(values['quantity']), 'price_per_unit': values['price_per_unit'],
            'direction': 'outflow', 'transaction_type': 'buy', 'currency': 'INR', 'source': 'csv',
            'external_reference': deal['order_id'], 'description': f"IndiaBonds buy — {deal.get('security_name', '')}"[:200],
            'metadata': deal_metadata(deal),
        },
    )
    return tx


def _sync_buy(tx, deal, values) -> list[str]:
    """Bring the funding buy in line with the final values (a corrected copy when money,
    units or date differ — the ledger is append-only) and tag it with the deal."""
    from ledger.models import Transaction
    from ledger.services import replace_transaction

    wanted = {
        'amount': values['amount'], 'tx_date': values['tx_date'],
        'price_per_unit': values['price_per_unit'], 'quantity': Decimal(values['quantity']),
    }
    # quantity compares as a number, like the money fields
    changes = {f: v for f, v in wanted.items() if not _same('amount' if f == 'quantity' else f, getattr(tx, f), v)}
    if changes:
        replace_transaction(tx, changes, extra_metadata=deal_metadata(deal))
    else:
        Transaction.objects.filter(pk=tx.pk).update(metadata={**(tx.metadata or {}), **deal_metadata(deal)})
    return [f'buy {f}' for f in changes if f != 'quantity'] + (['buy quantity'] if 'quantity' in changes else [])


def _instrument_for(household, deal, member):
    from instruments.models import Instrument
    from instruments.services import create_bond_instrument, find_bond_instruments

    inst = find_bond_instruments(household, deal['isin']).order_by('id').first() or Instrument.objects.filter(
        household=household, instrument_type=Instrument.InstrumentType.BOND, symbol=deal['isin'],
    ).order_by('id').first()
    if inst is not None:
        return inst, False
    return create_bond_instrument(household, member, deal.get('issuer_name') or deal['security_name'], deal['isin']), True


def _create_lot(household, instrument, member, account, deal, values):
    from instruments.models import BondDetails

    tx = _create_buy(household, instrument, member, account, deal, values)
    lot = BondDetails(instrument=instrument, funding_transaction=tx)
    _write_lot(lot, values)
    if lot.pk is None:
        lot.save()
    return lot


def apply_item(household, item: dict, member, account) -> dict:
    """One deal. Raises on bad input; the caller wraps each item in its own atomic()."""
    from instruments.models import BondCouponAck, BondDetails

    deal = item['deal']
    action = item.get('action') or 'skip'
    result = {'filename': item.get('filename', ''), 'order_id': deal.get('order_id'), 'action': action, 'changed': []}

    if action == 'skip':
        result['status'] = 'skipped'
        return result
    if deal['side'] == 'sell':
        if action != 'create':
            raise ValueError('A sell can only be recorded (create) or skipped.')
        return {**result, **_apply_sell(household, deal, member, account)}

    lot = None
    if action in ('append', 'edit', 'replace'):
        lot = BondDetails.objects.select_related('instrument', 'funding_transaction').filter(
            pk=item.get('bond_details_id'), instrument__household=household,
        ).first()
        if lot is None:
            raise ValueError('The bond entry to update no longer exists — re-upload to match again.')

    values = _final_values(action, deal, lot, item.get('values') or {}, item.get('extras') or {})

    if action == 'create':
        instrument, created = _instrument_for(household, deal, member)
        account = account or instrument.default_account
        new_lot = _create_lot(household, instrument, member, account, deal, values)
        result.update(status='created', bond_details_id=new_lot.id, instrument_id=instrument.id,
                      instrument_name=instrument.name, new_instrument=created)
        return result

    if action == 'replace':
        old_tx = lot.funding_transaction
        member = member or (old_tx.member if old_tx else None)
        account = account or (old_tx.account if old_tx else None) or lot.instrument.default_account
        old_id = lot.id
        if old_tx is not None:
            BondDetails.objects.filter(pk=lot.pk).update(funding_transaction=None)
            old_tx.delete()
        new_lot = _create_lot(household, lot.instrument, member, account, deal, values)
        moved = BondCouponAck.objects.filter(bond_id=old_id).update(bond=new_lot)
        BondDetails.objects.filter(pk=old_id).delete()
        result.update(status='replaced', bond_details_id=new_lot.id, instrument_id=lot.instrument_id,
                      instrument_name=lot.instrument.name, coupon_acks_moved=moved,
                      deleted_buy=({'tx_date': _json(old_tx.tx_date), 'amount': _json(old_tx.amount)} if old_tx else None))
        return result

    # append / edit
    changed = _write_lot(lot, values)
    tx = lot.funding_transaction
    if tx is None:
        tx = _create_buy(household, lot.instrument, member, account or lot.instrument.default_account, deal, values)
        BondDetails.objects.filter(pk=lot.pk).update(funding_transaction=tx)
        changed.append('buy created')
    else:
        changed += _sync_buy(tx, deal, values)
    result.update(status='appended' if action == 'append' else 'edited', bond_details_id=lot.id,
                  instrument_id=lot.instrument_id, instrument_name=lot.instrument.name, changed=changed)
    return result


def _apply_sell(household, deal, member, account) -> dict:
    """Record a sell, taking units from lots oldest-first; one sell row per instrument the
    units come from (amount split pro rata); lots sold out entirely are removed."""
    from insights.services import compute_holding_cost_basis
    from instruments.models import BondDetails
    from ledger.models import Transaction

    if imported_transaction(household, deal['order_id']):
        return {'status': 'skipped', 'note': 'Already imported.'}
    plan = sell_plan(household, deal)
    sold = sum(p['take'] for p in plan)
    if sold < int(deal['quantity']):
        raise ValueError(f"Only {sold} of {deal['quantity']} units of {deal['isin']} are recorded — "
                         'record the buy first, or check the quantity.')
    total = Decimal(deal['settlement_amount'])
    price = deal_price_per_unit(deal)
    tx_date = date.fromisoformat(deal['value_date'])
    by_instrument: dict[int, int] = {}
    for p in plan:
        by_instrument[p['instrument_id']] = by_instrument.get(p['instrument_id'], 0) + p['take']
    allocated = Decimal('0')
    for n, (instrument_id, units) in enumerate(by_instrument.items()):
        last = n == len(by_instrument) - 1
        amount = total - allocated if last else (total * units / sold).quantize(Decimal('0.01'))
        allocated += amount
        held, net_invested = compute_holding_cost_basis(household.id, instrument_id, None, tx_date)
        realized = (amount - net_invested / held * units).quantize(Decimal('0.01')) if held > 0 else None
        Transaction.objects.create(
            household=household, instrument_id=instrument_id, account=account, member=member,
            tx_date=tx_date, amount=amount, quantity=Decimal(units), price_per_unit=price,
            direction='inflow', transaction_type='sell', currency='INR', source='csv',
            idempotency_key=f"indiabonds-{deal['order_id']}" + (f'-{n + 1}' if n else ''),
            external_reference=deal['order_id'], realized_gain=realized,
            description=f"IndiaBonds sell — {deal.get('security_name', '')}"[:200],
            metadata=deal_metadata(deal) if n == 0 else {**deal_metadata(deal), 'order_id': f"{deal['order_id']}#{n + 1}"},
        )
    for p in plan:
        if p['quantity_after'] <= 0:
            BondDetails.objects.filter(pk=p['bond_details_id']).delete()
        else:
            BondDetails.objects.filter(pk=p['bond_details_id']).update(quantity=p['quantity_after'])
    return {'status': 'created', 'sell_plan': plan, 'instrument_id': plan[0]['instrument_id'] if plan else None}


def refresh_formula_snapshot(household, instrument_id: int):
    """Today's value from the bond terms (face value × units, see valuations._compute_bond_value)."""
    from instruments.models import BondDetails, Instrument
    from valuations.models import ValuationSnapshot
    from valuations.services import _compute_bond_value, _upsert_auto_snapshot

    today = date.today()
    lots = list(BondDetails.objects.filter(instrument_id=instrument_id, instrument__household=household))
    if not lots:
        return
    value = sum((_compute_bond_value(lot, today) for lot in lots), start=Decimal('0'))
    _upsert_auto_snapshot(
        {'household_id': household.id, 'instrument': Instrument.objects.get(pk=instrument_id), 'investment': None, 'valuation_date': today},
        {'unit_price': None, 'market_value': value, 'source': ValuationSnapshot.SourceType.API,
         'notes': 'Bond formula value (IndiaBonds import)'},
    )


def apply_items(household, items: list[dict], members: dict, accounts: dict) -> tuple[list[dict], set[int], dict]:
    """Apply every item, each in its own savepoint. Returns (results, touched instrument
    ids, deals by bond_details_id for the checks)."""
    results, touched, deals_by_lot = [], set(), {}
    for item in items:
        try:
            with db_transaction.atomic():
                result = apply_item(household, item, members.get(item.get('member_id')), accounts.get(item.get('account_id')))
        except Exception as e:
            results.append({'filename': item.get('filename', ''), 'order_id': (item.get('deal') or {}).get('order_id'),
                            'action': item.get('action'), 'status': 'error', 'error': str(e)})
            continue
        results.append(result)
        if result.get('instrument_id'):
            touched.add(result['instrument_id'])
            if item.get('refresh_snapshot'):
                refresh_formula_snapshot(household, result['instrument_id'])
        for p in result.get('sell_plan') or []:
            touched.add(p['instrument_id'])
        if result.get('bond_details_id'):
            deals_by_lot[result['bond_details_id']] = item['deal']
    return results, touched, deals_by_lot


# ── valuation checks ────────────────────────────────────────────────────────────

def _issue(instrument, severity, code, message, suggestion, fields=(), lot_id=None):
    return {'instrument_id': instrument.id, 'instrument_name': instrument.name, 'bond_details_id': lot_id,
            'severity': severity, 'code': code, 'message': message, 'suggestion': suggestion, 'fields': list(fields)}


def _rupees(value: Decimal) -> str:
    return f'₹{value:,.2f}'


def check_bond_valuations(household, instrument_ids, deals_by_lot: dict | None = None) -> list[dict]:
    from insights.services import compute_holdings
    from instruments.models import BondDetails, Instrument
    from valuations.models import ValuationSnapshot

    if not instrument_ids:
        return []
    deals_by_lot = deals_by_lot or {}
    holdings = {
        h['instrument_id']: h
        for h in compute_holdings(household.id, date.today(), include_inactive=True, unscaled=True)
        if not h['investment_id'] and h['instrument_id'] in instrument_ids
    }
    issues = []
    for instrument in Instrument.objects.filter(pk__in=instrument_ids, household=household):
        lots = list(BondDetails.objects.filter(instrument=instrument).order_by('investment_date', 'id'))
        h = holdings.get(instrument.id)
        units = h['quantity'] if h else Decimal('0')
        value = h['market_value'] if h else Decimal('0')

        if units < 0:
            issues.append(_issue(instrument, 'error', 'negative_units',
                                 f'{instrument.name} would hold {units.normalize():f} units.',
                                 'More units are sold than were bought. Check the quantity on this deal or on the lot’s buy.',
                                 ('quantity', 'amount')))
        if value < 0:
            issues.append(_issue(instrument, 'error', 'negative_value',
                                 f'{instrument.name} would be valued at {_rupees(value)}.',
                                 'Units sold exceed units bought, or a buy amount is wrong. Check the quantity and buy amount.',
                                 ('quantity', 'amount')))

        for lot in lots:
            problems = []
            if lot.quantity <= 0:
                problems.append(('quantity', 'Units must be more than 0.'))
            if lot.face_value <= 0:
                problems.append(('face_value', 'Face value must be more than 0.'))
            if lot.coupon_rate < 0:
                problems.append(('coupon_rate', 'Coupon rate can’t be negative.'))
            if lot.maturity_date <= lot.investment_date:
                problems.append(('maturity_date', 'Maturity date must be after the investment date.'))
            if lot.first_coupon_date and not (lot.investment_date <= lot.first_coupon_date <= lot.maturity_date):
                problems.append(('first_coupon_date', 'First coupon date must fall between the investment and maturity dates.'))
            for field, text in problems:
                issues.append(_issue(instrument, 'error', 'invalid_terms', f'{instrument.name}: {text}',
                                     'Correct this field before importing.', (field,), lot.id))

            deal = deals_by_lot.get(lot.id)
            if deal and deal.get('principal') and lot.quantity > 0:
                principal = Decimal(deal['principal'])
                held = lot.face_value * lot.quantity
                if principal > 0 and not (SCALE_LOW <= held / principal <= SCALE_HIGH):
                    suggested = Decimal(deal['face_value']) if deal.get('face_value') else (principal / lot.quantity).quantize(Decimal('1'))
                    issues.append(_issue(
                        instrument, 'warning', 'face_value_scale',
                        f'{instrument.name}: face value {_rupees(lot.face_value)} × {lot.quantity} units = {_rupees(held)}, '
                        f'but the deal’s principal is {_rupees(principal)}.',
                        f'Face value is per unit, not the total. Set it to {_rupees(suggested)}.', ('face_value',), lot.id))
            if deal and len(deal.get('redemption_schedule') or []) > 1:
                issues.append(_issue(
                    instrument, 'info', 'partial_redemption',
                    f'{instrument.name} repays its principal in parts ({deal.get("notes", "")})',
                    'Value and coupons assume the full face value until the final date — update the value after each part is repaid.',
                    (), lot.id))

        if not lots or units < 0:
            continue
        lot_units = sum(lot.quantity for lot in lots)
        if units != lot_units:
            issues.append(_issue(
                instrument, 'warning', 'units_mismatch',
                f'{instrument.name}: the buys and sells add up to {units.normalize():f} units, but its bond entries hold {lot_units}.',
                'The value uses the units from transactions — correct the lot quantity or the buy so they agree.',
                ('quantity',)))
        expected = sum((lot.face_value * lot.quantity for lot in lots), start=Decimal('0'))
        if expected > 0 and units > 0 and not (SCALE_LOW <= value / expected <= SCALE_HIGH):
            snap = ValuationSnapshot.objects.filter(instrument=instrument, investment__isnull=True) \
                .order_by('-valuation_date', '-id').first()
            basis = (f'its latest valuation ({snap.valuation_date:%d %b %Y}, {snap.get_source_display()}'
                     + (f', {_rupees(snap.unit_price)} per unit' if snap.unit_price is not None else '') + ')') if snap else 'its buys'
            issues.append(_issue(
                instrument, 'warning', 'valuation_scale',
                f'{instrument.name} would be valued at {_rupees(value)} from {basis}, '
                f'against a face value of {_rupees(expected)}.',
                'Use “Update value” on this holding, or tick “Write a fresh formula valuation” to value it at face value.',
                ()))
    return issues
