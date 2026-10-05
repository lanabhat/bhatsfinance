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
