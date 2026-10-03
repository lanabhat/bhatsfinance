"""Suggest the mfapi.in scheme for a held fund, from its name.

Suggestions only: a link is created when the user confirms it. A wrong scheme would
silently mis-value the holding, so ambiguity is reported, never guessed through.

Plan (Direct/Regular) and option (Growth/IDCW) must agree — they are different
schemes with different NAVs. The remaining "core" name words are compared by
overlap, so "Axis Midcap" prefers "Axis Midcap Fund" over "Axis Nifty Midcap 50 Index Fund".
"""
from __future__ import annotations

import re
from typing import Callable

from fund_data.mfapi_client import MfApiError, search_schemes

_PLAN_WORDS = {'direct': 'direct', 'dir': 'direct', 'regular': 'regular', 'reg': 'regular'}
_OPTION_WORDS = {
    'growth': 'growth', 'gr': 'growth',
    'idcw': 'idcw', 'dividend': 'idcw', 'div': 'idcw', 'payout': 'idcw', 'reinvestment': 'idcw', 'reinvest': 'idcw',
    'bonus': 'bonus',
}
# Words that differ between data sources without identifying a different scheme.
_FILLER = {'fund', 'plan', 'option', 'the', 'scheme', 'mf', 'mutual'}
_SKIP_CANDIDATE = re.compile(r'segregated|unclaimed|matured', re.I)

# "High" requires every core word to match: a partial match like "Short Term" vs
# "Ultra Short Term" scores 0.8 and is a different scheme (seen on real data).
HIGH_SCORE = 1.0
HIGH_MARGIN = 0.15


def _words(name: str) -> list[str]:
    return [w for w in re.split(r'[^a-z0-9]+', name.lower().replace('&', ' and ')) if w]


def parse_name(name: str) -> dict:
    """Split a scheme/holding name into plan, option and the remaining core words."""
    plan = option = None
    core: list[str] = []
    for w in _words(name):
        if w in _PLAN_WORDS:
            plan = plan or _PLAN_WORDS[w]
        elif w in _OPTION_WORDS:
            option = option or _OPTION_WORDS[w]
        elif w not in _FILLER:
            core.append(w)
    return {'plan': plan, 'option': option, 'core': core}


def _score(held: dict, candidate: dict) -> float | None:
    """Core-word overlap (0..1), or None when plan/option rule the candidate out."""
    for field in ('plan', 'option'):
        if held[field] and candidate[field] and held[field] != candidate[field]:
            return None
    a, b = set(held['core']), set(candidate['core'])
    if not a or not b:
        return None
    return len(a & b) / len(a | b)


def _queries(core: list[str]) -> list[str]:
    """Search terms from most to least specific; mfapi search matches all given words."""
    queries = []
    for n in range(len(core), 1, -1):
        q = ' '.join(core[:n])
        if q not in queries:
            queries.append(q)
    return queries[:4]


def suggest_scheme(name: str, search: Callable[[str], list[dict]] = search_schemes) -> dict:
    """Return {'best': {...} | None, 'confidence': 'high'|'low'|'none', 'candidates': [...]}.

    Each candidate is {'scheme_code', 'scheme_name', 'score'}. `search` is injectable
    so callers can cache results and tests can avoid the network.
    """
    held = parse_name(name)
    results: list[dict] = []
    for query in _queries(held['core']):
        try:
            results = search(query)
        except MfApiError:
            results = []
        if results:
            break

    scored = []
    for r in results:
        scheme_name = str(r.get('schemeName', ''))
        if _SKIP_CANDIDATE.search(scheme_name):
            continue
        s = _score(held, parse_name(scheme_name))
        if s is not None:
            scored.append({'scheme_code': str(r.get('schemeCode')), 'scheme_name': scheme_name, 'score': round(s, 3)})
    scored.sort(key=lambda c: c['score'], reverse=True)

    if not scored:
        return {'best': None, 'confidence': 'none', 'candidates': []}
    best = scored[0]
    runner_up = scored[1]['score'] if len(scored) > 1 else 0.0
    confident = (
        best['score'] >= HIGH_SCORE - 1e-9
        and best['score'] - runner_up >= HIGH_MARGIN
        and held['plan'] is not None
        and held['option'] is not None
    )
    return {'best': best, 'confidence': 'high' if confident else 'low', 'candidates': scored[:5]}
