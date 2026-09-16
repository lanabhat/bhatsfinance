"""Stock-level overlap / diversification analysis across MF and equity holdings.

Only operates on holdings with at least one uploaded FundHoldingsSnapshot
(instruments/holdings_parser.py) — holdings without uploaded holdings are
excluded from the overlap matrix but flagged explicitly, never silently
dropped.

Holdings are identified the same way compute_holdings() groups them: a
('instrument'|'investment', id) pair. Equity holdings are still their own
Instrument (kind='instrument'); MF/SIP holdings are Investments living under
the household's shared "Mutual Fund" Instrument shell (kind='investment') —
FundHoldingsSnapshot is keyed to Investment for exactly that reason (the
shared shell can't tell whose portfolio disclosure a snapshot is)."""
from __future__ import annotations

from decimal import Decimal

from insights.services import ZERO, compute_holdings


def _snapshot_filter_kwargs(kind: str, raw_id: int) -> dict:
    return {'investment_id': raw_id} if kind == 'investment' else {'instrument_id': raw_id, 'investment__isnull': True}


def _latest_snapshot_holdings(kind: str, raw_id: int):
    from instruments.models import FundHoldingsSnapshot

    snapshot = (
        FundHoldingsSnapshot.objects.filter(**_snapshot_filter_kwargs(kind, raw_id))
        .order_by('-as_of_date')
        .prefetch_related('holdings')
        .first()
    )
    if snapshot is None:
        return None
    return {h.isin: h.weight_percent for h in snapshot.holdings.all() if h.isin}


