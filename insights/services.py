from __future__ import annotations

from datetime import date
from decimal import Decimal
from math import isfinite

from ledger.models import Transaction
from valuations.models import ValuationSnapshot


ZERO = Decimal('0.00')


def _signed_amount(transaction: Transaction) -> Decimal:
    return transaction.amount if transaction.direction == Transaction.Direction.INFLOW else -transaction.amount


def _signed_quantity(transaction: Transaction) -> Decimal:
    qty = transaction.quantity or Decimal('0')
    if transaction.transaction_type == Transaction.TransactionType.SELL:
        return -qty
    if transaction.transaction_type == Transaction.TransactionType.BUY:
        return qty
    return Decimal('0')


def _latest_valuation(instrument_id: int, as_of: date):
    return (
        ValuationSnapshot.objects.filter(instrument_id=instrument_id, valuation_date__lte=as_of)
        .order_by('-valuation_date', '-id')
        .first()
    )


def _household_share_maps(household_id: int) -> tuple[dict[int, Decimal], dict[int, Decimal]]:
    """Return (instrument_share, account_share) maps where each value is the
    summed allocation_percent (as a 0..1 Decimal) across active members with
    include_in_networth=True. Used to scale holdings/account balances in
    household-wide aggregates so excluded members are dropped naturally.

    Instruments/accounts with no ownership rows are absent from the map; callers
    treat a missing key as factor 1 (fully included)."""
    from core.models import Member
    from instruments.models import AccountOwnership, InstrumentOwnership

    included_member_ids = list(
        Member.objects.filter(
            household_id=household_id, is_active=True, include_in_networth=True,
        ).values_list('id', flat=True)
    )

    instrument_share: dict[int, Decimal] = {}
    for row in InstrumentOwnership.objects.filter(member_id__in=included_member_ids).values('instrument_id', 'allocation_percent'):
        instrument_share[row['instrument_id']] = (
            instrument_share.get(row['instrument_id'], Decimal('0'))
            + Decimal(str(row['allocation_percent'])) / Decimal('100')
        )

    account_share: dict[int, Decimal] = {}
    for row in AccountOwnership.objects.filter(member_id__in=included_member_ids).values('account_id', 'allocation_percent'):
        account_share[row['account_id']] = (
            account_share.get(row['account_id'], Decimal('0'))
            + Decimal(str(row['allocation_percent'])) / Decimal('100')
        )

    return instrument_share, account_share


def compute_holdings(household_id: int, as_of: date, member_id: int | None = None) -> list[dict]:
    txs = (
        Transaction.objects.filter(household_id=household_id, tx_date__lte=as_of, instrument__isnull=False)
        .select_related('instrument')
        .order_by('tx_date', 'id')
    )

    # Build allocation map for member filtering
    member_allocation: dict[int, Decimal] | None = None
    household_instrument_share: dict[int, Decimal] | None = None
    if member_id is not None:
        from instruments.models import InstrumentOwnership
        ownerships = InstrumentOwnership.objects.filter(member_id=member_id).values('instrument_id', 'allocation_percent')
        member_allocation = {o['instrument_id']: Decimal(str(o['allocation_percent'])) / Decimal('100') for o in ownerships}
        txs = txs.filter(instrument_id__in=member_allocation.keys())
    else:
        household_instrument_share, _ = _household_share_maps(household_id)

    by_instrument: dict[int, dict] = {}

    for tx in txs:
        key = tx.instrument_id
        item = by_instrument.setdefault(
            key,
            {
                'instrument_id': tx.instrument_id,
                'instrument_name': tx.instrument.name,
                'instrument_type': tx.instrument.instrument_type,
                'asset_category': tx.instrument.asset_category_id,
                'quantity': Decimal('0'),
                'net_invested': Decimal('0'),
            },
        )
        item['quantity'] += _signed_quantity(tx)
        item['net_invested'] += -_signed_amount(tx)

    holdings = []
    for instrument_id, item in by_instrument.items():
        valuation = _latest_valuation(instrument_id, as_of)
        quantity = item['quantity']
        if valuation and valuation.unit_price is not None:
            market_value = quantity * valuation.unit_price
        elif valuation and valuation.market_value is not None:
            market_value = valuation.market_value
        else:
            market_value = item['net_invested']

        # Apply member allocation scaling
        if member_allocation is not None:
            factor = member_allocation.get(instrument_id, Decimal('1'))
            market_value = market_value * factor
        elif household_instrument_share is not None:
            # Household-wide: scale by summed share of members included in net worth.
            # Instruments with no ownership rows fall through (treated as fully included).
            factor = household_instrument_share.get(instrument_id, Decimal('1'))
            market_value = market_value * factor

        holdings.append(
            {
                **item,
                'quantity': quantity.quantize(Decimal('0.000001')),
                'market_value': market_value.quantize(Decimal('0.01')),
            }
        )

    return holdings


