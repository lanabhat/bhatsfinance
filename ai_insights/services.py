"""Prompt-building and call functions for the three manually-triggered Gemini
features: fund classification, returns comparison, rebalancing explanation.

Gemini is never asked to compute a number here — every figure sent to it (XIRR,
drift %, suggested amounts, expense ratios) comes from this app's own trusted
compute_* functions. Gemini only classifies or narrates numbers it's handed.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from google.genai import types
from pydantic import BaseModel, Field

from ai_insights.gemini_client import CLASSIFY_MODEL, EXPLAIN_MODEL, get_client
from ai_insights.models import FundClassification, FundReturnsComparison, RebalancingExplanation


class _ClassificationResult(BaseModel):
    bucket: Literal['equity', 'debt', 'hybrid'] = Field(description='Is the fund predominantly equity, debt, or a genuine hybrid mix?')
    rule_60_40_category: Literal['growth', 'stability'] = Field(description='Under the 60/40 rule, does this fund belong in the growth or stability sleeve?')
    reasoning: str = Field(description='One short paragraph explaining the classification')


def _build_classification_prompt(instrument) -> str:
    mf_details = getattr(instrument, 'mf_details', None)
    latest_snapshot = instrument.holdings_snapshots.order_by('-as_of_date').first()

    facts = [f'Fund name: {instrument.name}']
    if mf_details:
        if mf_details.amc:
            facts.append(f'AMC: {mf_details.amc}')
        if mf_details.fund_category:
            facts.append(f'Fund category: {mf_details.fund_category}')
        if mf_details.fund_sub_category:
            facts.append(f'Fund sub-category: {mf_details.fund_sub_category}')
    if latest_snapshot:
        top_holdings = list(latest_snapshot.holdings.order_by('-weight_percent')[:10])
        if top_holdings:
            facts.append('Top holdings: ' + ', '.join(f'{h.instrument_name} ({h.weight_percent}%)' for h in top_holdings))

    return (
        'Classify this Indian mutual fund based on the facts below.\n\n'
        + '\n'.join(facts)
        + '\n\n'
        'bucket: is this fund predominantly equity, debt, or a genuine hybrid/balanced mix?\n'
        'rule_60_40_category: under the common 60% growth / 40% stability portfolio split, '
        'would this fund typically sit in the growth (equity-like, higher risk/return) or '
        'stability (debt-like, capital preservation) sleeve?'
    )


def _call_classification(client, instrument) -> _ClassificationResult:
    response = client.models.generate_content(
        model=CLASSIFY_MODEL,
        contents=_build_classification_prompt(instrument),
        config=types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema=_ClassificationResult,
        ),
    )
    return response.parsed


def classify_fund(instrument) -> FundClassification:
    """Classify one MF instrument into an equity/debt/hybrid bucket and a
    60-40-rule category (growth vs stability), using its name/category/holdings.
    Writes straight to FundClassification — used by the single-fund "Classify
    with AI" card, which has no review step of its own.
    """
    client = get_client()
    result = _call_classification(client, instrument)

    classification, _ = FundClassification.objects.update_or_create(
        instrument=instrument,
        defaults={
            'bucket': result.bucket,
            'rule_60_40_category': result.rule_60_40_category,
            'reasoning': result.reasoning,
            'model_used': CLASSIFY_MODEL,
        },
    )
    return classification


def classify_all_funds(household_id: int) -> list[dict]:
    """Classify every mutual_fund/sip instrument in the household in one pass.

    Deliberately does NOT write to FundClassification — returns proposals for
    the frontend to review (approve/edit/reject) via apply_classifications()
    below. Calling this alone has no effect on stored data.
    """
    from instruments.models import Instrument

    instruments = list(
        Instrument.objects.filter(
            household_id=household_id,
            instrument_type__in=[Instrument.InstrumentType.MUTUAL_FUND, Instrument.InstrumentType.SIP],
        ).select_related('mf_details', 'ai_classification')
    )
    if not instruments:
        return []

    client = get_client()
    proposals = []
    for instrument in instruments:
        try:
            result = _call_classification(client, instrument)
        except Exception as exc:
            proposals.append({
                'instrument_id': instrument.id,
                'instrument_name': instrument.name,
                'error': str(exc),
            })
            continue

        existing = getattr(instrument, 'ai_classification', None)
        proposals.append({
            'instrument_id': instrument.id,
            'instrument_name': instrument.name,
            'current_bucket': existing.bucket if existing else None,
            'current_rule_60_40_category': existing.rule_60_40_category if existing else None,
            'bucket': result.bucket,
            'rule_60_40_category': result.rule_60_40_category,
            'reasoning': result.reasoning,
        })
    return proposals


def apply_classifications(classifications: list[dict]) -> int:
    """Persist only the approved rows from a classify_all_funds() review pass.
    Each entry: {instrument_id, bucket, rule_60_40_category, reasoning, approved}.
    Rejected/unapproved rows are skipped entirely — never written, never deleted
    if a prior classification already existed (a rejected re-classification just
    leaves the existing FundClassification, if any, untouched).
    """
    from instruments.models import Instrument

    applied = 0
    for row in classifications:
        if not row.get('approved'):
            continue
        try:
            instrument = Instrument.objects.get(pk=row['instrument_id'])
        except Instrument.DoesNotExist:
            continue

        FundClassification.objects.update_or_create(
            instrument=instrument,
            defaults={
                'bucket': row['bucket'],
                'rule_60_40_category': row['rule_60_40_category'],
                'reasoning': row.get('reasoning', ''),
                'model_used': CLASSIFY_MODEL,
            },
        )
        applied += 1
    return applied


def compare_fund_returns(instrument, household_id: int, as_of: date) -> FundReturnsComparison:
    """Compare one fund's XIRR against other funds in the same household that
    share its fund_category, in plain English. All XIRR figures come from
    compute_xirr() — Gemini only narrates them."""
    from instruments.models import Instrument
    from insights.services import compute_xirr

    mf_details = getattr(instrument, 'mf_details', None)
    category = mf_details.fund_category if mf_details else ''

    peer_query = Instrument.objects.filter(
        household_id=household_id,
        instrument_type__in=[Instrument.InstrumentType.MUTUAL_FUND, Instrument.InstrumentType.SIP],
    ).exclude(pk=instrument.pk).select_related('mf_details')
    if category:
        peer_query = peer_query.filter(mf_details__fund_category=category)

    this_xirr = compute_xirr(household_id, as_of, instrument.id)
    peers = []
    for peer in peer_query[:10]:
        peer_xirr = compute_xirr(household_id, as_of, peer.id)
        if peer_xirr is not None:
            peers.append({'name': peer.name, 'xirr_percent': round(peer_xirr, 2)})

    input_snapshot = {
        'as_of': as_of.isoformat(),
        'fund': {'name': instrument.name, 'fund_category': category, 'xirr_percent': round(this_xirr, 2) if this_xirr is not None else None},
        'expense_ratio': str(mf_details.expense_ratio) if mf_details and mf_details.expense_ratio is not None else None,
        'peers': peers,
    }

    prompt = (
        'Here is one mutual fund holding and its XIRR (annualized return), alongside XIRR figures '
        'for similar funds held in the same household (same fund category where known). '
        'Write a short, plain-English paragraph (3-5 sentences) comparing this fund\'s returns to its '
        'peers. Do not invent any numbers beyond what is given below; if there are no peers, say so '
        'and just describe the fund\'s own return.\n\n'
        f'{input_snapshot}'
    )

    client = get_client()
    response = client.models.generate_content(model=EXPLAIN_MODEL, contents=prompt)
    summary = response.text or ''

    comparison, _ = FundReturnsComparison.objects.update_or_create(
        instrument=instrument,
        defaults={'summary': summary, 'input_snapshot': input_snapshot, 'model_used': EXPLAIN_MODEL},
    )
    return comparison


def explain_rebalancing(household_id: int, as_of: date) -> RebalancingExplanation:
    """Turn compute_rebalancing()'s current-vs-target/drift/buy-sell rows into a
    plain-English explanation. All numbers come from compute_rebalancing() —
    Gemini only narrates them, never recomputes."""
    from insights.services import compute_rebalancing

    data = compute_rebalancing(household_id, as_of)

    prompt = (
        'Here is a household\'s current portfolio rebalancing picture: total portfolio value, '
        'and per-category current %, target %, drift %, and suggested buy/sell amount. '
        'Write a short, plain-English explanation (4-6 sentences) of what\'s going on and what '
        'the household should consider doing, in priority order (biggest drift first). '
        'Do not invent or alter any numbers — use only the figures given below.\n\n'
        f'{data}'
    )

    client = get_client()
    response = client.models.generate_content(model=EXPLAIN_MODEL, contents=prompt)
    explanation = response.text or ''

    result, _ = RebalancingExplanation.objects.update_or_create(
        household_id=household_id,
        as_of_date=as_of,
        defaults={'explanation': explanation, 'input_snapshot': data, 'model_used': EXPLAIN_MODEL},
    )
    return result
