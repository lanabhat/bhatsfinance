from datetime import date
from decimal import Decimal, ROUND_HALF_UP

# Sensible default Instrument.sub_category per instrument_type — used by
# import flows to auto-populate the field on creation. Never overwrites an
# existing (e.g. user-set) value; see default_sub_category() below.
_DEFAULT_SUB_CATEGORY_BY_TYPE = {
    'fd': 'debt',
    'rd': 'debt',
    'bond': 'debt',
    'equity': 'equity',
    'epf': 'retirement',
    'ppf': 'retirement',
    'nps': 'retirement',
    'gold': 'gold',
    'real_estate': 'real_asset',
    'cash': 'liquid',
}

_MF_CATEGORY_TO_SUB_CATEGORY = {
    'equity': 'equity',
    'debt': 'debt',
    'hybrid': 'hybrid',
    'liquid': 'liquid',
}


def default_sub_category(instrument_type: str, fund_category: str | None = None) -> str:
    """Best-guess Instrument.sub_category for a newly-created instrument.
    Returns '' (blank/unclassified) rather than guessing wrong — e.g. for
    mutual funds/SIPs with no fund_category yet, or types with no natural
    debt/equity/liquid/retirement mapping (vehicle, insurance, other, etc.)."""
    if instrument_type in ('mutual_fund', 'sip'):
        if fund_category:
            return _MF_CATEGORY_TO_SUB_CATEGORY.get(fund_category.strip().lower(), '')
        return ''
    return _DEFAULT_SUB_CATEGORY_BY_TYPE.get(instrument_type, '')


MF_SHELL_NAME = 'Mutual Fund'


def get_or_create_mf_shell(household):
    """Get (or create) the household's single shared "Mutual Fund" Instrument
    shell — every MF/SIP scheme/folio lives underneath it as an Investment
    row (see instruments.models.Investment), matching the shape the Milestone
    2 data migration (instruments/migrations/0015_migrate_mf_to_investment.py)
    put every existing household into. Callers that create new MF/SIP
    holdings (imports, Gmail-parsed proposals, etc.) should get-or-create an
    Investment under this shell rather than a new per-scheme Instrument."""
    from instruments.models import Instrument

    shell, _ = Instrument.objects.get_or_create(
        household=household, name=MF_SHELL_NAME,
        defaults={'instrument_type': Instrument.InstrumentType.MUTUAL_FUND, 'sub_category': ''},
    )
    return shell


EQUITY_SHELL_NAME = 'Equity'


def get_or_create_equity_shell(household):
    """Get (or create) the household's single shared "Equity" Instrument
    shell — every distinct stock a household holds lives underneath it as an
    Investment row (one per member, even for the same stock name), mirroring
    get_or_create_mf_shell() above. Without this, two members independently
    holding a same-named stock (e.g. both own HDFC Bank via separate Groww
    accounts) would collide on Instrument's (household, name) uniqueness and
    get silently merged into one shared holding with a split ownership
    percentage — the bug this shell exists to prevent going forward (see
    instruments/migrations/0017_split_shared_equity_instruments.py for the
    one-time fix to instruments already merged this way)."""
    from instruments.models import Instrument

    shell, _ = Instrument.objects.get_or_create(
        household=household, name=EQUITY_SHELL_NAME,
        defaults={'instrument_type': Instrument.InstrumentType.EQUITY, 'sub_category': Instrument.SubCategory.EQUITY},
    )
    return shell


def is_mutual_fund_isin(isin: str, name: str = '') -> bool:
    """True for a mutual fund unit held in demat (e.g. via an Upstox statement).
    INF ISINs are fund units — but ETFs are INF too and trade like stocks, and
    their scrip names always say so ("…ETF", "…BEES")."""
    upper_name = (name or '').upper()
    return (isin or '').upper().startswith('INF') and 'ETF' not in upper_name and 'BEES' not in upper_name


