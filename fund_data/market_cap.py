"""Market-cap sub-category for stocks/ETFs and equity funds.

SEBI's definition: the top 100 listed companies by market cap are large cap,
101–250 mid cap, everything after small cap. NSE's Nifty 100 and Nifty Midcap 150
lists track exactly those bands and are reachable on PythonAnywhere's free
allowlist (nseindia.com), keyed by ISIN:
  https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv
  https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv
A listed stock in neither list is small cap. ETFs (INF ISINs) are classified by
the index their name tracks; funds by their MutualFundDetails sub-category.
"""
from __future__ import annotations

import csv
import io
import re
import time

import requests

from fund_data.mfapi_client import MfApiError
from fund_data.mirror import mirror_url
from fund_data.nse_client import HEADERS

LARGE, MID, SMALL, MULTI = 'large_cap', 'mid_cap', 'small_cap', 'multi'

LIST_URLS = {
    LARGE: 'https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv',
    MID: 'https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv',
}
CACHE_SECONDS = 12 * 60 * 60
_cache: dict = {'at': 0.0, 'caps': None}

# ETF names (abbreviated by brokers, e.g. "ICICI NIFTY NXT50ETF", "NIP ETF NIFTY50 BEES").
NON_EQUITY_ETF = re.compile(r'gold|gld|silver|liq|liquid|gilt|bond|g-?sec|overnight', re.I)
_ETF_SMALL = re.compile(r'small', re.I)
_ETF_MID = re.compile(r'mid', re.I)
_ETF_LARGE = re.compile(r'nifty|n50|n100|nxt|next|sensex|bank|metal|oil|it\b|pharma|fmcg|auto|psu|cpse|bees|lv30|v20', re.I)

_FUND_NOT_EQUITY = re.compile(r'debt|liquid|money market|overnight|gilt|bond|credit|duration|hybrid|arbitrage|gold|silver|fixed|fof|fund of fund', re.I)
_FUND_LARGE_AND_MID = re.compile(r'large\s*&\s*mid|large and mid', re.I)
_FUND_LARGE = re.compile(r'large\s*cap|bluechip|blue chip|nifty\s*50\b|nifty\s*100\b|next\s*50|sensex', re.I)
_FUND_MID = re.compile(r'mid\s*cap|midcap', re.I)
_FUND_SMALL = re.compile(r'small\s*cap|smallcap', re.I)


def _download(url: str) -> list[dict]:
    """The list from NSE, or its copy on the market-data branch when NSE is blocked."""
    try:
        return _download_one(url)
    except MfApiError as direct_error:
        try:
            return _download_one(mirror_url('nse/' + url.rsplit('/', 1)[-1]))
        except MfApiError as mirror_error:
            raise MfApiError(f'{direct_error}; {mirror_error}') from mirror_error


def _download_one(url: str) -> list[dict]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
    except requests.RequestException as exc:
        raise MfApiError(f'NSE index list download failed ({url}): {exc}') from exc
    if not resp.ok:
        raise MfApiError(f'NSE index list download failed ({url}): HTTP {resp.status_code}')
    rows = list(csv.DictReader(io.StringIO(resp.content.decode('utf-8-sig'))))
    if not rows or 'ISIN Code' not in rows[0]:
        raise MfApiError(f'NSE index list at {url} was not the expected CSV')
    return rows


def fetch_cap_lists() -> dict[str, str]:
    """{isin: 'large_cap' | 'mid_cap'} for the Nifty 100 and Nifty Midcap 150."""
    if _cache['caps'] is not None and time.monotonic() - _cache['at'] < CACHE_SECONDS:
        return _cache['caps']
    caps: dict[str, str] = {}
    for cap, url in LIST_URLS.items():
        for row in _download(url):
            isin = (row.get('ISIN Code') or '').strip().upper()
            if isin:
                caps.setdefault(isin, cap)
    _cache.update({'at': time.monotonic(), 'caps': caps})
    return caps


def cap_for_stock(isin: str, name: str, lists: dict[str, str]) -> str:
    """'large_cap' / 'mid_cap' / 'small_cap', or '' when it isn't an equity holding."""
    from instruments.services import is_bond_isin

    isin = (isin or '').upper()
    if is_bond_isin(isin):
        return ''  # a bond/debenture filed under Equity has no market cap
    if isin.startswith('INE'):
        return lists.get(isin, SMALL)  # listed but outside the top 250
    if isin.startswith('INF'):  # ETF: classify by the index it tracks
        if NON_EQUITY_ETF.search(name or ''):
            return ''
        if _ETF_SMALL.search(name or ''):
            return SMALL
        if _ETF_MID.search(name or ''):
            return MID
        if _ETF_LARGE.search(name or ''):
            return LARGE
    return ''


