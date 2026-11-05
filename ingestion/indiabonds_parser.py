"""
Parse an IndiaBonds deal sheet PDF — one bond trade per file.

Download: IndiaBonds → Profile icon → My orders → select the bond → Deal Sheet → Download.

The text (via pdfplumber) is a label/value list ("ISIN IN3920260020", "COUPON RATE
7.7500%", "QUANTUM (INR) 100,000.00 [NO. OF BONDS :- 1000] PRICE - 102.2007", …), with a
few values wrapped onto the next line (stamp duty, brokerage, settlement amount), so
values are found by label, not by position. Everything comes back JSON-friendly:
amounts as decimal strings, dates as ISO strings.
"""
import calendar
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

_AMOUNT = r'(-?[\d,]+\.\d+|-?[\d,]+)'
_DATE = r'(\d{1,2}-[A-Z]{3}-\d{4})'
_MONTHS = {m.upper(): i for i, m in enumerate(calendar.month_abbr) if m}


class IndiaBondsParseError(Exception):
    pass


def extract_deal_sheet_text(file_bytes: bytes, password: str | None = None) -> str:
    """Text of every page. Raises ingestion.pdf_decrypt.IncorrectPasswordError for a
    protected file without the right password."""
    import io

    import pdfplumber

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as doc:
            return '\n'.join(page.extract_text() or '' for page in doc.pages)
    except Exception:
        # Encrypted (or odd) files: decrypt with pikepdf first, as the EPF/FD imports do.
        from ingestion.pdf_decrypt import decrypt_and_extract_text
        return decrypt_and_extract_text(file_bytes, password)


def parse_indiabonds_deal_sheet(file_bytes: bytes, password: str | None = None) -> dict:
    return parse_deal_sheet_text(extract_deal_sheet_text(file_bytes, password))