def is_bond_isin(isin: str) -> bool:
    """True for a bond/debenture ISIN, read from the ISIN's structure: a digit
    as the 3rd character marks a government security (G-sec/SDL, e.g.
    IN3920260020); for company ISINs (INE…), characters 8-9 give the security
    type — 07/08 are debentures/bonds, 01 is equity shares."""
    isin = (isin or '').upper()
    if len(isin) != 12 or not isin.startswith('IN'):
        return False
    return isin[2].isdigit() or (isin[2] == 'E' and isin[7:9] in ('07', '08'))


def holding_isin(obj) -> str:
    """The ISIN of an Investment/Instrument: `isin` when set, else `symbol` when it looks like one
    (imports have historically stored equity ISINs in `symbol`)."""
    isin = (getattr(obj, 'isin', '') or '').strip().upper()
    if isin:
        return isin
    symbol = (obj.symbol or '').strip().upper()
    return symbol if len(symbol) == 12 and symbol.startswith('IN') and symbol.isalnum() else ''


def find_bond_instruments(household, isin: str):
    from instruments.models import Instrument
    return Instrument.objects.filter(
        household=household, instrument_type=Instrument.InstrumentType.BOND, bond_details__isin=isin,
    ).distinct()


def _ledger_units(investment) -> Decimal:
    from insights.services import _signed_quantity
    from ledger.models import Transaction
    return sum((_signed_quantity(tx) for tx in Transaction.objects.filter(investment=investment)), start=Decimal('0'))


def move_investment_to_shell(investment, shell):
    """Move a holding (with its transactions and valuations) under another shell,
    e.g. a demat mutual fund an import filed under "Equity". If the target shell
    already holds the same member's same-ISIN investment, merge into that one
    instead so the move never creates a duplicate. Returns the surviving Investment."""
    from django.db import transaction as db_transaction
    from instruments.models import Investment
    from ledger.models import Transaction
    from valuations.models import ValuationSnapshot

    isin = holding_isin(investment)
    target = None
    if isin:
        target = next((
            inv for inv in Investment.objects.filter(instrument=shell, member=investment.member).exclude(pk=investment.pk)
            if holding_isin(inv) == isin
        ), None)

    with db_transaction.atomic():
        if target is None:
            Transaction.objects.filter(investment=investment).update(instrument=shell)
            ValuationSnapshot.objects.filter(investment=investment).update(instrument=shell)
            investment.instrument = shell
            if isin and not investment.isin:
                investment.isin = isin
            investment.save(update_fields=['instrument', 'isin', 'updated_at'])
            return investment

        Transaction.objects.filter(investment=investment).update(instrument=shell, investment=target)
        ValuationSnapshot.objects.filter(investment=investment).update(instrument=shell, investment=target)
        if not hasattr(target, 'external_fund') and hasattr(investment, 'external_fund'):
            fund = investment.external_fund
            fund.investment = target
            fund.save(update_fields=['investment', 'updated_at'])
        investment.delete()
        return target


def create_bond_instrument(household, member, name: str, isin: str):
    """A bond Instrument for a holding with no BondDetails yet: it keeps its imported
    value until coupon/maturity are added (which switches it to formula valuation)."""
    from instruments.models import Instrument, InstrumentOwnership

    base = name.strip() or isin
    candidate, n = base, 2
    while Instrument.objects.filter(household=household, name=candidate).exists():
        candidate, n = f'{base} ({n})', n + 1
    instrument = Instrument.objects.create(
        household=household, name=candidate, instrument_type=Instrument.InstrumentType.BOND,
        sub_category=Instrument.SubCategory.DEBT, symbol=isin,
    )
    if member:
        InstrumentOwnership.objects.create(instrument=instrument, member=member, allocation_percent=Decimal('100'))
    return instrument


