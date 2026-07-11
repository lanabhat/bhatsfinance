"""
Parser for EPFO Member Passbook PDF exports.

The passbook is a text-extractable PDF (no password), one financial year per
file/page. Text extraction (via pdfplumber) yields plain lines — column
gridlines are lost, so rows are parsed positionally with regexes rather than
relying on a table structure. Hindi/English bilingual labels precede most
fields; only the trailing English/numeric portion is meaningful.
"""
from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation


class EpfParseError(Exception):
    pass


def _clean_amount(s: str) -> Decimal | None:
    s = s.strip().replace(',', '')
    if not s:
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _to_iso_date(s: str) -> str:
    return datetime.strptime(s.strip(), '%d-%m-%Y').date().isoformat()


_UAN_RE = re.compile(r'UAN\s+(\d+)')
_MEMBER_ID_RE = re.compile(r'Member ID/Name\s+(\S+)\s*/\s*(.+)')
_ESTABLISHMENT_RE = re.compile(r'Establishment ID/Name\s+(\S+)\s*/\s*(.+)')
_FY_RE = re.compile(r'Financial Year\s*-\s*(\d{4})-(\d{4})')
_OPENING_RE = re.compile(
    r'OB Int\. Updated upto (\d{2}/\d{2}/\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)'
)
_ROW_RE = re.compile(
    r'^([A-Za-z]{3}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s+(\S+)\s+(.+?)\s+'
    r'([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$'
)
_TOTAL_CONTRIB_RE = re.compile(
    r'Total Contributions for the year\s*\[\s*(\d{4})\s*\]\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)'
)
_TOTAL_WITHDRAWAL_RE = re.compile(
    r'Total Withdrawals\s*for the year\s*\[\s*(\d{4})\s*\]\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)'
)
_CLOSING_RE = re.compile(
    r'Closing Balance as on (\d{2}/\d{2}/\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)'
)


def parse_epf_passbook(text: str) -> dict:
    """
    Parse one financial year's EPF Member Passbook text. Returns a dict with:
      - uan, member_id, member_name, establishment_id, establishment_name
      - fy_start_year, fy_end_year (e.g. 2025, 2026)
      - opening_date (iso), opening_employee, opening_employer, opening_pension
      - closing_date (iso), closing_employee, closing_employer, closing_pension
      - total_contribution_employee/employer/pension (for this FY)
      - total_withdrawal_employee/employer/pension (for this FY)
      - transactions: [{tx_date, wage_month, description, wages, eps_wages,
                         employee, employer, pension}]
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    joined = '\n'.join(lines)

    uan_match = _UAN_RE.search(joined)
    if not uan_match:
        raise EpfParseError('This does not look like an EPFO Member Passbook (UAN not found).')
    uan = uan_match.group(1)

    member_match = _MEMBER_ID_RE.search(joined)
    member_id, member_name = (member_match.group(1), member_match.group(2).strip()) if member_match else ('', '')

    establishment_match = _ESTABLISHMENT_RE.search(joined)
    establishment_id, establishment_name = (
        (establishment_match.group(1), establishment_match.group(2).strip())
        if establishment_match else ('', '')
    )

    fy_match = _FY_RE.search(joined)
    if not fy_match:
        raise EpfParseError('Could not find the Financial Year in this passbook.')
    fy_start_year, fy_end_year = int(fy_match.group(1)), int(fy_match.group(2))

    opening_match = _OPENING_RE.search(joined)
    if not opening_match:
        raise EpfParseError('Could not find the opening balance line in this passbook.')
    opening_date = _to_iso_date(opening_match.group(1).replace('/', '-'))
    opening_employee = _clean_amount(opening_match.group(2))
    opening_employer = _clean_amount(opening_match.group(3))
    opening_pension = _clean_amount(opening_match.group(4))

    closing_match = _CLOSING_RE.search(joined)
    if not closing_match:
        raise EpfParseError('Could not find the closing balance line in this passbook.')
    closing_date = _to_iso_date(closing_match.group(1).replace('/', '-'))
    closing_employee = _clean_amount(closing_match.group(2))
    closing_employer = _clean_amount(closing_match.group(3))
    closing_pension = _clean_amount(closing_match.group(4))

    contrib_match = _TOTAL_CONTRIB_RE.search(joined)
    total_contribution_employee = _clean_amount(contrib_match.group(2)) if contrib_match else Decimal('0')
    total_contribution_employer = _clean_amount(contrib_match.group(3)) if contrib_match else Decimal('0')
    total_contribution_pension = _clean_amount(contrib_match.group(4)) if contrib_match else Decimal('0')

    withdrawal_match = _TOTAL_WITHDRAWAL_RE.search(joined)
    total_withdrawal_employee = _clean_amount(withdrawal_match.group(2)) if withdrawal_match else Decimal('0')
    total_withdrawal_employer = _clean_amount(withdrawal_match.group(3)) if withdrawal_match else Decimal('0')
    total_withdrawal_pension = _clean_amount(withdrawal_match.group(4)) if withdrawal_match else Decimal('0')

    transactions = []
    for line in lines:
        row_match = _ROW_RE.match(line)
        if not row_match:
            continue
        wage_month, date_raw, tx_type, description, wages, eps_wages, employee, employer, pension = row_match.groups()
        transactions.append({
            'tx_date': _to_iso_date(date_raw),
            'wage_month': wage_month,
            'tx_type': tx_type,
            'description': description.strip(),
            'wages': str(_clean_amount(wages)),
            'eps_wages': str(_clean_amount(eps_wages)),
            'employee': str(_clean_amount(employee)),
            'employer': str(_clean_amount(employer)),
            'pension': str(_clean_amount(pension)),
        })

    if not transactions:
        raise EpfParseError('Could not find any monthly contribution rows in this passbook.')

    return {
        'uan': uan,
        'member_id': member_id,
        'member_name': member_name,
        'establishment_id': establishment_id,
        'establishment_name': establishment_name,
        'fy_start_year': fy_start_year,
        'fy_end_year': fy_end_year,
        'opening_date': opening_date,
        'opening_employee': str(opening_employee),
        'opening_employer': str(opening_employer),
        'opening_pension': str(opening_pension),
        'closing_date': closing_date,
        'closing_employee': str(closing_employee),
        'closing_employer': str(closing_employer),
        'closing_pension': str(closing_pension),
        'total_contribution_employee': str(total_contribution_employee),
        'total_contribution_employer': str(total_contribution_employer),
        'total_contribution_pension': str(total_contribution_pension),
        'total_withdrawal_employee': str(total_withdrawal_employee),
        'total_withdrawal_employer': str(total_withdrawal_employer),
        'total_withdrawal_pension': str(total_withdrawal_pension),
        'transactions': transactions,
    }
