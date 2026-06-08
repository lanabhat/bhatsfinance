"""
Rule templates for SMS bank/transaction alert parsing.
Mirrors gmail_ingestion.templates but tuned for the terser, less structured
text of Indian bank/UPI/card SMS alerts.
"""
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

# ---------------------------------------------------------------------------
# Template registry — wave 1 covers ledger/expense detection only
# (account-balance, investment, FD, tax templates can be added later without
# changing the detection/approval plumbing).
# ---------------------------------------------------------------------------

SMS_TEMPLATES: dict[str, dict] = {
    'sms_card_spend': {
        'label': 'Card Spend',
        'description': 'Debit/credit card spend alerts',
        'amount_re': r'(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)\s*(?:has been |was )?spent',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['spent on your card', 'spent using your card', 'card ending', 'spent at', 'spent on card'],
    },
    'sms_account_debit': {
        'label': 'Account Debit / UPI Payment',
        'description': 'Bank account debit, UPI, NEFT/IMPS/RTGS outflow alerts',
        'amount_re': r'(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s*(?:is |has been )?(?:debited|deducted|sent|paid)|(?:debited|deducted|paid)\s*(?:by|with)?\s*(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['debited from', 'debited to', 'a/c debited', 'upi', 'has been debited', 'is debited', 'amount sent', 'paid to', 'payment of'],
        'negative_signals': ['credited', 'has been credited', 'refund', 'emi of', 'your emi', 'loan instalment', 'loan installment'],
    },
    'sms_account_credit': {
        'label': 'Account Credit / Income',
        'description': 'Salary, refund, UPI/NEFT/IMPS inflow alerts',
        'amount_re': r'(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s*(?:is |has been )?credited|credited\s*(?:with|by)?\s*(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)|received\s*(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'inflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'income',
        'default_spend_category': '',
        'confidence_signals': ['credited to', 'has been credited', 'is credited', 'amount received', 'salary credited', 'refund of', 'received in your account'],
        'negative_signals': ['debited', 'has been debited', 'will be debited'],
    },
    'sms_emi_debit': {
        'label': 'EMI / Loan Payment',
        'description': 'EMI auto-debit and loan instalment alerts',
        'amount_re': r'(?:EMI|instal?ment)\s*(?:of|amount)?\s*(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)|(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s*(?:towards|for)?\s*(?:your)?\s*(?:EMI|loan)',
        'direction': 'outflow',
        'tx_type': 'emi',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'loans_emi',
        'confidence_signals': ['emi of', 'your emi', 'emi amount', 'loan instalment', 'loan installment', 'personal loan', 'towards your loan'],
    },
    'sms_cc_bill_payment': {
        'label': 'Credit Card Bill Payment',
        'description': 'Credit card bill payment confirmation alerts',
        'amount_re': r'(?:payment of|paid)\s*(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s*(?:towards|for|on)?\s*(?:your)?\s*credit card|(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s*(?:received|credited)\s*(?:towards|against)\s*(?:your)?\s*credit card',
        'direction': 'outflow',
        'tx_type': 'cc_bill_payment',
        'target': 'account',
        'classification': 'internal_transfer',
        'default_spend_category': '',
        'confidence_signals': ['credit card payment', 'towards your credit card', 'card bill payment', 'bill payment of'],
    },
}


# ---------------------------------------------------------------------------
# Amount / template detection
# ---------------------------------------------------------------------------

def _to_decimal(s: str | None) -> Decimal | None:
    if not s:
        return None
    cleaned = s.replace(',', '').strip()
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _first_group(m: re.Match) -> str | None:
    if not m.lastindex:
        return None
    if m.lastindex == 1:
        return m.group(1)
    return next((g for g in m.groups() if g), None)


def detect_template(body: str, sender: str = '', custom_templates: dict | None = None) -> tuple[str | None, float, Decimal | None, str | None]:
    """
    Score every template against the message text; return the best match as
    (template_key, confidence, parsed_amount, direction), or all-None if
    nothing scores above zero.
    """
    text = f'{sender}\n{body}'.lower()

    best_key: str | None = None
    best_conf = 0.0
    best_amount: Decimal | None = None
    best_direction: str | None = None

    for key, tmpl in get_effective_templates(custom_templates).items():
        signals = tmpl.get('confidence_signals') or []
        hits = sum(1 for sig in signals if sig.lower() in text)
        if hits == 0:
            continue
        negative = tmpl.get('negative_signals') or []
        if any(neg.lower() in text for neg in negative):
            continue
        conf = hits / len(signals) if signals else 0.0

        amount: Decimal | None = None
        amount_re = tmpl.get('amount_re', '')
        if amount_re:
            try:
                m = re.search(amount_re, body, re.IGNORECASE)
                if m:
                    amount = _to_decimal(_first_group(m))
            except re.error:
                pass

        if conf > best_conf:
            best_key = key
            best_conf = conf
            best_amount = amount
            best_direction = tmpl.get('direction')

    return best_key, round(best_conf, 3), best_amount, best_direction


def apply_template_regex(template_key: str, text: str, custom_templates: dict | None = None) -> Decimal | None:
    tmpl = get_effective_templates(custom_templates).get(template_key)
    if not tmpl:
        return None
    amount_re = tmpl.get('amount_re', '')
    if not amount_re:
        return None
    try:
        m = re.search(amount_re, text, re.IGNORECASE)
        if not m:
            return None
        return _to_decimal(_first_group(m))
    except re.error:
        return None


