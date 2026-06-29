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

    start_date = _to_date(r('start_date'))

    # Optional date fields
    maturity_raw = r('maturity_date').strip()
    maturity_date = _to_date(maturity_raw) if maturity_raw else None
    end_raw = r('end_date').strip()
    end_date = _to_date(end_raw) if end_raw else None

    # Member lookup by name
    member = None
    member_name = r('member_name').strip()
    if member_name:
        member = _fuzzy_member(member_name, household.member_set.filter(is_active=True))

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
