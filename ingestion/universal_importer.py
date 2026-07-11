"""
Universal importer: applies a user-defined column mapping to parsed rows
and creates the corresponding model records.
"""
import difflib
from datetime import date, datetime, timedelta
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


def _money(val) -> Decimal | None:
    """Convert to Decimal rounded to 2dp for monetary fields. Returns None if zero."""
    d = _to_decimal(val)
    if d == 0:
        return None
    return d.quantize(Decimal('0.01'))


def _to_date(val) -> date:
    if isinstance(val, date):
        return val
    s = str(val).strip()
    if not s:
        raise ValueError("Date value is empty")
    for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%d-%b-%Y', '%d-%b-%y'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {val!r}")


def _add_months(base: date, months: int) -> date:
    month_index = base.month - 1 + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    day = min(base.day, 28)
    return date(year, month, day)


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
        'insurance_policies': _import_insurance_policies,
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
            members = household.members.filter(is_active=True)
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
        members = household.members.filter(is_active=True)
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
        members = household.members.filter(is_active=True)
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


def _import_insurance_policies(household, row, mapping, defaults):
    from insurance.models import InsurancePolicy
    from instruments.models import Account
    from core.models import Member

    def r(field):
        return _resolve(row, mapping, defaults, field)

    policy_name = r('policy_name').strip()
    if not policy_name:
        raise ValueError("policy_name is required")

    policy_type = r('policy_type').strip().lower() or 'other'
    valid_types = ('life', 'health', 'vehicle', 'govt_scheme', 'other')
    if policy_type not in valid_types:
        raise ValueError(f"policy_type must be one of {valid_types}, got {policy_type!r}")

    def _opt_date(field):
        val = r(field).strip()
        return _to_date(val) if val else None

    start_raw = r('start_date').strip()
    if not start_raw:
        raise ValueError("start_date is required")
    start_date = _to_date(start_raw)

    maturity_date = _opt_date('maturity_date')
    end_date = _opt_date('end_date')

    # Member lookup by name
    member = None
    member_name = r('member_name').strip()
    if member_name:
        member = _fuzzy_member(member_name, household.members.filter(is_active=True))

    # Account lookup by name
    account = None
    account_name = r('account_name').strip()
    if account_name:
        try:
            account = Account.objects.get(household=household, name=account_name)
        except Account.DoesNotExist:
            pass

    premium_freq = r('premium_frequency').strip().lower() or 'annual'
    valid_freqs = ('annual', 'half_yearly', 'quarterly', 'monthly', 'single', 'na')
    if premium_freq not in valid_freqs:
        premium_freq = 'annual'

    vehicle_type = r('vehicle_type').strip().lower()
    coverage_type = r('coverage_type').strip().lower()

    due_day_raw = r('premium_due_day').strip()
    due_day = int(due_day_raw) if due_day_raw else None
    due_month_raw = r('premium_due_month').strip()
    due_month = int(due_month_raw) if due_month_raw else None
    grace_raw = r('grace_days').strip()
    grace_days = int(grace_raw) if grace_raw else 30

    employer_raw = r('is_employer_paid').strip().lower()
    is_employer_paid = employer_raw in ('true', '1', 'yes')

    sum_insured_raw = r('sum_insured').strip()
    sum_insured = _money(sum_insured_raw) if sum_insured_raw else None
    premium_raw = r('premium_amount').strip()
    premium_amount = _money(premium_raw) if premium_raw else None
    idv_raw = r('idv_amount').strip()
    idv_amount = _money(idv_raw) if idv_raw else None
    ncb_raw = r('ncb_percent').strip()
    ncb_percent = _to_decimal(ncb_raw).quantize(Decimal('0.01')) if ncb_raw else None

    _, created = InsurancePolicy.objects.get_or_create(
        household=household,
        policy_name=policy_name,
        policy_type=policy_type,
        defaults={
            'policy_subtype': r('policy_subtype').strip(),
            'policy_number': r('policy_number').strip(),
            'insurer_name': r('insurer_name').strip(),
            'member': member,
            'nominee_name': r('nominee_name').strip(),
            'nominee_relation': r('nominee_relation').strip(),
            'sum_insured': sum_insured,
            'premium_amount': premium_amount,
            'premium_frequency': premium_freq,
            'premium_due_day': due_day,
            'premium_due_month': due_month,
            'grace_days': grace_days,
            'start_date': start_date,
            'maturity_date': maturity_date,
            'end_date': end_date,
            'is_employer_paid': is_employer_paid,
            'account': account,
            'vehicle_type': vehicle_type,
            'coverage_type': coverage_type,
            'idv_amount': idv_amount,
            'ncb_percent': ncb_percent,
            'notes': r('notes').strip(),
        },
    )
    return 'created' if created else 'skipped'


# ---------------------------------------------------------------------------
# Groww-specific importer
# ---------------------------------------------------------------------------

def _get_or_create_broker_account(household, broker_name: str):
    """Get or create a broker account for the given household."""
    from instruments.models import Account
    account, _ = Account.objects.get_or_create(
        household=household,
        name=broker_name,
        defaults={'account_type': 'broker', 'institution_name': broker_name},
    )
    return account


def _get_asset_category(household, name: str):
    """Look up an AssetCategory by name for the household, case-insensitive."""
    from instruments.models import AssetCategory
    try:
        return AssetCategory.objects.get(household=household, name__iexact=name)
    except AssetCategory.DoesNotExist:
        return None