def cap_for_fund(fund_sub_category: str, fund_category: str = '') -> str | None:
    """A fund's cap from its sub-category (falling back to category): a cap, 'multi'
    for diversified equity funds, '' when the fund isn't categorised yet, or None
    for non-equity funds (debt, liquid, hybrid, gold…)."""
    text = f'{fund_sub_category or ""} {fund_category or ""}'.strip()
    if not text:
        return ''
    if _FUND_NOT_EQUITY.search(text):
        return None
    if _FUND_LARGE_AND_MID.search(text):
        return MULTI
    if _FUND_SMALL.search(text):
        return SMALL
    if _FUND_MID.search(text):
        return MID
    if _FUND_LARGE.search(text):
        return LARGE
    return MULTI


def update_stock_caps(household_id: int | None = None) -> dict:
    """Set market_cap on every stock/ETF the user hasn't classified by hand."""
    from instruments.models import Instrument, Investment
    from instruments.services import holding_isin

    lists = fetch_cap_lists()
    stocks = Investment.objects.filter(instrument__instrument_type=Instrument.InstrumentType.EQUITY, market_cap_auto=True)
    if household_id is not None:
        stocks = stocks.filter(instrument__household_id=household_id)
    counts = {LARGE: 0, MID: 0, SMALL: 0, 'unclassified': 0}
    for inv in stocks:
        cap = cap_for_stock(holding_isin(inv), inv.name, lists)
        counts[cap or 'unclassified'] += 1
        if inv.market_cap != cap:
            inv.market_cap = cap
            inv.save(update_fields=['market_cap', 'updated_at'])
    return counts


def ensure_equities_category(household) -> bool:
    """Give the household's "Equity" shell a category when it has none: the existing
    "Equities" (or "Stocks") category, else a new "Equities". Returns True if set."""
    from instruments.models import Instrument
    from instruments.services import EQUITY_SHELL_NAME

    shell = Instrument.objects.filter(household=household, instrument_type=Instrument.InstrumentType.EQUITY,
                                      name=EQUITY_SHELL_NAME, asset_category__isnull=True).first()
    if shell is None:
        return False
    category = equities_category(household, create=True)
    shell.asset_category = category
    shell.save(update_fields=['asset_category', 'updated_at'])
    return True


def equities_category(household, create: bool = False):
    from instruments.models import AssetCategory

    for name in ('Equities', 'Equity', 'Stocks'):
        found = AssetCategory.objects.filter(household=household, name__iexact=name).first()
        if found:
            return found
    if create:
        return AssetCategory.objects.create(household=household, name='Equities', color='#16a34a')
    return None


CAP_CATEGORY_NAMES = {LARGE: 'Large Cap', MID: 'Mid Cap', SMALL: 'Small Cap'}
_CAP_CATEGORY_COLORS = {LARGE: '#4f46e5', MID: '#0ea5e9', SMALL: '#f59e0b'}


def cap_categories(household) -> dict:
    """{'large_cap': AssetCategory, …}, creating the household's Large/Mid/Small Cap categories if missing."""
    from django.db.models import Max
    from instruments.models import AssetCategory

    result = {}
    next_order = (AssetCategory.objects.filter(household=household).aggregate(m=Max('sort_order'))['m'] or 0) + 1
    for cap, name in CAP_CATEGORY_NAMES.items():
        category = AssetCategory.objects.filter(household=household, name__iexact=name).first()
        if category is None:
            category = AssetCategory.objects.create(household=household, name=name, color=_CAP_CATEGORY_COLORS[cap],
                                                    sort_order=next_order)
            next_order += 1
        result[cap] = category
    return result


def _named_category(household, *names):
    from instruments.models import AssetCategory
    for name in names:
        found = AssetCategory.objects.filter(household=household, name__iexact=name).first()
        if found:
            return found
    return None