def get_effective_templates(custom: dict | None = None) -> dict:
    merged = dict(SMS_TEMPLATES)
    for key, tmpl in (custom or {}).items():
        merged[key] = tmpl
    return merged


def templates_for_api() -> list[dict]:
    return [
        {
            'key': k,
            'label': v['label'],
            'description': v['description'],
            'direction': v['direction'],
            'tx_type': v['tx_type'],
            'target': v['target'],
            'classification': v.get('classification', ''),
            'default_spend_category': v.get('default_spend_category', ''),
        }
        for k, v in SMS_TEMPLATES.items()
    ]


# ---------------------------------------------------------------------------
# Date / merchant extraction
# ---------------------------------------------------------------------------

_DATE_PATTERNS = [
    (r'\b([0-3]?[0-9])[-/]([01]?[0-9])[-/]([0-9]{2}|[0-9]{4})\b', '%d-%m-%Y'),
    (r'\bon\s+([0-3]?[0-9])(?:st|nd|rd|th)?[-\s]([A-Za-z]{3,9})[-\s]?(\d{2,4})?\b', '%d-%b-%Y'),
]

_MONTH_ABBR = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}


def _normalise_year(y: str | None, fallback_year: int) -> int:
    if not y:
        return fallback_year
    y = y.strip()
    if len(y) == 2:
        return 2000 + int(y)
    return int(y)


def extract_date(body: str, fallback: date) -> date:
    """
    Best-effort extraction of a transaction date from an SMS body.
    Falls back to the SMS's received date when no recognisable date is found
    or the parsed value is implausible (e.g. far future/past).
    """
    # DD-MM-YY(YY) or DD/MM/YY(YY)
    m = re.search(_DATE_PATTERNS[0][0], body)
    if m:
        day, month, year = m.groups()
        try:
            d = date(_normalise_year(year, fallback.year), int(month), int(day))
            if abs((d - fallback).days) <= 60:
                return d
        except ValueError:
            pass

    # "on 5th Jun" / "on 05 June 2026"
    m = re.search(_DATE_PATTERNS[1][0], body, re.IGNORECASE)
    if m:
        day, month_name, year = m.groups()
        month = _MONTH_ABBR.get(month_name[:3].lower())
        if month:
            try:
                d = date(_normalise_year(year, fallback.year), month, int(day))
                if abs((d - fallback).days) <= 60:
                    return d
            except ValueError:
                pass

    return fallback


_MERCHANT_PATTERNS = [
    r'(?:spent at|at)\s+([A-Z][A-Za-z0-9 &.\'_-]{2,40}?)(?:\s+on|\s+via|\.|,|\n|$)',
    r'(?:to|towards)\s+([A-Z][A-Za-z0-9 &.\'_-]{2,40}?)(?:\s+on|\s+via|\.|,|\n|$)',
    r'(?:UPI[/-])?(?:VPA|vpa)[:\s]+([a-zA-Z0-9.\-_@]{3,60})',
    r'[Ii]nfo[:\-]\s*([A-Z][A-Z0-9 /&]{2,40})',
]

_COMPILED_MERCHANT = [re.compile(p) for p in _MERCHANT_PATTERNS]


def extract_merchant(body: str) -> str:
    for pattern in _COMPILED_MERCHANT:
        m = pattern.search(body)
        if m:
            return m.group(1).strip(' .,')
    return ''


_REF_PATTERNS = [
    r'(?:UPI\s*[Rr]ef(?:erence)?(?:\s*[Nn]o\.?)?|UPI\s*[Tt]xn(?:\s*[Ii]d)?)[:\s]+([A-Za-z0-9]{6,25})',
    r'(?:[Rr]ef(?:erence)?(?:\s*[Nn]o\.?)?|RRN)[:\s]+([A-Za-z0-9]{6,25})',
]

_COMPILED_REF = [re.compile(p) for p in _REF_PATTERNS]


def extract_reference(body: str) -> str:
    for pattern in _COMPILED_REF:
        m = pattern.search(body)
        if m:
            return m.group(1).strip()
    return ''


def build_parsed_tx(body: str, sender: str, received_at: datetime) -> dict:
    """
    Run detection + field extraction over an SMS body and return a
    `parsed_tx` suggestion dict ready to stash in `raw_payload`, mirroring
    the shape gmail_ingestion stores for staged transactions.
    """
    key, confidence, amount, direction = detect_template(body, sender)
    template = SMS_TEMPLATES.get(key or '', {})
    fallback_date = received_at.date() if hasattr(received_at, 'date') else received_at
    parsed = {
        'amount': str(amount) if amount is not None else '',
        'direction': direction or template.get('direction') or '',
        'transaction_type': template.get('tx_type') or 'other',
        'tx_date': extract_date(body, fallback_date).isoformat(),
        'classification': template.get('classification', ''),
        'spend_category': template.get('default_spend_category', ''),
        'merchant': extract_merchant(body),
        'external_reference': extract_reference(body),
        'currency': 'INR',
    }
    return {
        'template_key': key or '',
        'confidence': confidence,
        'parsed_tx': parsed,
    }
