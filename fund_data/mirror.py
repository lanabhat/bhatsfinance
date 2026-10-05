"""Copies of market data files kept on the repo's `market-data` branch.

PythonAnywhere's free allowlist doesn't include www.amfiindia.com or
nsearchives.nseindia.com, but does include githubusercontent.com. The
.github/workflows/market-data-mirror.yml Action downloads the files there twice a
day; clients try the real source first and fall back to these copies.
"""
import os

MIRROR_BASE = os.environ.get(
    'MARKET_DATA_MIRROR', 'https://raw.githubusercontent.com/lanabhat/bhatsfinance/market-data/',
)


def mirror_url(path: str) -> str:
    return MIRROR_BASE.rstrip('/') + '/' + path.lstrip('/')