def assign_cap_categories(household) -> dict:
    """Put each stock/ETF and equity fund in its market-cap category (Large/Mid/Small
    Cap), leaving holdings the user categorised by hand alone. Gold/liquid ETFs go to
    the household's Gold / Liquid Cash category; diversified, debt and hybrid funds
    keep their instrument's category ("Mutual Fund").

    The first time any holding moves into a cap category, allocation targets are
    re-expressed in the new categories at the current mix — an old category's target
    is shared out in proportion to the value that moved — so the overall intended
    allocation is unchanged. Targets are never changed automatically after that."""
    from collections import defaultdict
    from datetime import date
    from decimal import Decimal

    from django.db import transaction as db_transaction

    from insights.services import compute_holdings
    from instruments.models import AllocationTarget, Instrument, Investment, MutualFundDetails

    caps = cap_categories(household)
    gold = _named_category(household, 'Gold')
    liquid = _named_category(household, 'Liquid Cash', 'Liquid', 'Cash')

    holdings = compute_holdings(household.id, date.today())
    value_by_investment = {h['investment_id']: h['market_value'] for h in holdings if h['investment_id']}
    category_before = {h['investment_id']: h['asset_category'] for h in holdings if h['investment_id']}
    value_by_category: dict = defaultdict(Decimal)
    for h in holdings:
        value_by_category[h['asset_category']] += h['market_value']
    first_time = not AllocationTarget.objects.filter(household=household, asset_category__in=caps.values()).exists()

    fund_details = {d.investment_id: d for d in MutualFundDetails.objects.filter(investment__instrument__household=household)}
    moves: dict = defaultdict(Decimal)
    counts = {'assigned': 0, 'unchanged': 0}
    with db_transaction.atomic():
        investments = Investment.objects.filter(instrument__household=household, category_auto=True).select_related('instrument')
        for inv in investments:
            kind = inv.instrument.instrument_type
            if kind == Instrument.InstrumentType.EQUITY:
                target = caps.get(inv.market_cap)
                if target is None and NON_EQUITY_ETF.search(inv.name or ''):
                    target = gold if re.search(r'gold|gld', inv.name, re.I) else liquid if re.search(r'liq', inv.name, re.I) else None
            elif kind in (Instrument.InstrumentType.MUTUAL_FUND, Instrument.InstrumentType.SIP):
                details = fund_details.get(inv.id)
                target = caps.get(cap_for_fund(details.fund_sub_category, details.fund_category)) if details else None
            else:
                continue
            new_id = target.id if target else None
            if inv.asset_category_id == new_id:
                counts['unchanged'] += 1
                continue
            inv.asset_category_id = new_id
            inv.save(update_fields=['asset_category', 'updated_at'])
            counts['assigned'] += 1
            old_effective = category_before.get(inv.id)
            new_effective = new_id or inv.instrument.asset_category_id
            if inv.id in value_by_investment and old_effective != new_effective and new_effective:
                moves[(old_effective, new_effective)] += value_by_investment[inv.id]

        target_changes = _convert_targets(household, moves, value_by_category) if first_time and moves else []
    return {**counts, 'target_changes': target_changes}


def _convert_targets(household, moves: dict, value_by_category: dict) -> list[dict]:
    """Share each old category's target out to the categories its holdings moved to,
    in proportion to the value moved. Returns what changed."""
    from collections import defaultdict
    from decimal import Decimal

    from instruments.models import AllocationTarget

    targets = {t.asset_category_id: t for t in AllocationTarget.objects.filter(household=household).select_related('asset_category')}
    shares: dict = defaultdict(Decimal)
    for (old, new), value in moves.items():
        target = targets.get(old)
        if target is None or not value_by_category.get(old):
            continue
        shares[(old, new)] += target.target_percent * value / value_by_category[old]
    # Don't create a new target for a sliver (e.g. 0.02% for one small liquid ETF);
    # that share simply stays with the category it came from.
    gained_total: dict = defaultdict(Decimal)
    for (_old, new), share in shares.items():
        gained_total[new] += share
    gained: dict = defaultdict(Decimal)
    lost: dict = defaultdict(Decimal)
    for (old, new), share in shares.items():
        if new not in targets and gained_total[new] < Decimal('0.05'):
            continue
        lost[old] += share
        gained[new] += share

    changes = []
    cent = Decimal('0.01')
    for cat_id, share in lost.items():
        target = targets[cat_id]
        before = target.target_percent
        remaining = (before - share).quantize(cent)
        if remaining <= Decimal('0.05'):
            target.delete()
            remaining = Decimal('0')
        else:
            target.target_percent = remaining
            target.save(update_fields=['target_percent', 'updated_at'])
        changes.append({'category': target.asset_category.name, 'from': str(before), 'to': str(remaining)})
    for cat_id, share in gained.items():
        target = targets.get(cat_id)
        if target is not None and target.pk is not None:  # pk is None once deleted above
            target.refresh_from_db(fields=['target_percent'])
            before = target.target_percent
            target.target_percent = (before + share).quantize(cent)
            target.save(update_fields=['target_percent', 'updated_at'])
        else:
            before = Decimal('0')
            target = AllocationTarget.objects.create(household=household, asset_category_id=cat_id, target_percent=share.quantize(cent))
        changes.append({'category': target.asset_category.name, 'from': str(before), 'to': str(target.target_percent)})
    return changes
