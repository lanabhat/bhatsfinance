"""
Parser for HDFC Bank PPF account statement .xls exports.

Unlike the NPS/EPF text-based parsers, this is a genuine legacy Excel binary
(OLE2/CDFV2), read via xlrd. The statement is a bank-account-style ledger
(Date/Narration/Withdrawal/Deposit/Closing Balance) rather than a PPF-specific
format — PPF-only rows are recognized by narration text ("SI ... PPF" for
deposits, "Interest paid" for the yearly interest credit).

Bank PPF statements typically only cover a limited lookback window (e.g. one
year), not the account's full history since opening — the parser surfaces
the account open date and the statement's own opening balance so the caller
can backfill the gap with a user-supplied estimate rather than fabricating one.
"""
from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal


class PpfParseError(Exception):
    pass


def _to_iso_date(s: str) -> str:
    return datetime.strptime(s.strip(), '%d/%m/%Y').date().isoformat()


_ACCOUNT_NO_RE = re.compile(r'Account No\s*:\s*(\d+)')
_OPEN_DATE_RE = re.compile(r'A/C Open Date\s*:\s*(\d{2}/\d{2}/\d{4})')
_STATEMENT_PERIOD_RE = re.compile(r'Statement From\s*:\s*(\d{2}/\d{2}/\d{4})\s*To\s*:\s*(\d{2}/\d{2}/\d{4})')


def parse_ppf_statement(file_bytes: bytes) -> dict:
    """
    Parse an HDFC PPF account statement .xls. Returns a dict with:
      - account_no, open_date (iso), statement_from (iso), statement_to (iso)
      - holder_name
      - opening_balance, closing_balance (Decimal strings, as of statement_from/to)
      - transactions: [{tx_date, description, amount, closing_balance, kind}]
        kind is 'deposit' | 'interest' | 'other'
    """
    import xlrd

    try:
        wb = xlrd.open_workbook(file_contents=file_bytes)
    except Exception as e:
        raise PpfParseError(f'Could not read this file as an Excel (.xls) workbook: {e}')

    sheet = wb.sheet_by_index(0)
    rows = [
        [sheet.cell_value(r, c) for c in range(sheet.ncols)]
        for r in range(sheet.nrows)
    ]

    joined_col0 = '\n'.join(str(row[0]) for row in rows if row)
    joined_col4 = '\n'.join(str(row[4]) for row in rows if len(row) > 4)

    account_match = _ACCOUNT_NO_RE.search(joined_col4)
    if not account_match:
        raise PpfParseError('Could not find the Account No in this statement.')
    account_no = account_match.group(1)

    open_date_match = _OPEN_DATE_RE.search(joined_col4)
    open_date = _to_iso_date(open_date_match.group(1)) if open_date_match else ''

    period_match = _STATEMENT_PERIOD_RE.search(joined_col0)
    if not period_match:
        raise PpfParseError('Could not find the statement period (Statement From/To) in this file.')
    statement_from = _to_iso_date(period_match.group(1))
    statement_to = _to_iso_date(period_match.group(2))

    holder_name = str(rows[5][0]).strip() if len(rows) > 5 else ''

    # Locate the transaction table header row ("Date", "Narration", ...)
    header_idx = next(
        (i for i, row in enumerate(rows) if row and str(row[0]).strip() == 'Date' and len(row) > 6 and 'Narration' in str(row[1])),
        None,
    )
    if header_idx is None:
        raise PpfParseError('Could not find the transaction table in this statement.')

    transactions = []
    opening_balance = None
    closing_balance = None

    i = header_idx + 1
    # Skip the '********' separator row directly under the header, if present.
    if i < len(rows) and str(rows[i][0]).strip().startswith('*'):
        i += 1

    date_re = re.compile(r'^\d{2}/\d{2}/\d{4}$')
    while i < len(rows):
        row = rows[i]
        date_raw = str(row[0]).strip()
        if not date_re.match(date_raw):
            break

        description = str(row[1]).strip()
        withdrawal = row[4]
        deposit = row[5]
        closing = row[6]

        amount = None
        direction = None
        if isinstance(deposit, (int, float)) and deposit:
            amount = Decimal(str(deposit))
            direction = 'deposit'
        elif isinstance(withdrawal, (int, float)) and withdrawal:
            amount = Decimal(str(withdrawal))
            direction = 'withdrawal'

        if amount is not None:
            desc_lower = description.lower()
            if 'interest paid' in desc_lower:
                kind = 'interest'
            elif direction == 'deposit':
                kind = 'deposit'
            else:
                kind = 'other'

            transactions.append({
                'tx_date': _to_iso_date(date_raw),
                'description': description,
                'amount': str(amount),
                'kind': kind,
                'direction': direction,
            })

        if isinstance(closing, (int, float)):
            closing_balance = Decimal(str(closing))
        i += 1

    if not transactions:
        raise PpfParseError('Could not find any transaction rows in this statement.')

    # Statement summary block: "Opening Balance" row precedes the numeric row
    # containing (opening, blank, blank, blank, debits, credits, closing).
    summary_idx = next(
        (idx for idx, row in enumerate(rows) if row and str(row[0]).strip() == 'Opening Balance'),
        None,
    )
    if summary_idx is not None and summary_idx + 1 < len(rows):
        summary_row = rows[summary_idx + 1]
        if isinstance(summary_row[0], (int, float)):
            opening_balance = Decimal(str(summary_row[0]))

    if opening_balance is None:
        raise PpfParseError('Could not find the opening balance in this statement.')

    return {
        'account_no': account_no,
        'open_date': open_date,
        'statement_from': statement_from,
        'statement_to': statement_to,
        'holder_name': holder_name,
        'opening_balance': str(opening_balance),
        'closing_balance': str(closing_balance) if closing_balance is not None else '',
        'transactions': transactions,
    }