def compute_networth(household_id: int, as_of: date, member_id: int | None = None) -> Decimal:
    from instruments.models import Account
    from django.db.models import Sum

    holdings_total = sum((h['market_value'] for h in compute_holdings(household_id, as_of, member_id)), start=ZERO)

    # Build account allocation map for member filtering
    account_allocation: dict[int, Decimal] | None = None
    household_account_share: dict[int, Decimal] | None = None
    if member_id is not None:
        from instruments.models import AccountOwnership
        ao = AccountOwnership.objects.filter(member_id=member_id).values('account_id', 'allocation_percent')
        account_allocation = {o['account_id']: Decimal(str(o['allocation_percent'])) / Decimal('100') for o in ao}
    else:
        _, household_account_share = _household_share_maps(household_id)

    # Account balances: use the most recent ValuationSnapshot on or before as_of
    # as the anchor balance, then add/subtract only transactions after that date.
    # Falls back to opening_balance + all transactions if no snapshot exists.
    # Broker accounts are excluded: their holdings are already counted via instruments.
    accounts_qs = Account.objects.filter(household_id=household_id, is_active=True).exclude(account_type='broker')
    if account_allocation is not None:
        accounts_qs = accounts_qs.filter(id__in=account_allocation.keys())

    accounts_total = ZERO
    for account in accounts_qs:
        snapshot = (
            ValuationSnapshot.objects
            .filter(account=account, valuation_date__lte=as_of)
            .order_by('-valuation_date', '-id')
            .first()
        )
        if snapshot:
            anchor_balance = snapshot.balance
            anchor_date = snapshot.valuation_date
            txs = Transaction.objects.filter(account=account, tx_date__gt=anchor_date, tx_date__lte=as_of)
        else:
            anchor_balance = account.opening_balance
            anchor_date = None
            txs = Transaction.objects.filter(account=account, tx_date__lte=as_of)

        inflow = txs.filter(direction=Transaction.Direction.INFLOW).aggregate(s=Sum('amount'))['s'] or ZERO
        outflow = txs.filter(direction=Transaction.Direction.OUTFLOW).aggregate(s=Sum('amount'))['s'] or ZERO

        if account_allocation is not None:
            factor = account_allocation.get(account.id, Decimal('1'))
        elif household_account_share is not None:
            factor = household_account_share.get(account.id, Decimal('1'))
        else:
            factor = Decimal('1')
        if account.account_type == 'credit_card':
            outstanding = max(Decimal(str(outflow)) - Decimal(str(inflow)), ZERO)
            accounts_total -= outstanding * factor
        else:
            balance = anchor_balance + Decimal(str(inflow)) - Decimal(str(outflow))
            accounts_total += balance * factor

    return holdings_total + accounts_total


def compute_member_accounts(household_id: int, as_of: date, member_id: int) -> list[dict]:
    """Return account balances for a specific member (accounts they own via AccountOwnership)."""
    from instruments.models import Account, AccountOwnership
    from django.db.models import Sum

    ao = AccountOwnership.objects.filter(member_id=member_id).values('account_id', 'allocation_percent')
    account_allocation = {o['account_id']: Decimal(str(o['allocation_percent'])) / Decimal('100') for o in ao}
    if not account_allocation:
        return []

    accounts = Account.objects.filter(id__in=account_allocation.keys(), household_id=household_id, is_active=True).exclude(account_type='broker')
    result = []
    for account in accounts:
        snapshot = (
            ValuationSnapshot.objects
            .filter(account=account, valuation_date__lte=as_of)
            .order_by('-valuation_date', '-id')
            .first()
        )
        if snapshot:
            anchor_balance = Decimal(str(snapshot.balance))
            anchor_date = snapshot.valuation_date
            txs = Transaction.objects.filter(account=account, tx_date__gt=anchor_date, tx_date__lte=as_of)
        else:
            anchor_balance = account.opening_balance
            anchor_date = None
            txs = Transaction.objects.filter(account=account, tx_date__lte=as_of)

        inflow = Decimal(str(txs.filter(direction=Transaction.Direction.INFLOW).aggregate(s=Sum('amount'))['s'] or ZERO))
        outflow = Decimal(str(txs.filter(direction=Transaction.Direction.OUTFLOW).aggregate(s=Sum('amount'))['s'] or ZERO))
        factor = account_allocation.get(account.id, Decimal('1'))

        if account.account_type == 'credit_card':
            outstanding = max(outflow - inflow, ZERO)
            balance = -(outstanding * factor)
        else:
            balance = (anchor_balance + inflow - outflow) * factor

        result.append({
            'account_id': account.id,
            'account_name': account.name,
            'account_type': account.account_type,
            'balance': str(balance.quantize(Decimal('0.01'))),
            'allocation_percent': str(account_allocation[account.id] * 100),
        })
    return result


