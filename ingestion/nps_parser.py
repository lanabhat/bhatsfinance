"""
Parser for NPS (National Pension System, India) CGMS transaction statement
CSV exports, for both Tier I and Tier II accounts.

The statement is a loosely-structured CSV (not tabular in the usual sense —
it mixes free-text headers, a summary table, a scheme-wise summary table, and
then one "Transaction Details" block per scheme). This parser walks the raw
rows looking for section markers rather than relying on fixed row/column
indices, since blank rows and section spacing vary slightly between exports.
"""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation


class NpsParseError(Exception):
    pass


def _clean_amount(s: str) -> str:
    """Strip 'Rs', commas, and parens-as-negative into a plain decimal string."""
    s = s.strip()
    if not s:
        return ''
    negative = s.startswith('(') and s.endswith(')')
    s = s.strip('()')
    s = re.sub(r'^Rs\.?\s*', '', s, flags=re.IGNORECASE)
    s = s.replace(',', '').strip()
    if not s:
        return ''
    return f'-{s}' if negative else s


def _to_decimal(s: str) -> Decimal | None:
    cleaned = _clean_amount(s)
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _to_iso_date(s: str) -> str:
    return datetime.strptime(s.strip(), '%d-%b-%Y').date().isoformat()


_SCHEME_HEADER_RE = re.compile(
    r'NPS TRUST-\s*A/C\s+(.+?)\s+SCHEME\s+([A-Z])\s*-\s*TIER\s+(I{1,2})\s*POP',
    re.IGNORECASE,
)


def parse_nps_statement(csv_text: str) -> dict:
    """
    Parse an NPS transaction-statement CSV. Returns a dict with:
      - pran, subscriber_name, tier ('I' or 'II'), statement_date (iso)
      - total_value, total_contribution, total_withdrawal (Decimal strings)
      - schemes: [{scheme, fund_manager, tier, closing_units, nav,
                   scheme_value, transactions: [{tx_date, description,
                   amount, nav, units, kind}]}]
        kind is one of 'contribution', 'billing', 'other' (opening/closing
        balance rows are dropped — they're anchors, not real transactions).
    """
    reader = csv.reader(io.StringIO(csv_text))
    rows = [row for row in reader]

    if not rows:
        raise NpsParseError('Empty file.')

    header_text = '\n'.join(','.join(r) for r in rows[:8])
    tier_match = re.search(r'Tier\s+(I{1,2})\s+Account', header_text, re.IGNORECASE)
    if not tier_match:
        raise NpsParseError('This does not look like an NPS transaction statement (Tier I/II header not found).')
    tier = tier_match.group(1).upper()

    pran = ''
    subscriber_name = ''
    statement_date = ''
    total_value = None
    total_contribution = None
    total_withdrawal = None

    for row in rows:
        if not row:
            continue
        label = row[0].strip()
        if label.upper().startswith('PRAN'):
            pran = row[1].strip().lstrip("'") if len(row) > 1 else ''
        elif label.upper().startswith('SUBSCRIBER NAME'):
            subscriber_name = row[1].strip() if len(row) > 1 else ''
        elif 'STATEMENT GENERATION DATE' in label.upper():
            m = re.search(r'([A-Za-z]+\s+\d{1,2}\s+\d{4})', label)
            if m:
                try:
                    statement_date = datetime.strptime(m.group(1), '%B %d %Y').date().isoformat()
                except ValueError:
                    pass
        elif label.startswith('Rs ') and total_value is None:
            # Summary data row: "Rs 705632.33", "52", "Rs 454977.11", "Rs 0.00", ...
            total_value = _to_decimal(row[0])
            if len(row) > 2:
                total_contribution = _to_decimal(row[2])
            if len(row) > 3:
                total_withdrawal = _to_decimal(row[3])

    if not pran:
        raise NpsParseError('Could not find PRAN in this statement.')

    # -- Walk scheme blocks under "Transaction Details" ---------------------
    # Scheme headers also appear earlier in the "Scheme Wise Summary" table,
    # so only start scanning after the literal "Transaction Details" marker.
    tx_details_idx = next(
        (idx for idx, r in enumerate(rows) if r and 'transaction details' in r[0].strip().lower()),
        None,
    )
    if tx_details_idx is None:
        raise NpsParseError('Could not find the "Transaction Details" section in this statement.')

    schemes: list[dict] = []
    i = tx_details_idx
    n = len(rows)
    while i < n:
        row = rows[i]
        joined = ','.join(row)
        header_match = _SCHEME_HEADER_RE.search(joined)
        if not header_match:
            i += 1
            continue

        fund_manager, scheme_letter, scheme_tier_roman = header_match.groups()
        scheme_tier = scheme_tier_roman.upper()

        # Next non-blank row should be the "Date,Description,Amount..." header
        j = i + 1
        while j < n and not rows[j]:
            j += 1
        if j < n and rows[j] and rows[j][0].strip().lower() == 'date':
            j += 1

        transactions = []
        closing_units = None
        while j < n:
            r = rows[j]
            if not r or not r[0].strip():
                j += 1
                if j < n and _SCHEME_HEADER_RE.search(','.join(rows[j])) if j < n else False:
                    break
                # Two blank-ish rows in a row (or EOF) ends this scheme's block
                if j >= n or not rows[j]:
                    break
                continue
            if _SCHEME_HEADER_RE.search(','.join(r)):
                break

            date_raw = r[0].strip()
            try:
                tx_date = _to_iso_date(date_raw)
            except ValueError:
                j += 1
                continue

            description = r[1].strip() if len(r) > 1 else ''
            amount = _to_decimal(r[2]) if len(r) > 2 else None
            nav = _to_decimal(r[3]) if len(r) > 3 else None
            units = _to_decimal(r[4]) if len(r) > 4 else None

            desc_lower = description.lower()
            if 'closing balance' in desc_lower:
                closing_units = units
                j += 1
                continue
            if 'opening balance' in desc_lower:
                j += 1
                continue

            if desc_lower.startswith('by contribution') or desc_lower.startswith('contribution'):
                kind = 'contribution'
            elif desc_lower.startswith('billing'):
                kind = 'billing'
            else:
                kind = 'other'

            transactions.append({
                'tx_date': tx_date,
                'description': description,
                'amount': str(amount) if amount is not None else '',
                'nav': str(nav) if nav is not None else '',
                'units': str(units) if units is not None else '',
                'kind': kind,
            })
            j += 1

        schemes.append({
            'scheme': scheme_letter.upper(),
            'fund_manager': fund_manager.strip(),
            'tier': scheme_tier,
            'closing_units': str(closing_units) if closing_units is not None else '',
            'transactions': transactions,
        })
        i = j

    if not schemes:
        raise NpsParseError('Could not find any scheme transaction blocks in this statement.')

    return {
        'pran': pran,
        'subscriber_name': subscriber_name,
        'tier': tier,
        'statement_date': statement_date,
        'total_value': str(total_value) if total_value is not None else '',
        'total_contribution': str(total_contribution) if total_contribution is not None else '',
        'total_withdrawal': str(total_withdrawal) if total_withdrawal is not None else '',
        'schemes': schemes,
    }