def apply_fd_advice_import(household, member, item: dict) -> dict:
    """
    Create/update an Instrument(type='fd') + FDDetails + InstrumentOwnership
    from a user-confirmed FD advice import item.

    Idempotent: get_or_create on the Instrument name, update_or_create on
    FDDetails (keyed on the OneToOne instrument), so re-importing a
    corrected/re-issued advice updates rather than errors.
    """
    from instruments.models import FDDetails, Instrument, InstrumentOwnership
    from ledger.models import Transaction
    from valuations.models import ValuationSnapshot
    from valuations.services import _compute_fd_value

    bank_name = (item.get('bank_name') or '').strip() or 'Bank'
    account_number = (item.get('account_number') or '').strip()

    instrument_name = (item.get('instrument_name') or '').strip()
    if not instrument_name:
        instrument_name = f'{bank_name} FD {account_number}' if account_number else f'{bank_name} FD'

    fd_category = _get_asset_category(household, 'Fixed Deposit')

    with db_transaction.atomic():
        instrument, inst_created = Instrument.objects.get_or_create(
            household=household,
            name=instrument_name,
            defaults={
                'instrument_type': Instrument.InstrumentType.FD,
                'symbol': account_number,
                'asset_category': fd_category,
            },
        )
        if not inst_created and not instrument.asset_category and fd_category:
            instrument.asset_category = fd_category
            instrument.save(update_fields=['asset_category'])

        investment_date = _to_date(item['investment_date'])
        principal = _to_decimal(item['principal'])

        maturity_value_raw = item.get('maturity_value')
        fd_details, fd_created = FDDetails.objects.update_or_create(
            instrument=instrument,
            defaults={
                'principal': principal,
                'annual_rate': _to_decimal(item['annual_rate']),
                'investment_date': investment_date,
                'maturity_date': _to_date(item['maturity_date']),
                'compounding': item.get('compounding') or 'quarterly',
                'maturity_value': _money(maturity_value_raw) if maturity_value_raw else None,
            },
        )

        if member:
            InstrumentOwnership.objects.get_or_create(
                instrument=instrument,
                member=member,
                defaults={'allocation_percent': Decimal('100')},
            )

        # Holdings are derived from Transaction history, so the deposit that
        # funded this FD must be recorded — mirrors the manual "Add FD" flow's
        # gap being filled the same way Groww/Upstox imports create an
        # initial buy transaction. Only create it once per instrument.
        # account is intentionally left unset: these FDs were opened in the
        # past, and the user's real savings account balances already reflect
        # that money having left long ago — debiting a real account here would
        # double-count it against the account's current (already-reduced) balance.
        if principal > 0 and not Transaction.objects.filter(instrument=instrument, household=household).exists():
            Transaction.objects.create(
                household=household,
                instrument=instrument,
                account=None,
                member=member,
                tx_date=investment_date,
                amount=principal,
                direction=Transaction.Direction.OUTFLOW,
                transaction_type=Transaction.TransactionType.DEPOSIT,
                currency='INR',
                source=Transaction.SourceType.CSV,
            )

        # Holdings/Net Worth read market_value from the latest ValuationSnapshot,
        # falling back to net_invested (principal) if none exists — without this,
        # an imported FD shows at its original principal instead of its accrued
        # current value even though FDDetails has everything needed to compute it.
        today = date.today()
        current_value = _compute_fd_value(fd_details, today)
        ValuationSnapshot.objects.update_or_create(
            household=household,
            instrument=instrument,
            account=None,
            valuation_date=today,
            defaults={'market_value': current_value, 'source': ValuationSnapshot.SourceType.CSV},
        )

    return {
        'instrument_id': instrument.id,
        'instrument_name': instrument.name,
        'created': inst_created,
        'fd_details_created': fd_created,
    }


