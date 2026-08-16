"""
Parser for SBI YONO's "Account Summary" Excel export — a password-protected
.xlsx with fixed sheets: Transaction_Account_Summary (savings accounts +
current balance, NOT a transaction ledger), Loans_Summary, and
Deposits_Summary (FDs and RDs). Header rows are preceded by a few banner
rows (title, "As on:", customer name, address) that vary in row count, so
sheets are scanned for the row that matches the expected header rather than
assuming a fixed offset.

Deposits_Summary has no investment/value date column — only Maturity Date
and Tenor — so investment_date is derived as maturity_date minus the parsed
tenor, mirroring the FD advice importer's shape (see fd_parser.py).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta


class SBIStatementParseError(Exception):
    pass


def _clean_amount(s) -> str:
    if s is None:
        return ''
    return str(s).replace(',', '').strip()


def _to_iso_date(s) -> str:
    if isinstance(s, datetime):
        return s.date().isoformat()
    if isinstance(s, date):
        return s.isoformat()
    return datetime.strptime(str(s).strip(), '%d-%m-%Y').date().isoformat()


def _find_header_row(ws, expected_first_col: str) -> int | None:
    for row in ws.iter_rows():
        first = row[0].value
        if first is not None and str(first).strip() == expected_first_col:
            return row[0].row
    return None


def _rows_after_header(ws, header_row: int, ncols: int):
    for row in ws.iter_rows(min_row=header_row + 1, max_col=ncols, values_only=True):
        if row[0] is None or str(row[0]).strip() == '':
            continue
        yield row


_TENOR_DAYS_RE = re.compile(r'(\d+)\s*day', re.IGNORECASE)
_TENOR_MONTHS_RE = re.compile(r'(\d+)\s*month', re.IGNORECASE)
_TENOR_YEARS_RE = re.compile(r'(\d+)\s*year', re.IGNORECASE)


def _parse_tenor_to_investment_date(maturity_date: date, tenor: str) -> tuple[str, int | None]:
    """Returns (investment_date_iso, tenure_days_or_none)."""
    tenor = (tenor or '').strip()

    days_match = _TENOR_DAYS_RE.search(tenor)
    if days_match:
        days = int(days_match.group(1))
        return (maturity_date - timedelta(days=days)).isoformat(), days

    months_match = _TENOR_MONTHS_RE.search(tenor)
    if months_match:
        months = int(months_match.group(1))
        month_index = maturity_date.month - 1 - months
        year = maturity_date.year + month_index // 12
        month = month_index % 12 + 1
        try:
            investment_date = maturity_date.replace(year=year, month=month)
        except ValueError:
            investment_date = maturity_date.replace(year=year, month=month, day=1)
        return investment_date.isoformat(), None

    years_match = _TENOR_YEARS_RE.search(tenor)
    if years_match:
        years = int(years_match.group(1))
        try:
            investment_date = maturity_date.replace(year=maturity_date.year - years)
        except ValueError:
            investment_date = maturity_date.replace(year=maturity_date.year - years, day=28)
        return investment_date.isoformat(), None

    return '', None


def parse_savings_accounts_sheet(ws) -> list[dict]:
    """
    Parses Transaction_Account_Summary into a list of savings-account rows:
    account_number, account_type, branch, roi, currency, mode_of_operation,
    available_balance. This sheet is a balance snapshot, not a transaction
    ledger — SBI's YONO export does not include individual transactions.
    """
    header_row = _find_header_row(ws, 'Account Number')
    if header_row is None:
        return []

    accounts = []
    for row in _rows_after_header(ws, header_row, 7):
        account_number, account_type, branch, roi, currency, mode_of_operation, balance = row
        accounts.append({
            'account_number': str(account_number).strip(),
            'account_type': (account_type or '').strip(),
            'branch': (branch or '').strip(),
            'roi': _clean_amount(roi),
            'currency': (currency or '').strip() or 'INR',
            'mode_of_operation': (mode_of_operation or '').strip(),
            'available_balance': _clean_amount(balance),
        })
    return accounts


def parse_deposits_sheet(ws) -> list[dict]:
    """
    Parses Deposits_Summary into fd_advice/rd_statement-shaped dicts,
    matching the field names apply_fd_advice_import / apply_rd_statement_import
    expect. 'Recurring Deposits' rows become doc_type='rd_statement'; anything
    else (Multi Option Deposit, Term Deposit, ...) becomes doc_type='fd_advice'.
    """
    header_row = _find_header_row(ws, 'Account Number')
    if header_row is None:
        return []

    items = []
    for row in _rows_after_header(ws, header_row, 10):
        (account_number, deposit_type, branch, mode_of_operation, maturity_date_raw,
         tenor, roi, currency, principal_raw, maturity_value_raw) = row

        warnings: list[str] = []
        try:
            maturity_date = datetime.strptime(str(maturity_date_raw).strip(), '%d-%m-%Y').date()
            maturity_date_iso = maturity_date.isoformat()
        except (ValueError, TypeError):
            warnings.append(f'Could not parse maturity date {maturity_date_raw!r}.')
            maturity_date = None
            maturity_date_iso = ''

        investment_date_iso = ''
        tenure_days = None
        if maturity_date is not None:
            investment_date_iso, tenure_days = _parse_tenor_to_investment_date(maturity_date, tenor)
            if not investment_date_iso:
                warnings.append(f'Could not parse tenor {tenor!r} to derive investment date.')

        is_rd = (deposit_type or '').strip().lower() == 'recurring deposits'

        item = {
            'account_number': str(account_number).strip(),
            'deposit_type': (deposit_type or '').strip(),
            'branch': (branch or '').strip(),
            'mode_of_operation': (mode_of_operation or '').strip(),
            'bank_name': 'State Bank of India',
            'annual_rate': _clean_amount(roi),
            'currency': (currency or '').strip() or 'INR',
            'investment_date': investment_date_iso,
            'maturity_date': maturity_date_iso,
            'tenor_raw': (tenor or '').strip(),
            'tenure_days': tenure_days,
            'compounding': 'quarterly',
            'warnings': warnings,
        }

        if is_rd:
            item.update(
                doc_type='rd_statement',
                installment_amount='',
                current_balance=_clean_amount(principal_raw),
                installment_count_observed=0,
                statement_date='',
            )
        else:
            item.update(
                doc_type='fd_advice',
                principal=_clean_amount(principal_raw),
                maturity_value=_clean_amount(maturity_value_raw),
            )

        items.append(item)

    return items