def compute_members_networth(household_id: int, as_of: date) -> list[dict]:
    from core.models import Member
    members = Member.objects.filter(household_id=household_id, is_active=True)
    result = []
    for member in members:
        nw = compute_networth(household_id, as_of, member_id=member.id)
        result.append({
            'member_id': member.id,
            'member_name': member.full_name,
            'relation_type': member.relation_type,
            'networth': str(nw.quantize(Decimal('0.01'))),
            'include_in_networth': member.include_in_networth,
        })
    return result


def compute_allocation(household_id: int, as_of: date) -> list[dict]:
    holdings = compute_holdings(household_id, as_of)
    grouped: dict[str, Decimal] = {}
    for h in holdings:
        grouped[h['instrument_type']] = grouped.get(h['instrument_type'], ZERO) + h['market_value']
    total = sum(grouped.values(), start=ZERO)
    rows = []
    for instrument_type, value in grouped.items():
        ratio = Decimal('0.00') if total == ZERO else (value / total * Decimal('100')).quantize(Decimal('0.01'))
        rows.append({'instrument_type': instrument_type, 'market_value': value, 'allocation_percent': ratio})
    rows.sort(key=lambda x: x['market_value'], reverse=True)
    return rows


def compute_category_breakdown(household_id: int, as_of: date, member_id: int | None = None) -> list[dict]:
    """Group holdings market_value by AssetCategory. Instruments with no category go to Uncategorised."""
    from instruments.models import Instrument
    holdings = compute_holdings(household_id, as_of, member_id)
    if not holdings:
        return []

    instrument_ids = [h['instrument_id'] for h in holdings]
    cat_by_instrument: dict[int, object] = {}
    for inst in Instrument.objects.filter(id__in=instrument_ids).select_related('asset_category'):
        cat_by_instrument[inst.id] = inst.asset_category

    grouped: dict = {}
    for h in holdings:
        cat = cat_by_instrument.get(h['instrument_id'])
        if cat:
            key = cat.id
            if key not in grouped:
                grouped[key] = {'category_id': cat.id, 'category_name': cat.name,
                                'color': cat.color, 'icon_name': cat.icon_name, 'total': ZERO}
        else:
            key = None
            if key not in grouped:
                grouped[key] = {'category_id': None, 'category_name': 'Uncategorised',
                                'color': '#94a3b8', 'icon_name': '', 'total': ZERO}
        grouped[key]['total'] += h['market_value']

    total_all = sum(g['total'] for g in grouped.values()) or ZERO
    result = []
    for g in grouped.values():
        pct = (g['total'] / total_all * Decimal('100')).quantize(Decimal('0.01')) if total_all else ZERO
        result.append({
            'category_id': g['category_id'],
            'category_name': g['category_name'],
            'color': g['color'],
            'icon_name': g['icon_name'],
            'market_value': str(g['total'].quantize(Decimal('0.01'))),
            'allocation_percent': str(pct),
        })
    result.sort(key=lambda x: Decimal(x['market_value']), reverse=True)
    return result


