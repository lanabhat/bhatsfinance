"""
Bank-specific text parsers for FD advice letters and RD statements of account.

Both document types are free-text (not tabular), unlike the CSV/Excel/table-PDF
imports handled by file_parser.py. parse_deposit_text() detects the issuing bank
and document shape, dispatches to a bank-specific parser, and falls back to a
generic best-effort parser for unrecognized layouts.
"""
from __future__ import annotations

import re
from datetime import datetime


class FDParseError(Exception):
    pass


_BANK_PARSERS: list[tuple[str, "callable"]] = []


def register_bank_parser(bank_marker: str, parser_fn) -> None:
    _BANK_PARSERS.append((bank_marker.upper(), parser_fn))


def _base_result(**overrides) -> dict:
    result = {
        'doc_type': '',
        'bank_name': '',
        'account_number': '',
        'member_name_raw': '',
        'annual_rate': '',
        'investment_date': '',
        'parser_used': 'generic',
        'warnings': [],
        # FD-only
        'principal': '',
        'maturity_date': '',
        'maturity_value': '',
        'compounding': 'quarterly',
        'tenure_days': None,
        # RD-only
        'installment_amount': '',
        'current_balance': '',
        'installment_count_observed': 0,
        'statement_date': '',
    }
    result.update(overrides)
    return result


def _to_iso_date(s: str, fmt: str = '%d-%m-%Y') -> str:
    return datetime.strptime(s.strip(), fmt).date().isoformat()


def _clean_amount(s: str) -> str:
    return s.replace(',', '').strip()


def parse_deposit_text(text: str) -> dict:
    head = '\n'.join(text.splitlines()[:5]).upper()

    for marker, parser_fn in _BANK_PARSERS:
        if marker in head:
            return parser_fn(text)

    return _parse_generic(text)


def _detect_doc_type(text: str) -> str:
    upper = text.upper()
    if 'STATEMENT OF ACCOUNT' in upper or 'POST DATE' in upper and 'VALUE DATE' in upper:
        return 'rd_statement'
    if 'E-TDR' in upper or 'E-STDR' in upper or 'TERM DEPOSIT' in upper:
        return 'fd_advice'
    return ''


# ---------------------------------------------------------------------------
# SBI e-TDR / e-STDR advice letter
# ---------------------------------------------------------------------------

_SBI_DATA_ROW_RE = re.compile(
    r'(\d{10,})\s+(\d+)\s*Days?\s+([\d.]+)\s+([\d,]+\.\d{2})\s+'
    r'(\d{2}-\d{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s+([\d,]+\.\d{2})'
)


def _parse_sbi_estdr(text: str) -> dict:
    warnings: list[str] = []

    name_match = re.search(r'Name\s*:\s*(.+)', text)
    member_name_raw = name_match.group(1).strip() if name_match else ''
    if not member_name_raw:
        warnings.append('Could not find account holder name.')

    row_match = _SBI_DATA_ROW_RE.search(text)
    if row_match:
        account_number, tenure_days, rate, principal, invest_date, maturity_date, maturity_value = row_match.groups()
    else:
        warnings.append('Could not find the FD data row in the expected single-line format; falling back to label scan.')
        account_number = _label_scan(text, r'Account No\.?')
        tenure_days_raw = _label_scan(text, r'Tenure')
        tenure_days = re.sub(r'\D', '', tenure_days_raw) if tenure_days_raw else ''
        rate = _label_scan(text, r'Rate')
        principal = _label_scan(text, r'Principal Amt')
        invest_date = _label_scan(text, r'Value/Renewal\s*Date|Value.{0,3}Renewal Date')
        maturity_date = _label_scan(text, r'Maturity\s*Date')
        maturity_value = _label_scan(text, r'Maturity\s*Value')

    def opt_date(raw: str) -> str:
        if not raw:
            return ''
        try:
            return _to_iso_date(raw)
        except ValueError:
            warnings.append(f'Could not parse date {raw!r}.')
            return ''

    warnings.append('Compounding not stated by bank; defaulted to quarterly — verify.')

    return _base_result(
        doc_type='fd_advice',
        bank_name='State Bank of India',
        account_number=account_number or '',
        member_name_raw=member_name_raw,
        tenure_days=int(tenure_days) if tenure_days else None,
        annual_rate=_clean_amount(rate) if rate else '',
        principal=_clean_amount(principal) if principal else '',
        investment_date=opt_date(invest_date) if invest_date else '',
        maturity_date=opt_date(maturity_date) if maturity_date else '',
        maturity_value=_clean_amount(maturity_value) if maturity_value else '',
        compounding='quarterly',
        parser_used='sbi_estdr',
        warnings=warnings,
    )


def _label_scan(text: str, label_pattern: str) -> str:
    match = re.search(r'(?:' + label_pattern + r')\s*[:\s]+\s*([^\n]+)', text, re.IGNORECASE)
    return match.group(1).strip() if match else ''


register_bank_parser('STATE BANK OF INDIA', lambda text: (
    _parse_sbi_estdr(text) if _detect_doc_type(text) == 'fd_advice' else _parse_sbi_rd_statement(text)
))


# ---------------------------------------------------------------------------
# SBI RD "Statement of Account"
# ---------------------------------------------------------------------------

_SBI_INSTALLMENT_RE = re.compile(r'DEP\s+TFR\s+INST\s+NO', re.IGNORECASE)
_SBI_INSTALLMENT_AMOUNT_RE = re.compile(
    r'DEP\s+TFR\s+INST\s+NO.*?-\s*-\s*([\d,]+\.\d{2})',
    re.IGNORECASE | re.DOTALL,
)


