import re

CATEGORY_PATTERNS = {
    'transaction': r'\b(debited|credited|withdrawn|spent|payment|paid|purchase|upi|neft|imps|rtgs|txn|balance)\b',
    'otp': r'\b(otp|one[- ]?time password|verification code|security code|do not share)\b',
    'sip_reminder': r'\b(sip|systematic investment|mandate|nach|auto[- ]?debit|instal?ment)\b',
    'promotion': r'\b(offer|sale|discount|cashback|win|free|deal|coupon|voucher|reward)\b',
    'alert': r'\b(alert|reminder|due date|overdue|bill)\b',
}

_COMPILED = {key: re.compile(pattern, re.IGNORECASE) for key, pattern in CATEGORY_PATTERNS.items()}


def categorize(body: str) -> list[str]:
    return [name for name, pattern in _COMPILED.items() if pattern.search(body or '')]