def compute_holdings_history(household_id: int, instrument_type: str | None = None, member_id: int | None = None) -> list[dict]:
    """Return a time series of {date, invested, current} for holdings of a given instrument type.

    Data points are the distinct valuation dates present in ValuationSnapshot for matching
    instruments. For each date we sum:
      - net_invested: cumulative buy-minus-sell amounts up to that date
      - current:      sum of latest ValuationSnapshot market_value per instrument as of that date
    """
    from django.db.models import Q

    qs = ValuationSnapshot.objects.filter(
        household_id=household_id,
        instrument__isnull=False,
    )
    if instrument_type:
        qs = qs.filter(instrument__instrument_type=instrument_type)

    dates = sorted(qs.values_list('valuation_date', flat=True).distinct())
    if not dates:
        return []

    # Pre-fetch all relevant transactions once
    tx_qs = Transaction.objects.filter(
        household_id=household_id,
        instrument__isnull=False,
    ).select_related('instrument').order_by('tx_date', 'id')
    if instrument_type:
        tx_qs = tx_qs.filter(instrument__instrument_type=instrument_type)

    # Member allocation scaling
    member_allocation: dict[int, Decimal] | None = None
    household_instrument_share: dict[int, Decimal] | None = None
    if member_id is not None:
        from instruments.models import InstrumentOwnership
        ownerships = InstrumentOwnership.objects.filter(member_id=member_id).values('instrument_id', 'allocation_percent')
        member_allocation = {o['instrument_id']: Decimal(str(o['allocation_percent'])) / Decimal('100') for o in ownerships}
        tx_qs = tx_qs.filter(instrument_id__in=member_allocation.keys())
    else:
        household_instrument_share, _ = _household_share_maps(household_id)

    all_txs = list(tx_qs)

    result = []
    for d in dates:
        # net_invested: sum transactions up to this date
        net_invested = ZERO
        instrument_ids_seen: set[int] = set()
        for tx in all_txs:
            if tx.tx_date > d:
                break
            net_invested += -_signed_amount(tx)
            instrument_ids_seen.add(tx.instrument_id)

        # current: latest snapshot per instrument as of this date
        current = ZERO
        for inst_id in instrument_ids_seen:
            snap = (
                ValuationSnapshot.objects
                .filter(instrument_id=inst_id, valuation_date__lte=d)
                .order_by('-valuation_date', '-id')
                .first()
            )
            if snap is None:
                continue
            if snap.unit_price is not None:
                # Need quantity up to this date
                qty = sum(
                    (_signed_quantity(tx) for tx in all_txs if tx.instrument_id == inst_id and tx.tx_date <= d),
                    ZERO,
                )
                val = qty * snap.unit_price
            elif snap.market_value is not None:
                val = snap.market_value
            else:
                continue

            factor = Decimal('1')
            if member_allocation is not None:
                factor = member_allocation.get(inst_id, Decimal('1'))
            elif household_instrument_share is not None:
                factor = household_instrument_share.get(inst_id, Decimal('1'))
            current += val * factor

        result.append({
            'date': d.isoformat(),
            'invested': float(net_invested.quantize(Decimal('0.01'))),
            'current': float(current.quantize(Decimal('0.01'))),
        })

    return result


def compute_cashflow(household_id: int, year: int, month: int | None = None) -> list[dict]:
    """Return monthly income/expense/savings summary for a given year (optionally single month)."""
    from collections import defaultdict

    INCOME_TYPES = {
        Transaction.TransactionType.SALARY,
        Transaction.TransactionType.DIVIDEND,
        Transaction.TransactionType.INTEREST,
        Transaction.TransactionType.TAX_REFUND,
        Transaction.TransactionType.LOAN_DISBURSAL,
        Transaction.TransactionType.DEPOSIT,
    }
    EXPENSE_TYPES = {
        Transaction.TransactionType.WITHDRAWAL,
        Transaction.TransactionType.EMI,
        Transaction.TransactionType.TAX_PAYMENT,
        Transaction.TransactionType.PREMIUM,
    }

    qs = Transaction.objects.filter(household_id=household_id, tx_date__year=year)
    if month:
        qs = qs.filter(tx_date__month=month)

    by_month: dict[str, dict] = defaultdict(lambda: {'income': ZERO, 'expense': ZERO, 'investment': ZERO})

    for tx in qs:
        key = tx.tx_date.strftime('%Y-%m')
        if tx.transaction_type in INCOME_TYPES:
            by_month[key]['income'] += tx.amount
        elif tx.transaction_type in EXPENSE_TYPES:
            by_month[key]['expense'] += tx.amount
        elif tx.transaction_type == Transaction.TransactionType.BUY:
            by_month[key]['investment'] += tx.amount

    result = []
    for m_key in sorted(by_month):
        row = by_month[m_key]
        income = row['income']
        expense = row['expense']
        investment = row['investment']
        result.append({
            'month': m_key,
            'income': float(income),
            'expense': float(expense),
            'investment': float(investment),
            'savings': float(income - expense - investment),
        })
    return result


