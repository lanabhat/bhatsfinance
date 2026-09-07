"""Thin client for api.mfapi.in — free, no-auth Indian mutual fund NAV history.

Confirmed live during development:
  GET /mf/search?q=<name>  -> [{"schemeCode": int, "schemeName": str}, ...]
  GET /mf/<scheme_code>    -> {"meta": {...}, "data": [{"date": "DD-MM-YYYY", "nav": "123.1300"}, ...]}
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import requests

BASE_URL = 'https://api.mfapi.in'
TIMEOUT_SECONDS = 15


class MfApiError(Exception):
    pass


def search_schemes(query: str) -> list[dict]:
    resp = requests.get(f'{BASE_URL}/mf/search', params={'q': query}, timeout=TIMEOUT_SECONDS)
    if not resp.ok:
        raise MfApiError(f'mfapi.in search failed: HTTP {resp.status_code}')
    return resp.json()


def fetch_scheme_nav_history(scheme_code: str) -> dict:
    """Returns {'meta': {...}, 'history': [{'date': date, 'nav': Decimal}, ...]} sorted ascending by date."""
    resp = requests.get(f'{BASE_URL}/mf/{scheme_code}', timeout=TIMEOUT_SECONDS)
    if not resp.ok:
        raise MfApiError(f'mfapi.in fetch failed for scheme {scheme_code}: HTTP {resp.status_code}')
    payload = resp.json()
    if payload.get('status') == 'SUCCESS' is False:
        raise MfApiError(f'mfapi.in returned an error for scheme {scheme_code}')

    history = []
    for row in payload.get('data', []):
        try:
            nav_date = datetime.strptime(row['date'], '%d-%m-%Y').date()
            nav = Decimal(row['nav'])
        except (KeyError, ValueError, TypeError):
            continue
        history.append({'date': nav_date, 'nav': nav})
    history.sort(key=lambda r: r['date'])
    return {'meta': payload.get('meta', {}), 'history': history}