def _amount(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return str(Decimal(value.replace(',', '')))
    except InvalidOperation:
        return None


def _date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return datetime.strptime(value.title(), '%d-%b-%Y').date().isoformat()
    except ValueError:
        return None


def _line(text: str, label: str) -> str | None:
    """Rest of the line after `label` at the start of a line."""
    m = re.search(rf'^{label}\s+(.+)$', text, re.MULTILINE)
    return m.group(1).strip() if m else None


def _first_amount_after(text: str, label: str) -> str | None:
    """First amount following `label`, even when it wraps onto the next line."""
    m = re.search(rf'{label}.*?{_AMOUNT}', text, re.DOTALL)
    return _amount(m.group(1)) if m else None


def coupon_frequency_from(schedule: str) -> str | None:
    s = schedule.upper()
    if 'QUARTER' in s:
        return 'quarterly'
    if 'TWICE' in s or 'HALF' in s or 'SEMI' in s:
        return 'half_yearly'
    if 'MONTH' in s:
        return 'monthly'
    if 'ONCE' in s or 'ANNUAL' in s or 'YEARLY' in s:
        return 'annual'
    if 'CUMULATIVE' in s or 'MATURITY' in s or 'REDEMPTION' in s:
        return 'cumulative'
    return None


def next_coupon_date(schedule: str, after: date) -> date | None:
    """First interest payment day-month ("21-OCT, 21-JAN, …") strictly after `after`."""
    candidates = []
    for day, mon in re.findall(r'(\d{1,2})-([A-Z]{3})\b', schedule.upper()):
        if mon not in _MONTHS:
            continue
        for year in (after.year, after.year + 1):
            month = _MONTHS[mon]
            d = date(year, month, min(int(day), calendar.monthrange(year, month)[1]))
            if d > after:
                candidates.append(d)
    return min(candidates) if candidates else None


def issuer_from(security_name: str, government: bool) -> str:
    """"KERALA … FUND BOARD SR VII STRPP …" → "KERALA … FUND BOARD";
    "7.75% DELHI SGS 24 JUN 2041" → "DELHI GOVERNMENT"; a G-sec → "GOVERNMENT OF INDIA"."""
    name = re.sub(r'^\s*[\d.]+\s*%\s*', '', security_name.upper()).strip()
    if government:
        state = re.match(r'^(.+?)\s+(?:SGS|SDL)\b', name)
        return f'{state.group(1).strip()} GOVERNMENT' if state else 'GOVERNMENT OF INDIA'
    cut = re.split(r'\s+(?:SR|SERIES|STRPP|NCD|BD|BONDS?|TRANCHE|OPTION)\b|\s+[\d.]+\s*%', name, maxsplit=1)
    return cut[0].strip() or security_name.strip()


def bond_type_from(isin: str, security_name: str) -> str:
    from instruments.services import is_bond_isin

    name = security_name.upper()
    if len(isin) > 2 and isin[2].isdigit() and is_bond_isin(isin):
        return 'sgb' if 'SGB' in name or 'GOLD' in name else 'government'
    if 'SGB' in name:
        return 'sgb'
    if 'TAX FREE' in name or 'TAXFREE' in name:
        return 'tax_free'
    if 'NCD' in name:
        return 'ncd'
    return 'corporate'


def parse_deal_sheet_text(text: str) -> dict:
    if 'DEAL SHEET' not in text.upper() or 'INDIABONDS ORDER ID' not in text.upper():
        raise IndiaBondsParseError('This doesn’t look like an IndiaBonds deal sheet.')

    order_id = _line(text, 'INDIABONDS ORDER ID')
    isin = (_line(text, 'ISIN') or '').split()[0] if _line(text, 'ISIN') else None
    quantum = re.search(rf'QUANTUM \(INR\)\s*{_AMOUNT}\s*\[NO\. OF BONDS\s*:-\s*([\d,]+)\]\s*PRICE\s*-\s*{_AMOUNT}', text)
    dates = re.search(rf'DEAL DATE\s*-\s*{_DATE}\s*VALUE DATE\s*-\s*{_DATE}', text)
    settlement = _first_amount_after(text, r'SETTLEMENT AMOUNT \(INR\)')

    missing = [label for label, value in (
        ('order ID', order_id), ('ISIN', isin), ('number of bonds', quantum),
        ('value date', dates), ('settlement amount', settlement),
    ) if not value]
    if missing:
        raise IndiaBondsParseError(f'Couldn’t find {", ".join(missing)} on the deal sheet.')

    side = 'sell' if '-SELL-' in order_id.upper() else 'buy'
    value_date = _date(dates.group(2))
    security_name = _line(text, 'SECURITY NAME') or isin
    government = bool(isin[2:3].isdigit())

    schedule = _line(text, 'INTEREST PAYMENT DATE') or ''
    frequency = coupon_frequency_from(schedule)
    first_coupon = None
    if frequency and frequency != 'cumulative' and value_date:
        nxt = next_coupon_date(schedule, date.fromisoformat(value_date))
        first_coupon = nxt.isoformat() if nxt else None

    # "24-JUN-2041: 100.0000%" or several "21-APR-2031: 25.0000%, …" parts, possibly wrapped.
    redemption_block = re.search(r'REDEMPTION DATE\s+(.+?)(?:\n(?:LAST INTEREST|FACE VALUE)|$)', text, re.DOTALL)
    redemption = [
        {'date': _date(d), 'percent': str(Decimal(p))}
        for d, p in re.findall(rf'{_DATE}\s*:\s*([\d.]+)\s*%', redemption_block.group(1) if redemption_block else '')
    ]
    maturity = max((r['date'] for r in redemption if r['date']), default=None)

    notes = []
    if len(redemption) > 1:
        notes.append('Redeems ' + ', '.join(
            f"{Decimal(r['percent']).normalize():f}% on {date.fromisoformat(r['date']).strftime('%d-%b-%Y')}" for r in redemption
        ) + '.')
    option = _line(text, r'PUT / CALL OPTION')
    if option and option.upper() not in ('N.A.', 'NA', 'N.A', 'NIL', '-'):
        notes.append(f'Put/call option: {option}.')

    buyer = re.search(r'Buyer Name:\s*(.+?)\s+\S+\s+Code:', text)
    seller = re.search(r'Seller Name:\s*(.+?)\s+\S+\s+Code:', text)
    accrued = re.search(rf'ACCRUED/EX INTEREST \(INR\)\s*{_AMOUNT}\s*(?:\[NO\. OF DAYS\s*:-\s*(\d+)\])?', text)
    coupon = re.search(r'COUPON RATE\s+([\d.]+)\s*%', text)
    quantity = int(quantum.group(2).replace(',', ''))
    principal = _amount(_line(text, r'PRINCIPAL AMOUNT \(INR\)').split()[0]) if _line(text, r'PRINCIPAL AMOUNT \(INR\)') else None

    return {
        'side': side,
        'order_id': order_id.split()[0],
        'deal_id': (_line(text, 'INDIABONDS DEAL ID') or '').split()[0] if _line(text, 'INDIABONDS DEAL ID') else '',
        'buyer_name': buyer.group(1).strip() if buyer else '',
        'seller_name': seller.group(1).strip() if seller else '',
        'isin': isin,
        'security_name': security_name,
        'issuer_name': issuer_from(security_name, government),
        'security_nature': _line(text, 'SECURITY NATURE') or '',
        'bond_type': bond_type_from(isin, security_name),
        'coupon_rate': str(Decimal(coupon.group(1))) if coupon else None,
        'coupon_type': _line(text, 'COUPON TYPE') or '',
        'interest_schedule': schedule,
        'coupon_frequency': frequency,
        'first_coupon_date': first_coupon,
        'allotment_date': _date(_line(text, 'ALLOTMENT DATE')),
        'redemption_schedule': redemption,
        'maturity_date': maturity,
        'face_value': _amount((_line(text, r'FACE VALUE \(INR\)') or '').split()[0]) if _line(text, r'FACE VALUE \(INR\)') else None,
        'quantity': quantity,
        'quantum': _amount(quantum.group(1)),
        'price': _amount(quantum.group(3)),
        'deal_date': _date(dates.group(1)),
        'value_date': value_date,
        'principal': principal,
        'accrued_interest': _amount(accrued.group(1)) if accrued else '0',
        'accrued_days': int(accrued.group(2)) if accrued and accrued.group(2) else None,
        'total_consideration': _first_amount_after(text, r'TOTAL CONSIDERATION \(INR\)'),
        'stamp_duty': _first_amount_after(text, r'STAMP DUTY \(INR\)') or '0',
        'brokerage': _first_amount_after(text, r'BROKERAGE / CONVENIENCE') or '0',
        'settlement_amount': settlement,
        'notes': ' '.join(notes),
    }
