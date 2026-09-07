"""Age-based ideal allocation rule-of-thumb ("100/110/120 minus age"), mapped onto
the household's actual AssetCategory tags via each holding's instrument_type.

This is a well-known heuristic, not personalized advice — it only accounts for age,
not income, goals, or individual risk tolerance. Presented to the user as a
starting point they can adjust, never as a final answer.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from insights.services import ZERO, compute_category_breakdown, compute_holdings

# instrument_type -> coarse risk bucket. Types not listed here (gold, real_estate,
# vehicle, insurance, other, liability) aren't covered by this rule of thumb.
EQUITY_TYPES = {'equity', 'mutual_fund', 'sip'}
DEBT_TYPES = {'fd', 'rd', 'epf', 'ppf', 'nps', 'cash', 'lending'}

RULE_LABELS = {
    100: 'Conservative — 100 minus age',
    110: 'Balanced — 110 minus age',
    120: 'Growth — 120 minus age',
}


def _instrument_bucket(instrument) -> str:
    """equity / debt / other — uses the AI classification (ai_insights.FundClassification)
    when the instrument has one, since that's a real judgment call rather than a
    blunt type guess; falls back to the instrument_type heuristic otherwise. A
    household with no classified funds behaves exactly as before this existed."""
    classification = getattr(instrument, 'ai_classification', None)
    if classification is not None:
        return classification.bucket
    if instrument.instrument_type in EQUITY_TYPES:
        return 'equity'
    if instrument.instrument_type in DEBT_TYPES:
        return 'debt'
    return 'other'


def calculate_age(date_of_birth: date, as_of: date) -> int:
    years = as_of.year - date_of_birth.year
    if (as_of.month, as_of.day) < (date_of_birth.month, date_of_birth.day):
        years -= 1
    return years


def suggest_age_based_split(age: int, equity_base: int = 100) -> dict:
    equity_percent = max(0, min(100, equity_base - age))
    debt_percent = 100 - equity_percent
    return {
        'age': age,
        'equity_base': equity_base,
        'rule_label': RULE_LABELS.get(equity_base, f'{equity_base} minus age'),
        'equity_percent': equity_percent,
        'debt_percent': debt_percent,
    }


def suggest_category_targets(household_id: int, as_of: date, age: int, equity_base: int = 100) -> dict:
    """For each AssetCategory, classify it equity-ish / debt-ish / uncovered by the
    instrument-type composition of what's currently tagged into it, then propose a
    target % for the equity-ish and debt-ish categories based on the age rule.

    A category with a clean single-bucket composition (100% equity-type or 100%
    debt-type instruments) gets a direct suggestion. A category with genuinely mixed
    composition, or no instruments yet, is reported as 'mixed'/'empty' with no
    suggested split invented on the user's behalf.
    """
    from instruments.models import AssetCategory, Instrument

    split = suggest_age_based_split(age, equity_base)

    holdings = compute_holdings(household_id, as_of)
    instruments_by_id = {
        i.id: i for i in Instrument.objects.filter(id__in=[h['instrument_id'] for h in holdings])
        .select_related('asset_category', 'ai_classification')
    }

    # value of equity-ish / debt-ish holdings per category
    category_composition: dict[int, dict] = {}
    for h in holdings:
        inst = instruments_by_id.get(h['instrument_id'])
        if inst is None or inst.asset_category_id is None:
            continue
        cat_id = inst.asset_category_id
        entry = category_composition.setdefault(cat_id, {'equity_value': ZERO, 'debt_value': ZERO, 'other_value': ZERO})
        bucket = _instrument_bucket(inst)
        if bucket == 'equity':
            entry['equity_value'] += h['market_value']
        elif bucket == 'debt':
            entry['debt_value'] += h['market_value']
        elif bucket == 'hybrid':
            half = h['market_value'] / 2
            entry['equity_value'] += half
            entry['debt_value'] += half
        else:
            entry['other_value'] += h['market_value']

    categories = AssetCategory.objects.filter(household_id=household_id)
    category_rows = []
    equity_bucket_categories = []
    debt_bucket_categories = []

    for cat in categories:
        comp = category_composition.get(cat.id)
        if comp is None:
            category_rows.append({
                'category_id': cat.id, 'category_name': cat.name, 'color': cat.color,
                'classification': 'empty', 'suggested_target_percent': None,
            })
            continue
        total = comp['equity_value'] + comp['debt_value'] + comp['other_value']
        if total == ZERO:
            classification = 'empty'
        elif comp['equity_value'] == total:
            classification = 'equity'
            equity_bucket_categories.append(cat)
        elif comp['debt_value'] == total:
            classification = 'debt'
            debt_bucket_categories.append(cat)
        else:
            classification = 'mixed'
        category_rows.append({
            'category_id': cat.id, 'category_name': cat.name, 'color': cat.color,
            'classification': classification, 'suggested_target_percent': None,
        })

    # Split each bucket's suggested % evenly across the categories that fall
    # cleanly into it — an even split is a starting point, not a judgment call
    # about which category should get more.
    if equity_bucket_categories:
        each = (Decimal(split['equity_percent']) / len(equity_bucket_categories)).quantize(Decimal('0.01'))
        for row in category_rows:
            if row['category_id'] in {c.id for c in equity_bucket_categories}:
                row['suggested_target_percent'] = str(each)
    if debt_bucket_categories:
        each = (Decimal(split['debt_percent']) / len(debt_bucket_categories)).quantize(Decimal('0.01'))
        for row in category_rows:
            if row['category_id'] in {c.id for c in debt_bucket_categories}:
                row['suggested_target_percent'] = str(each)

    return {**split, 'categories': category_rows}