def _parse_sbi_rd_statement(text: str) -> dict:
    warnings: list[str] = []

    def label(pattern: str) -> str:
        return _label_scan(text, pattern)

    member_name_raw = label(r'Full Name')
    if not member_name_raw:
        warnings.append('Could not find account holder name.')

    account_number = label(r'Account no')

    rate_raw = label(r'Interest Rate')
    rate_match = re.search(r'([\d.]+)', rate_raw) if rate_raw else None
    annual_rate = rate_match.group(1) if rate_match else ''
    if not annual_rate:
        warnings.append('Could not find interest rate.')

    open_date_raw = label(r'Account open Date')
    investment_date = ''
    if open_date_raw:
        try:
            investment_date = _to_iso_date(open_date_raw)
        except ValueError:
            warnings.append(f'Could not parse account open date {open_date_raw!r}.')

    statement_date_raw = label(r'Date of statement')
    statement_date = ''
    if statement_date_raw:
        try:
            statement_date = _to_iso_date(statement_date_raw)
        except ValueError:
            pass

    balance_raw = label(r'Cleared Balance')
    current_balance = ''
    if balance_raw:
        current_balance = _clean_amount(re.sub(r'CR$', '', balance_raw.strip(), flags=re.IGNORECASE))

    installment_count = len(_SBI_INSTALLMENT_RE.findall(text))
    if installment_count == 0:
        warnings.append('Could not find any installment transactions in the statement.')

    installment_amount = ''
    amount_match = _SBI_INSTALLMENT_AMOUNT_RE.search(text)
    if amount_match:
        installment_amount = _clean_amount(amount_match.group(1))
    else:
        warnings.append('Could not determine installment amount from transaction lines.')

    if not investment_date or not annual_rate:
        raise FDParseError('Could not extract enough fields from this RD statement to proceed.')

    return _base_result(
        doc_type='rd_statement',
        bank_name='State Bank of India',
        account_number=account_number,
        member_name_raw=member_name_raw,
        annual_rate=annual_rate,
        investment_date=investment_date,
        parser_used='sbi_rd_statement',
        warnings=warnings,
        installment_amount=installment_amount,
        current_balance=current_balance,
        installment_count_observed=installment_count,
        statement_date=statement_date,
    )


# ---------------------------------------------------------------------------
# Generic fallback for unrecognized banks
# ---------------------------------------------------------------------------

def _parse_generic(text: str) -> dict:
    warnings: list[str] = ['Bank not recognized — fields extracted on a best-effort basis, please review carefully.']

    doc_type = _detect_doc_type(text) or 'fd_advice'

    first_line = text.splitlines()[0].strip() if text.strip() else ''
    bank_name = first_line or 'Bank'

    member_name_raw = _label_scan(text, r'Name|Full Name|Account Holder')
    account_number = _label_scan(text, r'Account No\.?|Account no|Deposit No\.?')
    rate_raw = _label_scan(text, r'Rate of Interest|Interest Rate|Rate')
    rate_match = re.search(r'([\d.]+)', rate_raw) if rate_raw else None
    annual_rate = rate_match.group(1) if rate_match else ''

    investment_date_raw = _label_scan(text, r'Deposit Date|Value Date|Date of Deposit|Account open Date')
    investment_date = ''
    if investment_date_raw:
        try:
            investment_date = _to_iso_date(investment_date_raw)
        except ValueError:
            pass

    if not member_name_raw or not annual_rate or not investment_date:
        if doc_type == 'fd_advice':
            principal_raw = _label_scan(text, r'Principal Amt|Principal Amount|Amount Deposited')
            if not principal_raw and not annual_rate and not investment_date:
                raise FDParseError('This does not look like a recognizable FD/RD document.')

    result = _base_result(doc_type=doc_type, bank_name=bank_name, account_number=account_number,
                           member_name_raw=member_name_raw, annual_rate=annual_rate,
                           investment_date=investment_date, parser_used='generic', warnings=warnings)

    if doc_type == 'fd_advice':
        principal_raw = _label_scan(text, r'Principal Amt|Principal Amount|Amount Deposited')
        maturity_date_raw = _label_scan(text, r'Maturity Date|Due Date')
        maturity_value_raw = _label_scan(text, r'Maturity Value|Maturity Amount')
        maturity_date = ''
        if maturity_date_raw:
            try:
                maturity_date = _to_iso_date(maturity_date_raw)
            except ValueError:
                warnings.append(f'Could not parse maturity date {maturity_date_raw!r}.')
        if not principal_raw:
            warnings.append('Could not find principal amount.')
        if not maturity_date:
            warnings.append('Could not find maturity date.')
        result.update(
            principal=_clean_amount(principal_raw) if principal_raw else '',
            maturity_date=maturity_date,
            maturity_value=_clean_amount(maturity_value_raw) if maturity_value_raw else '',
        )
    else:
        balance_raw = _label_scan(text, r'Cleared Balance|Closing Balance|Current Balance')
        installment_count = len(_SBI_INSTALLMENT_RE.findall(text))
        result.update(
            current_balance=_clean_amount(re.sub(r'CR$', '', balance_raw.strip(), flags=re.IGNORECASE)) if balance_raw else '',
            installment_count_observed=installment_count,
        )
        if not result['current_balance']:
            warnings.append('Could not find current balance.')

    return result