def compute_spend_analytics(household_id: int, months: int = 12, classification: str | None = None) -> dict:
    """Return transaction analytics for the trailing `months` months.

    When `classification` is given (e.g. 'spend', 'income') only that type
    is included. When None, all classifications are included.
    The by_category breakdown groups by spend_category for spend-only queries,
    and by classification for all-transactions queries.
    """
    from datetime import date as _date
    from django.db.models import Sum
    from django.db.models.functions import TruncMonth
    from ledger.models import Transaction

    today = _date.today()
    months = max(1, min(months, 60))
    year = today.year
    month_idx = today.month - (months - 1)
    while month_idx <= 0:
        month_idx += 12
        year -= 1
    window_start = _date(year, month_idx, 1)


    qs = Transaction.objects.filter(
        household_id=household_id,
        tx_date__gte=window_start,
    )
    if classification == 'spend':
        # Include blank-classification outflows that have a spend_category — they're effectively spends
        from django.db.models import Q
        qs = qs.filter(Q(classification='spend') | Q(classification='', direction='outflow', spend_category__gt=''))
    elif classification:
        qs = qs.filter(classification=classification)

    # Only count outflow legs (spend/tracking/transfer debit side) and inflow legs (income/transfer credit side).
    # Using outflow-only for spend keeps correction reversals from cancelling the original amount.
    outflow_qs = qs.filter(direction='outflow')
    inflow_qs = qs.filter(direction='inflow')

    def _month_amounts(queryset):
        return (
            queryset.annotate(m=TruncMonth('tx_date'))
            .values('m')
            .annotate(amount=Sum('amount'))
            .order_by('m')
        )

    if classification == 'income':
        amount_qs = inflow_qs
    elif classification in ('spend', 'tracking', None):
        # For "all", aggregate per-classification correctly via by_month_category below
        amount_qs = outflow_qs if classification else qs
    else:
        amount_qs = outflow_qs

    by_month_rows = _month_amounts(outflow_qs if not classification else amount_qs)
    by_month = [
        {'month': row['m'].strftime('%Y-%m'), 'amount': float(row['amount'] or 0)}
        for row in by_month_rows
    ]

    # Breakdown: by spend_category when filtering to spend; by classification otherwise
    if classification == 'spend':
        from expenses.models import ExpenseCategory
        cat_labels = dict(
            ExpenseCategory.objects.filter(household_id=household_id).values_list('key', 'label')
        )
        by_category_rows = (
            outflow_qs.values('spend_category')
            .annotate(amount=Sum('amount'))
            .order_by('-amount')
        )
        by_category = [
            {
                'category': row['spend_category'] or '',
                'label': cat_labels.get(row['spend_category'] or '') or row['spend_category'] or 'Uncategorised',
                'amount': float(row['amount'] or 0),
            }
            for row in by_category_rows
        ]
    elif classification == 'income':
        cls_labels = {'income': 'Income'}
        by_category_rows = (
            inflow_qs.values('classification')
            .annotate(amount=Sum('amount'))
            .order_by('-amount')
        )
        by_category = [
            {
                'category': row['classification'] or '',
                'label': cls_labels.get(row['classification'] or '', 'Other'),
                'amount': float(row['amount'] or 0),
            }
            for row in by_category_rows
        ]
    else:
        # "All" mode: group by classification, use outflow for spend/tracking/transfer, inflow for income
        cls_labels = {'spend': 'Spend', 'income': 'Income', 'internal_transfer': 'Transfer', 'tracking': 'Tracking', '': 'Uncategorised'}
        cls_amounts: dict[str, float] = {}
        for row in outflow_qs.values('classification').annotate(s=Sum('amount')):
            if row['classification'] != 'income':
                cls_amounts[row['classification'] or ''] = float(row['s'] or 0)
        for row in inflow_qs.filter(classification='income').values('classification').annotate(s=Sum('amount')):
            cls_amounts['income'] = float(row['s'] or 0)
        by_category = [
            {'category': k, 'label': cls_labels.get(k, k or 'Other'), 'amount': v}
            for k, v in sorted(cls_amounts.items(), key=lambda x: -x[1])
            if v > 0
        ]

    # By member: outflow for spend/tracking, inflow for income, outflow for all
    member_qs = inflow_qs if classification == 'income' else outflow_qs
    by_member_rows = (
        member_qs.values('member_id', 'member__full_name')
        .annotate(amount=Sum('amount'))
        .order_by('-amount')
    )
    by_member = [
        {
            'member_id': row['member_id'],
            'name': row['member__full_name'] or 'Unassigned',
            'amount': float(row['amount'] or 0),
        }
        for row in by_member_rows
    ]

    # by_month_category: for "all", break out each classification with correct direction
    group_field = 'spend_category' if classification == 'spend' else 'classification'
    if not classification:
        # Build per-classification monthly amounts with correct direction per classification
        mc_rows = []
        for row in (
            outflow_qs.exclude(classification='income')
            .annotate(m=TruncMonth('tx_date'))
            .values('m', 'classification')
            .annotate(amount=Sum('amount'))
            .order_by('m', 'classification')
        ):
            mc_rows.append({
                'month': row['m'].strftime('%Y-%m'),
                'category': row['classification'] or '',
                'amount': float(row['amount'] or 0),
            })
        for row in (
            inflow_qs.filter(classification='income')
            .annotate(m=TruncMonth('tx_date'))
            .values('m', 'classification')
            .annotate(amount=Sum('amount'))
            .order_by('m', 'classification')
        ):
            mc_rows.append({
                'month': row['m'].strftime('%Y-%m'),
                'category': 'income',
                'amount': float(row['amount'] or 0),
            })
        by_month_category = mc_rows
    else:
        direction_qs = inflow_qs if classification == 'income' else outflow_qs
        by_month_category_rows = (
            direction_qs.annotate(m=TruncMonth('tx_date'))
            .values('m', group_field)
            .annotate(amount=Sum('amount'))
            .order_by('m', group_field)
        )
        by_month_category = [
            {
                'month': row['m'].strftime('%Y-%m'),
                'category': row[group_field] or '',
                'amount': float(row['amount'] or 0),
            }
            for row in by_month_category_rows
        ]

    total_qs = inflow_qs if classification == 'income' else outflow_qs
    total = float(total_qs.aggregate(s=Sum('amount'))['s'] or 0)

    return {
        'by_month': by_month,
        'by_category': by_category,
        'by_member': by_member,
        'by_month_category': by_month_category,
        'total': total,
        'classification': classification or 'all',
        'window': {
            'start': window_start.isoformat(),
            'end': today.isoformat(),
            'months': months,
        },
    }


