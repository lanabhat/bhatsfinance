"""Parser for AMC monthly portfolio disclosure .xlsx files (SEBI-mandated format).

These files vary slightly in exact row offsets between AMCs, so this locates the
header row by content rather than assuming a fixed position. Confirmed against a
real Axis Mutual Fund disclosure: header row has cells like "Name of the
Instrument", "ISIN", "% to Net Assets" (matched case-insensitively, since wording
varies, e.g. "% to Net\n Assets" with an embedded newline).
"""
from __future__ import annotations

import io
from decimal import Decimal, InvalidOperation

import openpyxl


class HoldingsParseError(Exception):
    pass


def _normalize(cell) -> str:
    return str(cell or '').replace('\n', ' ').strip().lower()


def _find_header_row(rows: list[tuple]) -> tuple[int, dict[str, int]]:
    """Return (row_index, {field: column_index}) for the first row that looks like
    a holdings table header."""
    for i, row in enumerate(rows):
        normalized = [_normalize(c) for c in row]
        name_col = next((j for j, c in enumerate(normalized) if 'name of the instrument' in c or c == 'name of instrument'), None)
        isin_col = next((j for j, c in enumerate(normalized) if c == 'isin'), None)
        weight_col = next((j for j, c in enumerate(normalized) if '% to net' in c), None)
        if name_col is not None and isin_col is not None and weight_col is not None:
            industry_col = next((j for j, c in enumerate(normalized) if 'industry' in c or 'rating' in c or 'sector' in c), None)
            return i, {'name': name_col, 'isin': isin_col, 'weight': weight_col, 'industry': industry_col}
    raise HoldingsParseError(
        'Could not find a holdings table header (expected columns like "Name of the '
        'Instrument", "ISIN", "% to Net Assets"). This file may not be a standard '
        'portfolio disclosure sheet.'
    )


def _parse_weight(raw) -> Decimal | None:
    if raw is None:
        return None
    try:
        value = Decimal(str(raw))
    except InvalidOperation:
        return None
    # Some AMCs report weight as a fraction (0.0456), others as a percent (4.56).
    if value != 0 and abs(value) < 1:
        value *= 100
    return value


def parse_holdings_workbook(file_bytes: bytes) -> list[dict]:
    """Returns a list of {isin, instrument_name, industry, weight_percent} dicts,
    one per actual stock/instrument position. Section header rows (e.g. "Equity &
    Equity related") and blank rows are skipped since they have no ISIN.
    """
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as exc:
        raise HoldingsParseError(f'Could not read this as an Excel (.xlsx) file: {exc}') from exc

    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    header_idx, cols = _find_header_row(rows)

    results = []
    for row in rows[header_idx + 1:]:
        if cols['name'] >= len(row):
            continue
        isin = str(row[cols['isin']] or '').strip() if cols['isin'] < len(row) else ''
        name = str(row[cols['name']] or '').strip()
        if not isin or not name:
            # Section headers ("Equity & Equity related", subtotal rows, blank
            # separators) have no ISIN — skip them rather than guessing.
            continue
        weight = _parse_weight(row[cols['weight']]) if cols['weight'] < len(row) else None
        if weight is None:
            continue
        industry = ''
        if cols['industry'] is not None and cols['industry'] < len(row):
            industry = str(row[cols['industry']] or '').strip()
        results.append({
            'isin': isin,
            'instrument_name': name,
            'industry': industry,
            'weight_percent': weight,
        })

    if not results:
        raise HoldingsParseError('Found a header row but no holding rows with both an ISIN and a weight.')
    return results
