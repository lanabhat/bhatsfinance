from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from valuations.models import NetWorthSnapshot, ValuationSnapshot


ZERO = Decimal('0.00')

_COMPOUNDING_PERIODS = {
    'simple': None,
    'monthly': 12,
    'quarterly': 4,
    'half_yearly': 2,
    'annually': 1,
}


def _compute_fd_value(fd, as_of: date) -> Decimal:
    """Compute current value of an FD using compound/simple interest formula."""
    from instruments.models import FDDetails

    principal = fd.principal
    rate = fd.annual_rate / Decimal('100')
    t_days = (min(as_of, fd.maturity_date) - fd.investment_date).days
    if t_days <= 0:
        return principal
    t_years = Decimal(str(t_days)) / Decimal('365')

    n = _COMPOUNDING_PERIODS.get(fd.compounding)
    if n is None:
        value = principal * (1 + rate * t_years)
    else:
        value = principal * (1 + rate / Decimal(str(n))) ** (Decimal(str(n)) * t_years)

    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def bulk_snapshot(household_id: int, as_of: date) -> dict:
    """
    Create ValuationSnapshot records for all active instruments and accounts
    in a household as of a given date.

    Returns a summary: auto_computed (formula), carried_forward (last snapshot),
    and needs_manual (no data available).
    """
    from instruments.models import Account, Instrument

    auto_computed = []
    carried_forward = []
    needs_manual = []

    # --- Instruments ---
    instruments = Instrument.objects.filter(
        household_id=household_id, is_active=True
    ).prefetch_related('fd_details')

    for instrument in instruments:
        value = None
        method = None

        # Try FD auto-compute
        fd = getattr(instrument, 'fd_details', None)
        if fd is not None:
            value = _compute_fd_value(fd, as_of)
            method = 'formula'

        # Carry forward last known snapshot
        if value is None:
            last = (
                ValuationSnapshot.objects
                .filter(instrument=instrument, valuation_date__lte=as_of)
                .order_by('-valuation_date', '-id')
                .first()
            )
            if last is not None:
                if last.unit_price is not None:
                    # Reuse unit_price; quantity handled separately
                    value = last.unit_price
                    ValuationSnapshot.objects.create(
                        household_id=household_id,
                        instrument=instrument,
                        valuation_date=as_of,
                        unit_price=last.unit_price,
                        market_value=last.market_value,
                        source=ValuationSnapshot.SourceType.API,
                        notes=f'Carried forward from {last.valuation_date}',
                    )
                    carried_forward.append({'name': instrument.name, 'type': instrument.instrument_type, 'value': float(last.market_value or last.unit_price)})
                    continue
                elif last.market_value is not None:
                    value = last.market_value
                    ValuationSnapshot.objects.create(
                        household_id=household_id,
                        instrument=instrument,
                        valuation_date=as_of,
                        market_value=last.market_value,
                        source=ValuationSnapshot.SourceType.API,
                        notes=f'Carried forward from {last.valuation_date}',
                    )
                    carried_forward.append({'name': instrument.name, 'type': instrument.instrument_type, 'value': float(last.market_value)})
                    continue

        # Fall back to net invested from transactions
        if value is None:
            from ledger.models import Transaction
            from django.db.models import Sum
            txs = Transaction.objects.filter(instrument=instrument, tx_date__lte=as_of)
            inflow = txs.filter(direction=Transaction.Direction.INFLOW).aggregate(s=Sum('amount'))['s'] or ZERO
            outflow = txs.filter(direction=Transaction.Direction.OUTFLOW).aggregate(s=Sum('amount'))['s'] or ZERO
            net = Decimal(str(inflow)) - Decimal(str(outflow))
            if net > ZERO:
                value = net
                method = 'transactions'

        if value is not None:
            ValuationSnapshot.objects.create(
                household_id=household_id,
                instrument=instrument,
                valuation_date=as_of,
                market_value=value,
                source=ValuationSnapshot.SourceType.API,
                notes='Auto-computed' if method == 'formula' else ('Net invested from transactions' if method == 'transactions' else ''),
            )
            (auto_computed if method == 'formula' else carried_forward).append(
                {'name': instrument.name, 'type': instrument.instrument_type, 'value': float(value)}
            )
        else:
            needs_manual.append({'name': instrument.name, 'type': instrument.instrument_type})

    # --- Accounts: carry forward last balance, else compute from opening_balance + transactions ---
    from ledger.models import Transaction
    from django.db.models import Sum

    accounts = Account.objects.filter(household_id=household_id, is_active=True)
    for account in accounts:
        last = (
            ValuationSnapshot.objects
            .filter(account=account, valuation_date__lte=as_of)
            .order_by('-valuation_date', '-id')
            .first()
        )
        if last is not None:
            balance = last.balance
            note = f'Carried forward from {last.valuation_date}'
            bucket = carried_forward
        else:
            # Compute from opening balance + all transactions up to as_of
            txs = Transaction.objects.filter(account=account, tx_date__lte=as_of)
            inflow = txs.filter(direction=Transaction.Direction.INFLOW).aggregate(s=Sum('amount'))['s'] or ZERO
            outflow = txs.filter(direction=Transaction.Direction.OUTFLOW).aggregate(s=Sum('amount'))['s'] or ZERO
            if account.account_type == 'credit_card':
                balance = max(Decimal(str(outflow)) - Decimal(str(inflow)), ZERO)
            else:
                balance = Decimal(str(account.opening_balance)) + Decimal(str(inflow)) - Decimal(str(outflow))
            note = 'Computed from opening balance + transactions'
            bucket = auto_computed

        ValuationSnapshot.objects.create(
            household_id=household_id,
            account=account,
            valuation_date=as_of,
            balance=balance,
            source=ValuationSnapshot.SourceType.API,
            notes=note,
        )
        bucket.append({'name': account.name, 'type': account.account_type, 'value': float(balance)})

    # Compute and store total net worth
    from insights.services import compute_networth
    from instruments.models import Instrument as Inst

    net_worth = compute_networth(household_id, as_of)

    # Split assets vs liabilities
    liability_instruments = Inst.objects.filter(
        household_id=household_id, instrument_type='liability', is_active=True
    ).values_list('id', flat=True)
    liability_snapshots = ValuationSnapshot.objects.filter(
        household_id=household_id,
        instrument_id__in=liability_instruments,
        valuation_date=as_of,
    )
    total_liabilities = sum(
        (s.market_value or ZERO for s in liability_snapshots), start=ZERO
    )
    total_assets = net_worth + total_liabilities

    NetWorthSnapshot.objects.update_or_create(
        household_id=household_id,
        snapshot_date=as_of,
        defaults={
            'total_assets': total_assets,
            'total_liabilities': total_liabilities,
            'net_worth': net_worth,
        },
    )

    return {
        'as_of': as_of.isoformat(),
        'net_worth': float(net_worth),
        'total_assets': float(total_assets),
        'total_liabilities': float(total_liabilities),
        'auto_computed': auto_computed,
        'carried_forward': carried_forward,
        'needs_manual': needs_manual,
    }