def apply_rd_statement_import(household, member, item: dict, account) -> dict:
    """
    Create/update an Instrument(type='rd') + FDDetails (for maturity display)
    + InstrumentOwnership + RDMandate (for ongoing installment tracking) from
    a user-confirmed RD statement import item. Backfills RDPaymentAck records
    for installments the statement already proves were paid, so future
    missed-installment checks only flag genuinely future/unpaid months.

    `account` is a real, user-selected Account (instruments.models.Account)
    that future installments will be debited from via RDMandate.mark-paid —
    it is NOT used for the historical backfilled transactions below, since
    those installments were already paid in the past and the account's
    current balance already reflects that money having left.
    """
    from alerts.models import RDMandate, RDPaymentAck
    from ingestion.rd_maturity import compute_rd_maturity
    from instruments.models import FDDetails, Instrument, InstrumentOwnership
    from ledger.models import Transaction
    from valuations.models import ValuationSnapshot

    bank_name = (item.get('bank_name') or '').strip() or 'Bank'
    account_number = (item.get('account_number') or '').strip()

    instrument_name = (item.get('instrument_name') or '').strip()
    if not instrument_name:
        instrument_name = f'{bank_name} RD {account_number}' if account_number else f'{bank_name} RD'

    investment_date = _to_date(item['investment_date'])
    tenure_months = int(item['tenure_months'])
    annual_rate = _to_decimal(item['annual_rate'])
    installment_amount = _to_decimal(item['installment_amount'])
    compounding = item.get('compounding') or 'quarterly'

    maturity_date = _add_months(investment_date, tenure_months)
    maturity_value = compute_rd_maturity(installment_amount, annual_rate, tenure_months, compounding)

    current_balance_raw = item.get('current_balance')
    principal_display = _money(current_balance_raw) if current_balance_raw else installment_amount

    installments_backfilled = 0
    rd_category = _get_asset_category(household, 'Recurring Deposit')

    with db_transaction.atomic():
        instrument, inst_created = Instrument.objects.get_or_create(
            household=household,
            name=instrument_name,
            defaults={
                'instrument_type': Instrument.InstrumentType.RD,
                'symbol': account_number,
                'asset_category': rd_category,
            },
        )
        if not inst_created and not instrument.asset_category and rd_category:
            instrument.asset_category = rd_category
            instrument.save(update_fields=['asset_category'])

        FDDetails.objects.update_or_create(
            instrument=instrument,
            defaults={
                'principal': principal_display,
                'annual_rate': annual_rate,
                'investment_date': investment_date,
                'maturity_date': maturity_date,
                'compounding': compounding,
                'maturity_value': maturity_value,
            },
        )

        if member:
            InstrumentOwnership.objects.get_or_create(
                instrument=instrument,
                member=member,
                defaults={'allocation_percent': Decimal('100')},
            )

        due_day = min(investment_date.day, 28)
        mandate, _mandate_created = RDMandate.objects.update_or_create(
            instrument=instrument,
            household=household,
            defaults={
                'account': account,
                'member': member,
                'installment_amount': installment_amount,
                'frequency': RDMandate.Frequency.MONTHLY,
                'due_day': due_day,
                'start_date': investment_date,
                'tenure_months': tenure_months,
                'end_date': maturity_date,
                'is_active': True,
            },
        )

        # Holdings are derived from Transaction history, so each installment
        # the statement proves was paid must be recorded as a deposit — this
        # also satisfies generate_missed_rd_installments' ack-exists check
        # (see alerts.services.generate_missed_rd_installments), so backfilled
        # months correctly stop showing as due even though these transactions
        # have no account set.
        installment_count = int(item.get('installment_count_observed') or 0)
        for months_elapsed in range(installment_count):
            due = _add_months(investment_date, months_elapsed).replace(day=min(due_day, 28))
            _, tx_created = Transaction.objects.get_or_create(
                household=household,
                instrument=instrument,
                account=None,
                tx_date=due,
                idempotency_key=f'rd-import-{instrument.id}-{due.isoformat()}',
                defaults={
                    'member': member,
                    'amount': installment_amount,
                    'direction': Transaction.Direction.OUTFLOW,
                    'transaction_type': Transaction.TransactionType.DEPOSIT,
                    'currency': 'INR',
                    'source': Transaction.SourceType.CSV,
                },
            )
            if tx_created:
                installments_backfilled += 1
            RDPaymentAck.objects.get_or_create(
                mandate=mandate,
                due_date=due,
                defaults={'acknowledged_on': due, 'note': 'Backfilled from imported statement'},
            )

        # Holdings/Net Worth read market_value from the latest ValuationSnapshot.
        # RD's current value is the statement's accrued balance (principal_display),
        # not a formula projection — the bank has already told us the real figure.
        ValuationSnapshot.objects.update_or_create(
            household=household,
            instrument=instrument,
            account=None,
            valuation_date=date.today(),
            defaults={'market_value': principal_display, 'source': ValuationSnapshot.SourceType.CSV},
        )

    return {
        'instrument_id': instrument.id,
        'instrument_name': instrument.name,
        'mandate_id': mandate.id,
        'installments_backfilled': installments_backfilled,
        'created': inst_created,
    }


