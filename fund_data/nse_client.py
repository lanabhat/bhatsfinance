"""End-of-day closing prices for NSE-listed stocks and ETFs, from NSE's daily bhavcopy.

One zipped CSV per trading day covers every listed security, keyed here by ISIN:
  https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip
  columns include TradDt, ISIN, TckrSymb, SctySrs, FinInstrmNm, ClsPric
A non-trading day (weekend/holiday, or today before the file is published) is a 404,
so callers get the latest file on or before the requested date.
"""
from __future__ import annotations

import csv
import io
import time
import zipfile
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

import requests

from fund_data.mfapi_client import MfApiError

URL_TEMPLATE = 'https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{ymd}_F_0000.csv.zip'
TIMEOUT_SECONDS = 20
MAX_DAYS_BACK = 7
CACHE_SECONDS = 30 * 60
# NSE rejects requests without a browser-like User-Agent.
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': '*/*'}

_cache: dict[date, tuple[float, dict]] = {}


def parse_bhavcopy(csv_text: str) -> dict[str, dict]:
    """{isin: {'close', 'symbol', 'name', 'date'}}; the EQ series wins when an ISIN trades in several."""
    prices: dict[str, dict] = {}
    for row in csv.DictReader(io.StringIO(csv_text)):
        isin = (row.get('ISIN') or '').strip().upper()
        if not isin:
            continue
        try:
            close = Decimal((row.get('ClsPric') or '').strip())
            trade_date = date.fromisoformat((row.get('TradDt') or '').strip())
        except (InvalidOperation, ValueError):
            continue
        if isin in prices and prices[isin]['series'] == 'EQ':
            continue
        prices[isin] = {
            'close': close,
            'symbol': (row.get('TckrSymb') or '').strip(),
            'name': (row.get('FinInstrmNm') or '').strip(),
            'series': (row.get('SctySrs') or '').strip(),
            'date': trade_date,
        }
    return prices


def _download(day: date) -> dict[str, dict] | None:
    url = URL_TEMPLATE.format(ymd=day.strftime('%Y%m%d'))
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        raise MfApiError(f'NSE bhavcopy download failed ({url}): {exc}') from exc
    if resp.status_code == 404:
        return None
    if not resp.ok:
        raise MfApiError(f'NSE bhavcopy download failed ({url}): HTTP {resp.status_code}')
    try:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            csv_text = zf.read(zf.namelist()[0]).decode('utf-8-sig')
    except (zipfile.BadZipFile, IndexError) as exc:
        raise MfApiError(f'NSE bhavcopy at {url} was not a zip file (blocked by a proxy?)') from exc
    return parse_bhavcopy(csv_text)


def fetch_close_prices(as_of: date | None = None) -> dict:
    """{'date': trading date, 'prices': {isin: {...}}} from the latest bhavcopy on or before as_of."""
    as_of = as_of or date.today()
    cached = _cache.get(as_of)
    if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
        return cached[1]
    for back in range(MAX_DAYS_BACK + 1):
        day = as_of - timedelta(days=back)
        prices = _download(day)
        if prices:
            result = {'date': day, 'prices': prices}
            _cache[as_of] = (time.monotonic(), result)
            return result
    raise MfApiError(f'No NSE bhavcopy found in the {MAX_DAYS_BACK} days up to {as_of}')
