"""
Universal importer: applies a user-defined column mapping to parsed rows
and creates the corresponding model records.
"""
import difflib
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction as db_transaction


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve(row: dict, mapping: dict, defaults: dict, field: str):
    """Return the value for a field: mapped column value, or default."""
    col = mapping.get(field)
    if col and col in row and row[col] != '':
        return row[col]
    return defaults.get(field, '')


def _to_decimal(val) -> Decimal:
    if val is None or str(val).strip() == '':
        return Decimal('0')
    cleaned = str(val).replace(',', '').replace(' ', '')
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        raise ValueError(f"Cannot convert {val!r} to decimal")


def _to_date(val) -> date:
    if isinstance(val, date):
        return val
    s = str(val).strip()
    for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%d-%b-%Y', '%d-%b-%y'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {val!r}")


def _fuzzy_member(name: str, members):
    """Fuzzy match a name string against member queryset. Returns member or None."""
    if not name:
        return None
    name_lower = name.lower().strip()
    choices = {m.full_name.lower(): m for m in members}
    matches = difflib.get_close_matches(name_lower, choices.keys(), n=1, cutoff=0.6)
    if matches:
        return choices[matches[0]]
    # fallback: substring match
    for key, member in choices.items():
        if name_lower in key or key in name_lower:
            return member
    return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def apply_import(household_id: int, import_type: str, rows: list,
                 mapping: dict, defaults: dict) -> dict:
    from core.models import Household
    household = Household.objects.get(pk=household_id)

    handlers = {
        'transactions': _import_transactions,
        'valuations': _import_valuations,
        'instruments': _import_instruments,
        'accounts': _import_accounts,
        'members': _import_members,
    }
    if import_type not in handlers:
        raise ValueError(f"Unknown import_type: {import_type!r}")

    created = skipped = 0
    errors = []

    for i, row in enumerate(rows, start=1):
        try:
            with db_transaction.atomic():
                result = handlers[import_type](household, row, mapping, defaults)
            if result == 'skipped':
                skipped += 1
            else:
                created += 1
        except Exception as e:
            errors.append({'row': i, 'reason': str(e), 'data': row})

    return {'created': created, 'skipped': skipped, 'errors': errors}


# ---------------------------------------------------------------------------
# Per-type handlers
# ---------------------------------------------------------------------------

def _import_transactions(household, row, mapping, defaults):
    from instruments.models import Account
    from instruments.models import Instrument
    from core.models import Member
    from ledger.models import Transaction

    def r(field):
        return _resolve(row, mapping, defaults, field)

    tx_date = _to_date(r('tx_date'))
    amount = _to_decimal(r('amount'))
    direction = r('direction').lower()
    if direction not in ('inflow', 'outflow'):
        raise ValueError(f"direction must be inflow or outflow, got {direction!r}")

    account_val = r('account')
    if not account_val:
        raise ValueError("account is required")
    try:
        account = Account.objects.get(pk=int(account_val), household=household)
    except (Account.DoesNotExist, ValueError):
        raise ValueError(f"Account not found: {account_val!r}")

    member = None
    member_val = r('member')
    if member_val:
        try:
            member = Member.objects.get(pk=int(member_val), household=household)
        except (Member.DoesNotExist, ValueError):
            pass

    instrument = None
    inst_val = r('instrument')
    if inst_val:
        try:
            instrument = Instrument.objects.get(pk=int(inst_val), household=household)
        except (Instrument.DoesNotExist, ValueError):
            pass

    tx_type = r('transaction_type').lower() or 'other'
    currency = r('currency') or 'INR'
    fees = _to_decimal(r('fees') or '0')
    taxes = _to_decimal(r('taxes') or '0')
    ext_ref = r('external_reference') or ''
    idempotency_key = r('idempotency_key') or ''

    Transaction.objects.create(
        household=household,
        account=account,
        member=member,
        instrument=instrument,
        tx_date=tx_date,
        amount=amount,
        direction=direction,
        transaction_type=tx_type,
        currency=currency,
        fees=fees,
        taxes=taxes,
        external_reference=ext_ref,
        idempotency_key=idempotency_key,
        source='csv',
    )
    return 'created'