def compute_fund_overlap(holding_a: tuple[str, int], holding_b: tuple[str, int]) -> dict | None:
    """Overlap % = sum of min(weight_A, weight_B) for ISINs held by both funds,
    using each fund's latest uploaded holdings snapshot. Returns None if either
    holding has no uploaded holdings yet.

    Each holding is a ('instrument'|'investment', id) pair — see module
    docstring. A bare int is also accepted for backward compatibility and is
    treated as ('instrument', id)."""
    from django.db.models import Q
    from instruments.models import FundHolding

    kind_a, id_a = holding_a if isinstance(holding_a, tuple) else ('instrument', holding_a)
    kind_b, id_b = holding_b if isinstance(holding_b, tuple) else ('instrument', holding_b)

    weights_a = _latest_snapshot_holdings(kind_a, id_a)
    weights_b = _latest_snapshot_holdings(kind_b, id_b)
    if weights_a is None or weights_b is None:
        return None

    shared_isins = set(weights_a) & set(weights_b)
    overlap_percent = sum((min(weights_a[isin], weights_b[isin]) for isin in shared_isins), Decimal('0'))

    name_by_isin: dict[str, str] = {}
    if shared_isins:
        def _fh_filter(kind, raw_id):
            return {f'snapshot__{k}': v for k, v in _snapshot_filter_kwargs(kind, raw_id).items()}

        snapshot_filter = Q(**_fh_filter(kind_a, id_a)) | Q(**_fh_filter(kind_b, id_b))
        rows = FundHolding.objects.filter(snapshot_filter, isin__in=shared_isins).values('isin', 'instrument_name')
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
    """Pairwise overlap for every pair of MF/equity holdings with uploaded
    holdings, plus portfolio-level top holdings by aggregate weight (each fund's
    holding weight scaled by that fund's share of the user's total holdings value).

    Each holding is identified the same way compute_holdings() groups them —
    equity holdings by instrument_id (still one Instrument per stock),
    MF/SIP holdings by investment_id (funds/folios under the shared "Mutual
    Fund" Instrument shell). Every pair/covered/uncovered entry carries both
    `*_instrument_id` (the Instrument — the shell for MF/SIP) and
    `*_investment_id` (None for equity) so callers keyed on either still work."""
    from instruments.models import FundHoldingsSnapshot, Instrument, Investment

    holdings = compute_holdings(household_id, as_of)
    covered_types = {Instrument.InstrumentType.MUTUAL_FUND, Instrument.InstrumentType.SIP, Instrument.InstrumentType.EQUITY}
    candidates = [
        ('investment', h['investment_id']) if h['investment_id'] else ('instrument', h['instrument_id'])
        for h in holdings if h['instrument_type'] in covered_types
    ]

    instrument_candidate_ids = [raw_id for kind, raw_id in candidates if kind == 'instrument']
    investment_candidate_ids = [raw_id for kind, raw_id in candidates if kind == 'investment']

    snapshotted_instrument_ids = set(
        FundHoldingsSnapshot.objects.filter(instrument_id__in=instrument_candidate_ids, investment__isnull=True)
        .values_list('instrument_id', flat=True).distinct()
    ) if instrument_candidate_ids else set()
    snapshotted_investment_ids = set(
        FundHoldingsSnapshot.objects.filter(investment_id__in=investment_candidate_ids)
        .values_list('investment_id', flat=True).distinct()
    ) if investment_candidate_ids else set()

    def _has_snapshot(kind, raw_id):
        return raw_id in (snapshotted_investment_ids if kind == 'investment' else snapshotted_instrument_ids)

    covered = [c for c in candidates if _has_snapshot(*c)]
    uncovered = [c for c in candidates if not _has_snapshot(*c)]

    instruments_by_id = {i.id: i for i in Instrument.objects.filter(id__in=instrument_candidate_ids)}
    investments_by_id = {i.id: i for i in Investment.objects.filter(id__in=investment_candidate_ids)}

    def _name(kind, raw_id):
        return investments_by_id[raw_id].name if kind == 'investment' else instruments_by_id[raw_id].name

    value_by_key = {
        (('investment', h['investment_id']) if h['investment_id'] else ('instrument', h['instrument_id'])): h['market_value']
        for h in holdings
    }
    total_covered_value = sum((value_by_key.get(c, ZERO) for c in covered), ZERO)

    pairs = []
    for idx, a in enumerate(covered):
        for b in covered[idx + 1:]:
            result = compute_fund_overlap(a, b)
            if result is None:
                continue
            a_kind, a_id = a
            b_kind, b_id = b
            pairs.append({
                'instrument_a_id': a_id if a_kind == 'instrument' else investments_by_id[a_id].instrument_id,
                'investment_a_id': a_id if a_kind == 'investment' else None,
                'instrument_a_name': _name(a_kind, a_id),
                'instrument_b_id': b_id if b_kind == 'instrument' else investments_by_id[b_id].instrument_id,
                'investment_b_id': b_id if b_kind == 'investment' else None,
                'instrument_b_name': _name(b_kind, b_id),
                'overlap_percent': result['overlap_percent'],
                'shared_holdings': result['shared_holdings'],
            })
    pairs.sort(key=lambda p: Decimal(p['overlap_percent']), reverse=True)

    # Portfolio-level concentration: aggregate weight per stock, scaled by each
    # fund's share of the total value of *covered* holdings.
    aggregate: dict[str, dict] = {}
    for kind, raw_id in covered:
        fund_weights = _latest_snapshot_holdings(kind, raw_id)
        if not fund_weights or total_covered_value == ZERO:
            continue
        fund_share = value_by_key.get((kind, raw_id), ZERO) / total_covered_value
        for isin, weight in fund_weights.items():
            entry = aggregate.setdefault(isin, {'isin': isin, 'name': None, 'portfolio_weight': Decimal('0'), 'via_funds': []})
            entry['portfolio_weight'] += weight * fund_share
            entry['via_funds'].append(_name(kind, raw_id))

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

    # covered_instrument_ids/uncovered_instrument_ids stay id-lists for
    # backward compatibility with callers that only care about equity
    # holdings (still keyed by instrument_id); *_investment_ids are the
    # MF/SIP equivalent (funds/folios under the shared shell), and
    # *_holding_keys carries the full ('instrument'|'investment', id) pairs
    # for callers that need to disambiguate.
    return {
        'pairs': pairs,
        'top_holdings': top_holdings,
        'covered_instrument_ids': [raw_id for kind, raw_id in covered if kind == 'instrument'],
        'uncovered_instrument_ids': [raw_id for kind, raw_id in uncovered if kind == 'instrument'],
        'covered_investment_ids': [raw_id for kind, raw_id in covered if kind == 'investment'],
        'uncovered_investment_ids': [raw_id for kind, raw_id in uncovered if kind == 'investment'],
        'covered_holding_keys': covered,
        'uncovered_holding_keys': uncovered,
    }