def apply_nps_statement_import(household, member, item: dict, account=None, affects_balance: bool = False) -> dict:
    """
    Create/update a Tier-specific NPS Instrument + backfill contribution/fee
    Transactions + a ValuationSnapshot from a user-confirmed, parsed NPS
    transaction statement (see ingestion.nps_parser.parse_nps_statement).

    Tier I and Tier II are tracked as separate Instrument rows ('NPS Tier I',
    'NPS Tier II') since they're functionally distinct sub-accounts with their
    own contribution history and valuation — each statement (which only ever
    covers one tier) targets its own instrument. Scheme (E/C/G) stays as
    Transaction metadata rather than a further split, since the statement
    already reports one combined value/contribution total per tier.

    Contributions are salary-deducted before the money ever reaches a tracked
    account, so `affects_balance` defaults to False even when an `account` is
    supplied for tagging/filtering — the account's live balance would
    otherwise be double-counted against a debit that was never actually seen
    by that account.
    """
    from instruments.models import Instrument, InstrumentOwnership
    from ledger.models import Transaction
    from valuations.models import ValuationSnapshot

    tier = item.get('tier', '')
    instrument_name = (item.get('instrument_name') or '').strip() or (f'NPS Tier {tier}' if tier else 'NPS')
    nps_category = _get_asset_category(household, 'NPS') or _get_asset_category(household, 'Retirement')

    schemes = item.get('schemes') or []
    statement_date = _to_date(item['statement_date']) if item.get('statement_date') else date.today()
    total_value = _to_decimal(item['total_value']) if item.get('total_value') else None
    total_contribution = _to_decimal(item['total_contribution']) if item.get('total_contribution') else None

    contributions_created = 0
    fees_created = 0
    backfilled = False

    with db_transaction.atomic():
        instrument, inst_created = Instrument.objects.get_or_create(
            household=household,
            name=instrument_name,
            defaults={
                'instrument_type': Instrument.InstrumentType.NPS,
                'symbol': item.get('pran', ''),
                'asset_category': nps_category,
            },
        )
        if not inst_created and not instrument.asset_category and nps_category:
            instrument.asset_category = nps_category
            instrument.save(update_fields=['asset_category'])

        if member:
            InstrumentOwnership.objects.get_or_create(
                instrument=instrument,
                member=member,
                defaults={'allocation_percent': Decimal('100')},
            )

        for scheme in schemes:
            scheme_key = f"{scheme['tier']}-{scheme['scheme']}"
            for tx in scheme.get('transactions', []):
                amount = _to_decimal(tx['amount']) if tx.get('amount') else None
                if amount is None or amount == 0:
                    continue
                quantity = _to_decimal(tx['units']) if tx.get('units') else None
                price_per_unit = _to_decimal(tx['nav']) if tx.get('nav') else None

                kind = tx.get('kind')
                if kind == 'contribution':
                    # Money going into the instrument — same convention as
                    # apply_fd_advice_import's funding deposit.
                    transaction_type = Transaction.TransactionType.BUY
                    direction = Transaction.Direction.OUTFLOW
                else:
                    # 'billing' (quarterly PFM charge) or any other scheme
                    # ledger line that reduces units — units leave the
                    # instrument, so it reads as a sell.
                    transaction_type = Transaction.TransactionType.SELL
                    direction = Transaction.Direction.INFLOW

                _, tx_created = Transaction.objects.get_or_create(
                    household=household,
                    instrument=instrument,
                    tx_date=tx['tx_date'],
                    idempotency_key=f"nps-import-{instrument.id}-{scheme_key}-{tx['tx_date']}-{kind}",
                    defaults={
                        'member': member,
                        'account': account,
                        'amount': abs(amount),
                        'quantity': abs(quantity) if quantity is not None else None,
                        'price_per_unit': price_per_unit,
                        'direction': direction,
                        'transaction_type': transaction_type,
                        'currency': 'INR',
                        'source': Transaction.SourceType.CSV,
                        'affects_balance': affects_balance if account else True,
                        'description': tx.get('description', ''),
                        'metadata': {'nps_tier': scheme['tier'], 'nps_scheme': scheme['scheme']},
                    },
                )
                if tx_created:
                    if kind == 'contribution':
                        contributions_created += 1
                    elif kind == 'billing':
                        fees_created += 1

        # The statement only lists transactions for the period it covers (e.g.
        # the current financial year), but `total_contribution` is the
        # subscriber's full lifetime contribution to this tier. Without a
        # backfill, net_invested (summed purely from imported Transactions)
        # would only reflect this period, making gain = market_value -
        # net_invested wildly overstated. Backfill the gap as a single
        # historical buy dated just before this statement's earliest imported
        # row, keyed per-tier so re-importing (or importing the other tier)
        # doesn't double-count it.
        if total_contribution is not None:
            all_tx_dates = [
                tx['tx_date']
                for scheme in schemes
                for tx in scheme.get('transactions', [])
                if tx.get('kind') == 'contribution'
            ]
            earliest_date = min(all_tx_dates) if all_tx_dates else statement_date
            backfill_date = _to_date(earliest_date) - timedelta(days=1)

            statement_contribution_total = sum(
                (_to_decimal(tx['amount']) or Decimal('0'))
                for scheme in schemes
                for tx in scheme.get('transactions', [])
                if tx.get('kind') == 'contribution'
            )
            backfill_amount = total_contribution - statement_contribution_total

            if backfill_amount > 0:
                _, backfill_created = Transaction.objects.get_or_create(
                    household=household,
                    instrument=instrument,
                    tx_date=backfill_date,
                    idempotency_key=f"nps-import-{instrument.id}-tier{tier}-opening-contribution",
                    defaults={
                        'member': member,
                        'account': None,
                        'amount': backfill_amount,
                        'direction': Transaction.Direction.OUTFLOW,
                        'transaction_type': Transaction.TransactionType.BUY,
                        'currency': 'INR',
                        'source': Transaction.SourceType.CSV,
                        'affects_balance': True,
                        'description': f'NPS Tier {tier} contributions before this statement\'s period',
                        'metadata': {'nps_tier': tier, 'nps_backfill': True},
                    },
                )
                backfilled = backfilled or backfill_created

        if total_value is not None:
            ValuationSnapshot.objects.update_or_create(
                household=household,
                instrument=instrument,
                account=None,
                valuation_date=statement_date,
                defaults={
                    'market_value': total_value,
                    'source': ValuationSnapshot.SourceType.CSV,
                },
            )

    return {
        'instrument_id': instrument.id,
        'instrument_name': instrument.name,
        'created': inst_created,
        'contributions_created': contributions_created,
        'fees_created': fees_created,
        'opening_contribution_backfilled': backfilled,
    }


