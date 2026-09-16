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