def _xnpv(rate: float, flows: list[tuple[date, float]]) -> float:
    if rate <= -1:
        return float('inf')
    start = flows[0][0]
    return sum(amount / ((1 + rate) ** ((d - start).days / 365.0)) for d, amount in flows)


def _xirr(flows: list[tuple[date, float]]) -> float:
    guess = 0.12
    for _ in range(100):
        value = _xnpv(guess, flows)
        derivative = (_xnpv(guess + 1e-6, flows) - value) / 1e-6
        if derivative == 0:
            break
        next_guess = guess - value / derivative
        if not isfinite(next_guess):
            break
        if abs(next_guess - guess) < 1e-10:
            return next_guess
        guess = next_guess
    return guess


def compute_xirr(household_id: int, as_of: date, instrument_id: int | None = None) -> float | None:
    tx_query = Transaction.objects.filter(household_id=household_id, tx_date__lte=as_of).exclude(
        transaction_type=Transaction.TransactionType.WITHDRAWAL
    )
    if instrument_id:
        tx_query = tx_query.filter(instrument_id=instrument_id)
    else:
        tx_query = tx_query.filter(instrument__isnull=False)

    flows = [(tx.tx_date, float(_signed_amount(tx))) for tx in tx_query.order_by('tx_date', 'id')]
    if not flows:
        return None
    if all(amount >= 0 for _, amount in flows) or all(amount <= 0 for _, amount in flows):
        return None

    if instrument_id:
        terminal = sum(
            (h['market_value'] for h in compute_holdings(household_id, as_of) if h['instrument_id'] == instrument_id),
            start=ZERO,
        )
    else:
        terminal = sum((h['market_value'] for h in compute_holdings(household_id, as_of)), start=ZERO)
    if terminal:
        flows.append((as_of, float(terminal)))

    try:
        return round(_xirr(flows), 6)
    except Exception:
        return None