def apply_epf_passbook_import(household, member, item: dict) -> dict:
    """
    Create/update a single household 'EPF' Instrument + backfill monthly
    contribution Transactions + a ValuationSnapshot from a user-confirmed,
    parsed EPFO Member Passbook (one financial year per import — see
    ingestion.epf_parser.parse_epf_passbook).

    EPF reports three sub-buckets (Employee/Employer/Pension) under one UAN,
    unlike NPS's genuinely separate Tier I/II accounts — so all three roll up
    into one Instrument, with each contribution month split into 3
    metadata-tagged Transactions (one per bucket) rather than 3 instruments.

    EPF contributions are deducted from salary before the money ever reaches
    a tracked account, so these transactions are never linked to an account
    and always affects_balance=True is moot (account is always None here) —
    matches the FD/RD/NPS backfill convention of leaving account unset for
    historical employer-side money movements.
    """
    from instruments.models import Instrument, InstrumentOwnership
    from ledger.models import Transaction
    from valuations.models import ValuationSnapshot

    epf_category = _get_asset_category(household, 'EPF') or _get_asset_category(household, 'Retirement')

    instrument, inst_created = Instrument.objects.get_or_create(
        household=household,
        name='EPF',
        defaults={
            'instrument_type': Instrument.InstrumentType.EPF,
            'symbol': item.get('uan', ''),
            'asset_category': epf_category,
        },
    )
    if not inst_created and not instrument.asset_category and epf_category:
        instrument.asset_category = epf_category
        instrument.save(update_fields=['asset_category'])
    if not instrument.symbol and item.get('uan'):
        instrument.symbol = item['uan']
        instrument.save(update_fields=['symbol'])

    contributions_created = 0
    opening_backfilled = False

    with db_transaction.atomic():
        if member:
            InstrumentOwnership.objects.get_or_create(
                instrument=instrument,
                member=member,
                defaults={'allocation_percent': Decimal('100')},
            )

        opening_date = _to_date(item['opening_date'])
        opening_total = (
            _to_decimal(item['opening_employee'])
            + _to_decimal(item['opening_employer'])
            + _to_decimal(item['opening_pension'])
        )
        # Each financial year's passbook restates the prior year's closing
        # balance as its own "opening balance" line, so backfilling it from
        # every imported file would double-count every earlier year's
        # contributions and interest. Only seed an opening-balance entry if
        # this is the earliest data seen for this instrument so far — i.e.
        # no transaction already exists at or after this date. This assumes
        # passbooks are imported in chronological order (oldest FY first);
        # importing out of order raises rather than silently double-counting.
        earliest_existing = (
            Transaction.objects.filter(instrument=instrument).order_by('tx_date').values_list('tx_date', flat=True).first()
        )
        if earliest_existing is not None and opening_date < earliest_existing:
            raise ValueError(
                f'This passbook\'s opening balance ({opening_date.isoformat()}) is earlier than '
                f'transactions already imported for this instrument (earliest: {earliest_existing.isoformat()}). '
                'Import EPF passbooks in chronological order, oldest financial year first.'
            )
        has_history = earliest_existing is not None
        if opening_total > 0 and not has_history:
            _, opening_created = Transaction.objects.get_or_create(
                household=household,
                instrument=instrument,
                tx_date=opening_date,
                idempotency_key=f"epf-import-{instrument.id}-opening-{opening_date.isoformat()}",
                defaults={
                    'member': member,
                    'account': None,
                    'amount': opening_total,
                    'direction': Transaction.Direction.OUTFLOW,
                    'transaction_type': Transaction.TransactionType.BUY,
                    'currency': 'INR',
                    'source': Transaction.SourceType.CSV,
                    'affects_balance': True,
                    'description': f'EPF opening balance as of {opening_date.isoformat()}',
                    'metadata': {'epf_bucket': 'opening'},
                },
            )
            opening_backfilled = opening_backfilled or opening_created

        for tx in item.get('transactions', []):
            tx_date = _to_date(tx['tx_date'])
            for bucket in ('employee', 'employer', 'pension'):
                amount = _to_decimal(tx.get(bucket)) if tx.get(bucket) else None
                if amount is None or amount == 0:
                    continue
                _, tx_created = Transaction.objects.get_or_create(
                    household=household,
                    instrument=instrument,
                    tx_date=tx_date,
                    idempotency_key=f"epf-import-{instrument.id}-{bucket}-{tx_date.isoformat()}",
                    defaults={
                        'member': member,
                        'account': None,
                        'amount': amount,
                        'direction': Transaction.Direction.OUTFLOW,
                        'transaction_type': Transaction.TransactionType.BUY,
                        'currency': 'INR',
                        'source': Transaction.SourceType.CSV,
                        'affects_balance': True,
                        'description': f"{tx.get('description', '')} ({bucket})".strip(),
                        'metadata': {'epf_bucket': bucket, 'wage_month': tx.get('wage_month', '')},
                    },
                )
                if tx_created:
                    contributions_created += 1

        closing_date = _to_date(item['closing_date'])
        closing_total = (
            _to_decimal(item['closing_employee'])
            + _to_decimal(item['closing_employer'])
            + _to_decimal(item['closing_pension'])
        )
        ValuationSnapshot.objects.update_or_create(
            household=household,
            instrument=instrument,
            account=None,
            valuation_date=closing_date,
            defaults={
                'market_value': closing_total,
                'source': ValuationSnapshot.SourceType.CSV,
            },
        )

    return {
        'instrument_id': instrument.id,
        'instrument_name': instrument.name,
        'created': inst_created,
        'contributions_created': contributions_created,
        'opening_balance_backfilled': opening_backfilled,
    }


