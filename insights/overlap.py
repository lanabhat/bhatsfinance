"""Stock-level overlap / diversification analysis across MF and equity holdings.

Only operates on instruments with at least one uploaded FundHoldingsSnapshot
(instruments/holdings_parser.py) — instruments without uploaded holdings are
excluded from the overlap matrix but flagged explicitly, never silently dropped.
"""
from __future__ import annotations

from decimal import Decimal

from insights.services import ZERO, compute_holdings


def _latest_snapshot_holdings(instrument_id: int):
    from instruments.models import FundHoldingsSnapshot

    snapshot = (
        FundHoldingsSnapshot.objects.filter(instrument_id=instrument_id)
        .order_by('-as_of_date')
        .prefetch_related('holdings')
        .first()
    )
    if snapshot is None:
        return None
    return {h.isin: h.weight_percent for h in snapshot.holdings.all() if h.isin}


def compute_fund_overlap(instrument_a_id: int, instrument_b_id: int) -> dict | None:
    """Overlap % = sum of min(weight_A, weight_B) for ISINs held by both funds,
    using each fund's latest uploaded holdings snapshot. Returns None if either
    instrument has no uploaded holdings yet."""
    from instruments.models import FundHolding, FundHoldingsSnapshot

    weights_a = _latest_snapshot_holdings(instrument_a_id)
    weights_b = _latest_snapshot_holdings(instrument_b_id)
    if weights_a is None or weights_b is None:
        return None

    shared_isins = set(weights_a) & set(weights_b)
    overlap_percent = sum((min(weights_a[isin], weights_b[isin]) for isin in shared_isins), Decimal('0'))

    name_by_isin: dict[str, str] = {}
    if shared_isins:
        rows = FundHolding.objects.filter(
            snapshot__instrument_id__in=[instrument_a_id, instrument_b_id], isin__in=shared_isins,
        ).values('isin', 'instrument_name')
        for row in rows:
            name_by_isin.setdefault(row['isin'], row['instrument_name'])

    shared_holdings = sorted(
        [
            {
                'isin': isin,
                'name': name_by_isin.get(isin, isin),
                'weight_a': str(weights_a[isin]),
                'weight_b': str(weights_b[isin]),
                'min_weight': str(min(weights_a[isin], weights_b[isin])),
            }
            for isin in shared_isins
        ],
        key=lambda r: Decimal(r['min_weight']),
        reverse=True,
    )

    return {
        'overlap_percent': str(overlap_percent.quantize(Decimal('0.01'))),
        'shared_holdings': shared_holdings,
    }


def compute_portfolio_diversification(household_id: int, as_of) -> dict:
    """Pairwise overlap for every pair of MF/equity instruments with uploaded
    holdings, plus portfolio-level top holdings by aggregate weight (each fund's
    holding weight scaled by that fund's share of the user's total holdings value)."""
    from instruments.models import FundHoldingsSnapshot, Instrument

    holdings = compute_holdings(household_id, as_of)
    covered_types = {Instrument.InstrumentType.MUTUAL_FUND, Instrument.InstrumentType.SIP, Instrument.InstrumentType.EQUITY}
    candidate_ids = [h['instrument_id'] for h in holdings if h['instrument_type'] in covered_types]

    instruments_with_snapshots = set(
        FundHoldingsSnapshot.objects.filter(instrument_id__in=candidate_ids)
        .values_list('instrument_id', flat=True)
        .distinct()
    )
    covered_ids = [i for i in candidate_ids if i in instruments_with_snapshots]
    uncovered_ids = [i for i in candidate_ids if i not in instruments_with_snapshots]

    instruments_by_id = {i.id: i for i in Instrument.objects.filter(id__in=candidate_ids)}
    value_by_instrument = {h['instrument_id']: h['market_value'] for h in holdings}
    total_covered_value = sum((value_by_instrument.get(i, ZERO) for i in covered_ids), ZERO)

    pairs = []
    for idx, a_id in enumerate(covered_ids):
        for b_id in covered_ids[idx + 1:]:
            result = compute_fund_overlap(a_id, b_id)
            if result is None:
                continue
            pairs.append({
                'instrument_a_id': a_id,
                'instrument_a_name': instruments_by_id[a_id].name,
                'instrument_b_id': b_id,
                'instrument_b_name': instruments_by_id[b_id].name,
                'overlap_percent': result['overlap_percent'],
                'shared_holdings': result['shared_holdings'],
            })
    pairs.sort(key=lambda p: Decimal(p['overlap_percent']), reverse=True)

    # Portfolio-level concentration: aggregate weight per stock, scaled by each
    # fund's share of the total value of *covered* holdings.
    aggregate: dict[str, dict] = {}
    for instrument_id in covered_ids:
        fund_weights = _latest_snapshot_holdings(instrument_id)
        if not fund_weights or total_covered_value == ZERO:
            continue
        fund_share = value_by_instrument.get(instrument_id, ZERO) / total_covered_value
        for isin, weight in fund_weights.items():
            entry = aggregate.setdefault(isin, {'isin': isin, 'name': None, 'portfolio_weight': Decimal('0'), 'via_funds': []})
            entry['portfolio_weight'] += weight * fund_share
            entry['via_funds'].append(instruments_by_id[instrument_id].name)

    if aggregate:
        from instruments.models import FundHolding
        name_by_isin = dict(
            FundHolding.objects.filter(isin__in=aggregate.keys()).values_list('isin', 'instrument_name').distinct()
        )
        for isin, entry in aggregate.items():
            entry['name'] = name_by_isin.get(isin, isin)

    top_holdings = sorted(
        [
            {
                'isin': e['isin'],
                'name': e['name'],
                'portfolio_weight_percent': str(e['portfolio_weight'].quantize(Decimal('0.01'))),
                'via_funds': e['via_funds'],
            }
            for e in aggregate.values()
        ],
        key=lambda r: Decimal(r['portfolio_weight_percent']),
        reverse=True,
    )

    return {
        'pairs': pairs,
        'top_holdings': top_holdings,
        'covered_instrument_ids': covered_ids,
        'uncovered_instrument_ids': uncovered_ids,
    }
