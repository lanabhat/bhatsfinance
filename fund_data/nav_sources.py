"""One entry point over the NAV sources: mfapi.in for mutual funds, AMFI's SIF
file for Specialised Investment Funds. Scheme codes tell them apart — SIF codes
start with "SIF-", mfapi codes are numeric."""
from __future__ import annotations

import requests

from fund_data import amfi_sif_client, mfapi_client
from fund_data.mfapi_client import MfApiError


def is_sif(scheme_code: str) -> bool:
    return str(scheme_code).upper().startswith(amfi_sif_client.CODE_PREFIX)


def source_label(scheme_code: str) -> str:
    return 'AMFI SIF' if is_sif(scheme_code) else 'mfapi.in'


def search_schemes(query: str) -> list[dict]:
    """mfapi.in results plus matching SIFs. One source failing doesn't hide the other's results."""
    results: list[dict] = []
    errors: list[Exception] = []
    for search in (mfapi_client.search_schemes, amfi_sif_client.search_sifs):
        try:
            results.extend(search(query))
        except (MfApiError, requests.RequestException) as exc:
            errors.append(exc)
    if len(errors) == 2:
        raise MfApiError(f'Fund search failed: {errors[0]}')
    return results


def fetch_scheme_nav_history(scheme_code: str) -> dict:
    if is_sif(scheme_code):
        return amfi_sif_client.fetch_sif_nav(scheme_code)
    return mfapi_client.fetch_scheme_nav_history(scheme_code)