def apply_ppf_statement_import(household, member, item: dict, estimated_prior_principal: Decimal | None = None) -> dict:
    """
    Create/update a single household 'PPF' Instrument + backfill deposit/
    interest Transactions + a ValuationSnapshot from a user-confirmed, parsed
    HDFC PPF account statement (see ingestion.ppf_parser.parse_ppf_statement).

    Bank PPF statements typically only cover a recent window (e.g. the past
    year), not the account's full history since opening — the statement's
    own `opening_balance` is a real number but its principal/interest split
    for the pre-statement period is unknown. Rather than guessing, the caller
    supplies `estimated_prior_principal` (the user's own best estimate of how
    much of the opening balance is actual deposits vs. accumulated interest);
    the shortfall (opening_balance - estimated_prior_principal) is treated as
    unattributed prior-years' interest and is folded into the valuation
    snapshot only — never counted as invested — same principle as the NPS/EPF
    importers' opening-balance backfills, just with an explicit user estimate
    standing in for data the bank won't provide.

    Idempotent and safe to re-run: deposit/interest rows are keyed by date,
    and the opening-balance backfill only fires once (guarded the same way
    as the EPF importer — raises rather than silently double-counting if
    statements are imported out of chronological order).
    """
    from instruments.models import Instrument, InstrumentOwnership
    from ledger.models import Transaction
    from valuations.models import ValuationSnapshot

    ppf_category = _get_asset_category(household, 'PPF') or _get_asset_category(household, 'Retirement')

    instrument, inst_created = Instrument.objects.get_or_create(
        household=household,
        name='PPF',
        defaults={
            'instrument_type': Instrument.InstrumentType.PPF,
            'symbol': item.get('account_no', ''),
            'asset_category': ppf_category,
        },
    )
    if not inst_created and not instrument.asset_category and ppf_category:
        instrument.asset_category = ppf_category
        instrument.save(update_fields=['asset_category'])
    if not instrument.symbol and item.get('account_no'):
        instrument.symbol = item['account_no']
        instrument.save(update_fields=['symbol'])

    contributions_created = 0
    interest_created = 0
    opening_backfilled = False

    with db_transaction.atomic():
        if member:
            InstrumentOwnership.objects.get_or_create(
                instrument=instrument,
                member=member,
                defaults={'allocation_percent': Decimal('100')},
            )

        statement_from = _to_date(item['statement_from'])
        opening_balance = _to_decimal(item['opening_balance'])
        prior_principal = (
            estimated_prior_principal if estimated_prior_principal is not None else opening_balance
        )
        prior_principal = max(min(prior_principal, opening_balance), Decimal('0'))
        prior_interest = opening_balance - prior_principal

        # Same ordering guard as apply_epf_passbook_import: only seed the
        # opening-balance backfill if this is the earliest data seen for this
        # instrument so far, and refuse (rather than silently double-count)
        # if an earlier statement is imported after a later one already has
        # history recorded.
        earliest_existing = (
            Transaction.objects.filter(instrument=instrument).order_by('tx_date').values_list('tx_date', flat=True).first()
        )
        if earliest_existing is not None and statement_from < earliest_existing:
            raise ValueError(
                f'This statement\'s opening balance ({statement_from.isoformat()}) is earlier than '
                f'transactions already imported for this instrument (earliest: {earliest_existing.isoformat()}). '
                'Import PPF statements in chronological order, oldest first.'
            )
        has_history = earliest_existing is not None
        if opening_balance > 0 and not has_history:
            backfill_date = statement_from - timedelta(days=1)
            if prior_principal > 0:
                _, opening_created = Transaction.objects.get_or_create(
                    household=household,
                    instrument=instrument,
                    tx_date=backfill_date,
                    idempotency_key=f"ppf-import-{instrument.id}-opening-principal-{backfill_date.isoformat()}",
                    defaults={
                        'member': member,
                        'account': None,
                        'amount': prior_principal,
                        'direction': Transaction.Direction.OUTFLOW,
                        'transaction_type': Transaction.TransactionType.BUY,
                        'currency': 'INR',
                        'source': Transaction.SourceType.CSV,
                        'affects_balance': True,
                        'description': f'PPF deposits before {statement_from.isoformat()} (user estimate)',
                        'metadata': {'ppf_bucket': 'opening_principal', 'estimated': True},
                    },
                )
                opening_backfilled = opening_backfilled or opening_created

        for tx in item.get('transactions', []):
            kind = tx.get('kind', 'deposit')
            if kind == 'interest':
                # Interest credits are not recorded as Transactions: PPF's
                # market_value comes entirely from the flat ValuationSnapshot
                # closing_balance below (not net_invested + growth), so an
                # interest row here would add nothing to market_value while
                # incorrectly inflating net_invested (compute_holdings' cost
                # basis is driven by direction, not transaction_type — an
                # INTEREST-typed row would still count as invested principal
                # and understate the real return). The snapshot already
                # reflects the interest; nothing further to record.
                interest_created += 1
                continue

            amount = _to_decimal(tx['amount']) if tx.get('amount') else None
            if amount is None or amount == 0:
                continue
            tx_date = _to_date(tx['tx_date'])
            direction = tx.get('direction', 'deposit')
            tx_direction = Transaction.Direction.OUTFLOW if direction == 'deposit' else Transaction.Direction.INFLOW

            _, tx_created = Transaction.objects.get_or_create(
                household=household,
                instrument=instrument,
                tx_date=tx_date,
                idempotency_key=f"ppf-import-{instrument.id}-{kind}-{tx_date.isoformat()}",
                defaults={
                    'member': member,
                    'account': None,
                    'amount': amount,
                    'direction': tx_direction,
                    'transaction_type': Transaction.TransactionType.BUY,
                    'currency': 'INR',
                    'source': Transaction.SourceType.CSV,
                    'affects_balance': True,
                    'description': tx.get('description', ''),
                    'metadata': {'ppf_bucket': kind},
                },
            )
            if tx_created:
                contributions_created += 1

        statement_to = _to_date(item['statement_to'])
        closing_balance = _to_decimal(item['closing_balance']) if item.get('closing_balance') else None
        if closing_balance is not None:
            # Fold the unattributed prior-years' interest estimate into every
            # snapshot for this instrument (not just this one), so it isn't
            # lost if a later statement's snapshot supersedes this one.
            ValuationSnapshot.objects.update_or_create(
                household=household,
                instrument=instrument,
                account=None,
                valuation_date=statement_to,
                defaults={
                    'market_value': closing_balance,
                    'source': ValuationSnapshot.SourceType.CSV,
                    'notes': (
                        f'Includes an estimated ₹{prior_interest} of pre-statement interest '
                        f'(bank could not provide full history since account opening).'
                        if prior_interest > 0 else ''
                    ),
                },
            )

    return {
        'instrument_id': instrument.id,
        'instrument_name': instrument.name,
        'created': inst_created,
        'contributions_created': contributions_created,
        'interest_created': interest_created,
        'opening_balance_backfilled': opening_backfilled,
        'estimated_prior_interest': str(prior_interest),
    }