def reclassify_bond_investment(investment) -> str:
    """Take a bond out of the Equity shell. Returns 'removed_duplicate' when bond
    Instruments with the same ISIN already hold exactly these units (the row was
    double-counting them), else 'converted' after moving it into a new bond Instrument."""
    from django.db import transaction as db_transaction
    from ledger.models import Transaction
    from valuations.models import ValuationSnapshot

    household = investment.instrument.household
    isin = holding_isin(investment)
    existing = list(find_bond_instruments(household, isin))
    existing_units = sum((bd.quantity for inst in existing for bd in inst.bond_details.all() if bd.isin == isin), start=0)

    with db_transaction.atomic():
        if existing and Decimal(existing_units) == _ledger_units(investment):
            Transaction.objects.filter(investment=investment).delete()
            ValuationSnapshot.objects.filter(investment=investment).delete()
            investment.delete()
            return 'removed_duplicate'

        bond = create_bond_instrument(household, investment.member, investment.name, isin)
        Transaction.objects.filter(investment=investment).update(instrument=bond, investment=None)
        ValuationSnapshot.objects.filter(investment=investment).update(instrument=bond, investment=None)
        investment.delete()
        return 'converted'


_COUPON_PERIODS_PER_YEAR = {
    'monthly': 12,
    'quarterly': 4,
    'half_yearly': 2,
    'annual': 1,
}


def coupon_amount(bond) -> Decimal:
    """One coupon payment for a bond, based on face_value * quantity * coupon_rate / periods_per_year."""
    n = _COUPON_PERIODS_PER_YEAR.get(bond.coupon_frequency)
    if not n:
        return Decimal('0.00')
    principal = bond.face_value * bond.quantity
    rate = bond.coupon_rate / Decimal('100')
    return (principal * rate / Decimal(str(n))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def first_coupon_due_date(bond) -> date:
    if bond.first_coupon_date:
        return bond.first_coupon_date
    return next_coupon_due_date(bond.investment_date, bond.coupon_frequency)


def next_coupon_due_date(base: date, frequency: str) -> date:
    n = _COUPON_PERIODS_PER_YEAR.get(frequency)
    if not n:
        return base
    months = 12 // n
    month = base.month - 1 + months
    year = base.year + month // 12
    month = month % 12 + 1
    day = min(base.day, 28)
    return date(year, month, day)


def compute_account_balance(account) -> dict:
    """
    Compute an account's current balance by anchoring on its latest
    ValuationSnapshot (or opening_balance if none exists) and rolling
    forward all transactions since that anchor.

    Returns Decimal-precise values under *_decimal keys (for callers doing
    further arithmetic, e.g. reports) alongside float values matching the
    shape AccountBalanceView has always returned.
    """
    from django.db.models import Sum

    from ledger.models import Transaction
    from valuations.models import ValuationSnapshot

    snapshot = (
        ValuationSnapshot.objects
        .filter(account=account)
        .order_by('-valuation_date', '-id')
        .first()
    )
    if snapshot:
        anchor_balance = Decimal(str(snapshot.balance))
        anchor_date = snapshot.valuation_date
        txs = Transaction.objects.filter(account=account, tx_date__gt=anchor_date, affects_balance=True)
    else:
        anchor_balance = Decimal(str(account.opening_balance))
        anchor_date = None
        txs = Transaction.objects.filter(account=account, affects_balance=True)

    total_inflow = txs.filter(direction=Transaction.Direction.INFLOW).aggregate(s=Sum('amount'))['s'] or Decimal('0')
    total_outflow = txs.filter(direction=Transaction.Direction.OUTFLOW).aggregate(s=Sum('amount'))['s'] or Decimal('0')
    total_inflow = Decimal(str(total_inflow))
    total_outflow = Decimal(str(total_outflow))
    current_balance = anchor_balance + total_inflow - total_outflow

    return {
        'anchor_balance': anchor_balance,
        'anchor_balance_float': float(anchor_balance),
        'anchor_date': anchor_date,
        'total_inflow': total_inflow,
        'total_inflow_float': float(total_inflow),
        'total_outflow': total_outflow,
        'total_outflow_float': float(total_outflow),
        'current_balance': current_balance,
        'current_balance_float': float(current_balance),
    }
