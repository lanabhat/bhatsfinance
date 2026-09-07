from datetime import date
from decimal import Decimal, ROUND_HALF_UP

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