def apply_groww_import(household, member, parsed: dict) -> dict:
    """
    Import a parsed Groww Excel file (output of groww_parser.parse_groww_excel)
    for a specific household member.

    Creates Instruments, InstrumentOwnerships, ValuationSnapshots, and initial
    buy Transactions (only if no transaction exists yet for that instrument).
    All operations are idempotent — safe to re-run with the same file.
    """
    from instruments.models import Instrument, InstrumentOwnership
    from valuations.models import ValuationSnapshot
    from ledger.models import Transaction

    valuation_date = parsed['valuation_date']
    stocks_created = 0
    mf_created = 0
    valuations_created = 0
    errors = []

    member_label = member.full_name if member else None
    account_name = f'Groww ({member_label})' if member_label else 'Groww'
    groww_account = _get_or_create_broker_account(household, account_name)
    stocks_category = _get_asset_category(household, 'Stocks')
    mf_category = _get_asset_category(household, 'Mutual Fund')

    # ── Stocks ────────────────────────────────────────────────────────────────
    for i, stock in enumerate(parsed.get('stocks', []), start=1):
        try:
            with db_transaction.atomic():
                name = stock['name'].strip()
                if not name:
                    continue

                instrument, created = Instrument.objects.get_or_create(
                    household=household,
                    name=name,
                    defaults={
                        'instrument_type': 'equity',
                        'symbol': stock.get('isin', ''),
                        'default_account': groww_account,
                        'asset_category': stocks_category,
                    },
                )
                if created:
                    stocks_created += 1
                else:
                    # Update missing fields on existing instruments
                    update_fields = []
                    if not instrument.default_account:
                        instrument.default_account = groww_account
                        update_fields.append('default_account')
                    if not instrument.asset_category and stocks_category:
                        instrument.asset_category = stocks_category
                        update_fields.append('asset_category')
                    if update_fields:
                        instrument.save(update_fields=update_fields)

                qty = _to_decimal(stock.get('quantity') or '0').quantize(Decimal('0.0001'))
                closing_price = _money(stock.get('closing_price') or '0')
                closing_value = _money(stock.get('closing_value') or '0')
                avg_price = _money(stock.get('avg_buy_price') or '0')
                buy_value = _money(stock.get('buy_value') or '0')

                # Create buy tx for this member if they don't already have one
                if member and not Transaction.objects.filter(instrument=instrument, household=household, member=member, transaction_type='buy').exists():
                    if qty > 0 and buy_value:
                        Transaction.objects.create(
                            household=household,
                            instrument=instrument,
                            account=groww_account,
                            member=member,
                            tx_date=valuation_date,
                            amount=buy_value,
                            quantity=qty,
                            price_per_unit=avg_price,
                            direction='outflow',
                            transaction_type='buy',
                            currency='INR',
                            source='csv',
                        )

                # Recalculate allocation_percent for all owners based on their quantities
                # Total quantity = sum of each member's buy transactions
                all_buy_txs = Transaction.objects.filter(instrument=instrument, household=household, transaction_type='buy', direction='outflow')
                total_qty = sum((_to_decimal(str(t.quantity or 0)) for t in all_buy_txs), Decimal('0'))

                if total_qty > 0:
                    for tx in all_buy_txs:
                        tx_qty = _to_decimal(str(tx.quantity or 0))
                        alloc = (tx_qty / total_qty * 100).quantize(Decimal('0.01'))
                        if tx.member_id:
                            InstrumentOwnership.objects.update_or_create(
                                instrument=instrument,
                                member_id=tx.member_id,
                                defaults={'allocation_percent': alloc},
                            )
                else:
                    InstrumentOwnership.objects.get_or_create(
                        instrument=instrument,
                        member=member,
                        defaults={'allocation_percent': Decimal('100')},
                    )

                # Valuation = sum of all members' closing values for this instrument
                all_buy_txs_fresh = Transaction.objects.filter(instrument=instrument, household=household, transaction_type='buy', direction='outflow')
                total_closing_value = Decimal('0')
                for tx in all_buy_txs_fresh:
                    tx_qty = _to_decimal(str(tx.quantity or 0))
                    if total_qty > 0 and closing_price:
                        total_closing_value += tx_qty * closing_price
                if not total_closing_value and closing_value:
                    total_closing_value = closing_value

                _, snap_created = ValuationSnapshot.objects.update_or_create(
                    household=household,
                    instrument=instrument,
                    account=None,
                    valuation_date=valuation_date,
                    defaults={
                        'unit_price': closing_price,
                        'market_value': total_closing_value or closing_value,
                        'source': 'csv',
                    },
                )
                if snap_created:
                    valuations_created += 1

        except Exception as e:
            errors.append({'section': 'stocks', 'row': i, 'name': stock.get('name', ''), 'reason': str(e)})

    # ── Mutual Funds ──────────────────────────────────────────────────────────
    for i, mf in enumerate(parsed.get('mutual_funds', []), start=1):
        try:
            with db_transaction.atomic():
                base_name = mf['scheme_name'].strip()
                if not base_name:
                    continue

                # Use folio number as the disambiguator — each folio is a separate holding
                # even if the scheme name is identical (same person, two folios; or two people).
                folio_no = mf.get('folio_no', '').strip()
                name = f'{base_name} ({folio_no})' if folio_no else base_name

                instrument, created = Instrument.objects.get_or_create(
                    household=household,
                    name=name,
                    defaults={
                        'instrument_type': 'mutual_fund',
                        'symbol': folio_no,
                        'default_account': groww_account,
                        'asset_category': mf_category,
                        'metadata': {
                            'amc': mf.get('amc', ''),
                            'category': mf.get('category', ''),
                            'sub_category': mf.get('sub_category', ''),
                        },
                    },
                )
                if created:
                    mf_created += 1
                else:
                    update_fields = []
                    if not instrument.default_account:
                        instrument.default_account = groww_account
                        update_fields.append('default_account')
                    if not instrument.asset_category and mf_category:
                        instrument.asset_category = mf_category
                        update_fields.append('asset_category')
                    if update_fields:
                        instrument.save(update_fields=update_fields)

                InstrumentOwnership.objects.get_or_create(
                    instrument=instrument,
                    member=member,
                    defaults={'allocation_percent': Decimal('100')},
                )

                current_value = _money(mf.get('current_value') or '0')

                _, snap_created = ValuationSnapshot.objects.update_or_create(
                    household=household,
                    instrument=instrument,
                    account=None,
                    valuation_date=valuation_date,
                    defaults={
                        'market_value': current_value,
                        'source': 'csv',
                    },
                )
                if snap_created:
                    valuations_created += 1

                # Create initial buy transaction only if none exists yet
                if not Transaction.objects.filter(instrument=instrument, household=household).exists():
                    units = _to_decimal(mf.get('units') or '0').quantize(Decimal('0.0001'))
                    invested = _money(mf.get('invested_value') or '0')
                    if invested:
                        avg_nav = _money(invested / units) if units > 0 else None
                        Transaction.objects.create(
                            household=household,
                            instrument=instrument,
                            account=groww_account,
                            member=member,
                            tx_date=valuation_date,
                            amount=invested,
                            quantity=units if units > 0 else None,
                            price_per_unit=avg_nav,
                            direction='outflow',
                            transaction_type='buy',
                            currency='INR',
                            source='csv',
                        )
        except Exception as e:
            errors.append({'section': 'mutual_funds', 'row': i, 'name': mf.get('scheme_name', ''), 'reason': str(e)})

    return {
        'stocks_created': stocks_created,
        'mf_created': mf_created,
        'valuations_created': valuations_created,
        'errors': errors,
    }


