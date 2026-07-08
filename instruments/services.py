from decimal import Decimal


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