def _import_valuations(household, row, mapping, defaults):
    from instruments.models import Account, Instrument
    from core.models import Member
    from valuations.models import ValuationSnapshot

    def r(field):
        return _resolve(row, mapping, defaults, field)

    valuation_date = _to_date(r('valuation_date'))

    instrument_name = r('instrument_name').strip()
    account_name = r('account_name').strip()

    if not instrument_name and not account_name:
        raise ValueError("Either instrument_name or account_name must be provided")

    account = None
    instrument = None

    if instrument_name:
        inst_type = (r('instrument_type') or 'mutual_fund').lower()
        instrument, _ = Instrument.objects.get_or_create(
            household=household,
            name=instrument_name,
            defaults={'instrument_type': inst_type},
        )
        # optionally link owner
        member_name = r('member_name').strip()
        if member_name:
            members = household.member_set.filter(is_active=True)
            member = _fuzzy_member(member_name, members)
            if member:
                from instruments.models import InstrumentOwnership
                InstrumentOwnership.objects.get_or_create(
                    instrument=instrument, member=member,
                    defaults={'allocation_percent': 100},
                )

    if account_name:
        try:
            account = Account.objects.get(household=household, name=account_name)
        except Account.DoesNotExist:
            raise ValueError(f"Account not found: {account_name!r}")

    unit_price_val = r('unit_price')
    market_value_val = r('market_value')
    balance_val = r('balance')

    unit_price = _to_decimal(unit_price_val) if unit_price_val else None
    market_value = _to_decimal(market_value_val) if market_value_val else None
    balance = _to_decimal(balance_val) if balance_val else Decimal('0')

    ValuationSnapshot.objects.update_or_create(
        household=household,
        instrument=instrument,
        account=account,
        valuation_date=valuation_date,
        defaults={
            'unit_price': unit_price,
            'market_value': market_value,
            'balance': balance,
            'notes': r('notes') or '',
            'source': 'csv',
        },
    )
    return 'created'


def _import_instruments(household, row, mapping, defaults):
    from instruments.models import Account, Instrument, InstrumentOwnership
    from core.models import Member

    def r(field):
        return _resolve(row, mapping, defaults, field)

    name = r('name').strip()
    if not name:
        raise ValueError("name is required")

    inst_type = (r('instrument_type') or 'other').lower()
    symbol = r('symbol').strip()

    default_account = None
    acct_name = r('default_account_name').strip()
    if acct_name:
        try:
            default_account = Account.objects.get(household=household, name=acct_name)
        except Account.DoesNotExist:
            pass

    instrument, created = Instrument.objects.get_or_create(
        household=household,
        name=name,
        defaults={
            'instrument_type': inst_type,
            'symbol': symbol,
            'default_account': default_account,
        },
    )

    owner_name = r('owner_name').strip()
    if owner_name:
        members = household.member_set.filter(is_active=True)
        member = _fuzzy_member(owner_name, members)
        if member:
            InstrumentOwnership.objects.get_or_create(
                instrument=instrument, member=member,
                defaults={'allocation_percent': 100},
            )

    return 'created' if created else 'skipped'


def _import_accounts(household, row, mapping, defaults):
    from instruments.models import Account
    from core.models import Member

    def r(field):
        return _resolve(row, mapping, defaults, field)

    name = r('name').strip()
    if not name:
        raise ValueError("name is required")

    acct_type = (r('account_type') or 'other').lower()
    institution = r('institution_name').strip()

    primary_member = None
    pm_name = r('primary_member_name').strip()
    if pm_name:
        members = household.member_set.filter(is_active=True)
        primary_member = _fuzzy_member(pm_name, members)

    opening_balance = _to_decimal(r('opening_balance') or '0')
    credit_limit_val = r('credit_limit')
    credit_limit = _to_decimal(credit_limit_val) if credit_limit_val else None
    due_day_val = r('statement_due_day')
    due_day = int(due_day_val) if due_day_val else None

    _, created = Account.objects.get_or_create(
        household=household,
        name=name,
        defaults={
            'account_type': acct_type,
            'institution_name': institution,
            'primary_member': primary_member,
            'opening_balance': opening_balance,
            'credit_limit': credit_limit,
            'statement_due_day': due_day,
        },
    )
    return 'created' if created else 'skipped'


def _import_members(household, row, mapping, defaults):
    from core.models import Member

    def r(field):
        return _resolve(row, mapping, defaults, field)

    full_name = r('full_name').strip()
    if not full_name:
        raise ValueError("full_name is required")

    email = r('email').strip()
    relation = (r('relation_type') or 'other').lower()

    _, created = Member.objects.get_or_create(
        household=household,
        full_name=full_name,
        defaults={
            'email': email,
            'relation_type': relation,
        },
    )
    return 'created' if created else 'skipped'