def apply_upstox_import(household, member, parsed: dict) -> dict:
    """
    Import a parsed Upstox holdings Excel file for a specific household member.
    Creates Instruments (equity), InstrumentOwnerships, ValuationSnapshots,
    and initial buy Transactions if none exist.
    """
    from instruments.models import Instrument, InstrumentOwnership
    from valuations.models import ValuationSnapshot
    from ledger.models import Transaction

    created = 0
    updated = 0
    errors = []

    member_label = member.full_name if member else None
    account_name = f'Upstox ({member_label})' if member_label else 'Upstox'
    upstox_account = _get_or_create_broker_account(household, account_name)
    stocks_category = _get_asset_category(household, 'Stocks')

    for i, h in enumerate(parsed.get('holdings', []), start=1):
        try:
            with db_transaction.atomic():
                name = h['name'].strip()
                if not name:
                    continue

                vd = _to_date(h.get('value_date') or str(parsed['valuation_date']))
                quantity = _to_decimal(h.get('quantity') or '0').quantize(Decimal('0.0001'))
                rate = _money(h.get('rate') or '0')
                valuation = _money(h.get('valuation') or '0')

                instrument, inst_created = Instrument.objects.get_or_create(
                    household=household,
                    name=name,
                    defaults={
                        'instrument_type': 'equity',
                        'symbol': h.get('isin', ''),
                        'default_account': upstox_account,
                        'asset_category': stocks_category,
                    },
                )

                if not inst_created:
                    update_fields = []
                    if not instrument.default_account:
                        instrument.default_account = upstox_account
                        update_fields.append('default_account')
                    if not instrument.asset_category and stocks_category:
                        instrument.asset_category = stocks_category
                        update_fields.append('asset_category')
                    if update_fields:
                        instrument.save(update_fields=update_fields)

                # Create buy tx for this member if they don't already have one
                if member and not Transaction.objects.filter(instrument=instrument, household=household, member=member, transaction_type='buy').exists():
                    if quantity > 0 and valuation > 0:
                        Transaction.objects.create(
                            household=household,
                            instrument=instrument,
                            account=upstox_account,
                            member=member,
                            tx_date=vd,
                            amount=valuation,
                            quantity=quantity,
                            price_per_unit=rate,
                            direction='outflow',
                            transaction_type='buy',
                            currency='INR',
                            source='csv',
                        )

                # Recalculate allocation_percent for all owners based on their quantities
                all_buy_txs = Transaction.objects.filter(instrument=instrument, household=household, transaction_type='buy', direction='outflow')
                total_qty = sum((_to_decimal(str(t.quantity or 0)) for t in all_buy_txs), Decimal('0'))

                if total_qty > 0:
                    for tx in all_buy_txs:
                        tx_qty = _to_decimal(str(tx.quantity or 0))
                        alloc = (tx_qty / total_qty * 100).quantize(Decimal('0.01'))
                        if tx.member_id:
                            InstrumentOwnership.objects.update_or_create(
                                instrument=instrument,
                                member_id=tx.member_id,
                                defaults={'allocation_percent': alloc},
                            )
                elif member:
                    InstrumentOwnership.objects.get_or_create(
                        instrument=instrument,
                        member=member,
                        defaults={'allocation_percent': Decimal('100')},
                    )

                # Valuation = total quantity across all members × unit price
                total_qty_fresh = sum((_to_decimal(str(t.quantity or 0)) for t in all_buy_txs), Decimal('0'))
                total_value = total_qty_fresh * rate if rate and total_qty_fresh else valuation

                ValuationSnapshot.objects.update_or_create(
                    household=household,
                    instrument=instrument,
                    account=None,
                    valuation_date=vd,
                    defaults={
                        'unit_price': rate,
                        'market_value': total_value,
                        'source': 'csv',
                    },
                )

                if inst_created:
                    created += 1
                else:
                    updated += 1

        except Exception as e:
            errors.append({'row': i, 'name': h.get('name', ''), 'reason': str(e)})

    return {
        'holdings_created': created,
        'holdings_updated': updated,
        'errors': errors,
    }
