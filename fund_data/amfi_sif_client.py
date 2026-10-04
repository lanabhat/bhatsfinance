"""Latest NAVs for Specialised Investment Funds (SIFs, e.g. qsif) from AMFI.

SIFs are not in mfapi.in or AMFI's main NAVAll.txt; AMFI publishes them in a
separate file with codes like "SIF-23". It carries only the latest NAV, so a
linked SIF builds up its NAV history one point per daily_refresh run.

File format (semicolon-separated; header, category and AMC lines interleaved):
  Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date
  SIF-1;INF966L30019;-;qsif Equity Long-Short Fund;Direct Plan;Growth Option;10.9722;01-Oct-2026
"""
from __future__ import annotations

import os
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation

import requests

from fund_data.mfapi_client import MfApiError

SIF_NAV_URL = 'https://www.amfiindia.com/spages/SIF_NAVAll.txt'
# Copy of the same file kept by .github/workflows/sif-nav-mirror.yml, for hosts that
# can't reach amfiindia.com (PythonAnywhere's free allowlist covers githubusercontent.com).
SIF_NAV_MIRROR_URL = os.environ.get(
    'SIF_NAV_MIRROR_URL',
    'https://raw.githubusercontent.com/lanabhat/bhatsfinance/sif-nav-data/SIF_NAVAll.txt',
)
TIMEOUT_SECONDS = 20
CACHE_SECONDS = 30 * 60
CODE_PREFIX = 'SIF-'

_cache: dict = {'at': 0.0, 'records': None}


def parse_sif_nav_file(text: str) -> dict[str, dict]:
    """{scheme_code: {'scheme_code', 'scheme_name', 'nav', 'date'}} for every parseable scheme row."""
    records: dict[str, dict] = {}
    for line in text.splitlines():
        parts = [p.strip() for p in line.split(';')]
        if len(parts) != 8 or not parts[0].upper().startswith(CODE_PREFIX):
            continue
        code, _, _, name, plan, option, nav, nav_date = parts
        try:
            nav_value = Decimal(nav)
            parsed_date = datetime.strptime(nav_date, '%d-%b-%Y').date()
        except (InvalidOperation, ValueError):
            continue
        # Plan/option joined into the name so matching.parse_name can tell them apart.
        records[code] = {
            'scheme_code': code,
            'scheme_name': ' - '.join(p for p in (name, plan, option) if p),
            'nav': nav_value,
            'date': parsed_date,
        }
    return records


def _download(url: str) -> dict[str, dict]:
    try:
        resp = requests.get(url, timeout=TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        raise MfApiError(f'SIF NAV download failed ({url}): {exc}') from exc
    if not resp.ok:
        raise MfApiError(f'SIF NAV download failed ({url}): HTTP {resp.status_code}')
    records = parse_sif_nav_file(resp.text)
    if not records:  # e.g. a proxy's block page served with 200
        raise MfApiError(f'SIF NAV file at {url} had no scheme rows')
    return records


def _load() -> dict[str, dict]:
    """AMFI's file, or the GitHub copy when AMFI can't be reached from this host."""
    if _cache['records'] is not None and time.monotonic() - _cache['at'] < CACHE_SECONDS:
        return _cache['records']
    errors = []
    for url in (SIF_NAV_URL, SIF_NAV_MIRROR_URL):
        try:
            _cache['records'] = _download(url)
            _cache['at'] = time.monotonic()
            return _cache['records']
        except MfApiError as exc:
            errors.append(str(exc))
    raise MfApiError('; '.join(errors))


def search_sifs(query: str) -> list[dict]:
    """Schemes whose name contains every query word — same shape as mfapi.in search."""
    words = query.lower().split()
    if not words:
        return []
    return [
        {'schemeCode': r['scheme_code'], 'schemeName': r['scheme_name']}
        for r in _load().values()
        if all(w in r['scheme_name'].lower() for w in words)
    ]


def fetch_sif_nav(scheme_code: str) -> dict:
    """The latest NAV as a one-point history — same shape as mfapi_client.fetch_scheme_nav_history."""
    record = _load().get(scheme_code)
    if record is None:
        raise MfApiError(f'AMFI SIF file has no scheme {scheme_code}')
    return {
        'meta': {'scheme_code': scheme_code, 'scheme_name': record['scheme_name']},
        'history': [{'date': record['date'], 'nav': record['nav']}],
    }
