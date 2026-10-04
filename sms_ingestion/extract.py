"""Read an Indian bank/card/UPI SMS into transaction fields, with no user setup.

extract_sms() pulls out what the message itself states: amount, debit/credit,
date, the account or card's trailing digits, counterparty, reference and the
balance after the transaction, plus what kind of message it is. Formats were
collected from real alerts (Federal, SBI, HDFC, ICICI, DBS, Axis, India Post,
PSB, Scapia); anything unrecognised falls back to generic money/verb patterns.

User SmsRules are applied on top of this (rule_engine.apply_rule) as overrides.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

_MONEY = r'(?:Rs\.?|INR|₹)\s*'
_AMT = r'(\d[\d,]*(?:\.\d+)?)'
_MONTHS = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], start=1)}

# Sender code (operator prefix and -S/-T suffix stripped) -> words that identify
# the bank in an Account's name/institution, used to break ties between accounts
# that share trailing digits.
BANK_KEYWORDS = {
    'FEDBNK': ('federal',), 'FEDSCP': ('scapia',),
    'HDFCBK': ('hdfc',), 'ICICIT': ('icici',), 'ICICIB': ('icici',),
    'CBSSBI': ('sbi', 'state bank'), 'SBIINB': ('sbi', 'state bank'), 'ATMSBI': ('sbi', 'state bank'),
    'DBSBNK': ('dbs',), 'AXISBK': ('axis',), 'DOPBNK': ('post', ' po'), 'PSBANK': ('psb', 'punjab'),
    'KOTAKB': ('kotak',), 'IDFCFB': ('idfc',),
}


def normalize_sender(sender: str) -> str:
    """'AD-FEDBNK-S' / 'VA-FEDBNK' / 'FEDBNK-T' -> 'FEDBNK'. Phone numbers pass through."""
    s = (sender or '').strip().upper()
    s = re.sub(r'^[A-Z]{2}-', '', s)
    s = re.sub(r'-[A-Z]$', '', s)
    return s


def _money(text: str | None) -> Decimal | None:
    if not text:
        return None
    try:
        return Decimal(text.replace(',', ''))
    except InvalidOperation:
        return None


# --- message kinds that aren't transactions --------------------------------

_INFO_KINDS = [
    ('otp', re.compile(r'\bOTP\b|one[ -]time password|verification code', re.I)),
    ('failed', re.compile(r'unsuccessful|\bfailed\b|declined|could not be processed|not eligible', re.I)),
    ('reminder', re.compile(
        r'\bis due\b|due (?:date|on)\b|will be debited|is scheduled|statement (?:is ready|for .{0,40}is generated)'
        r'|min(?:imum)?\.? (?:amt|amount) due|ignore if (?:already )?paid|mandate .{0,40}created'
        r'|request received|has been submitted|maintain sufficient balance|will auto-debit', re.I)),
]
_PROMO = re.compile(r'https?://|click here|\bT&C\b|offer|cashback|apply now|download', re.I)
_MF = re.compile(r'units?\b.{0,40}\ballot|allot.{0,40}\bunits?\b|\bNAV\b', re.I)

# --- amount + direction, most specific first -------------------------------
# Each: (kind, direction, pattern). The pattern's named group 'amount' is required.
_TX_PATTERNS: list[tuple[str, str, re.Pattern]] = [(k, d, re.compile(p, re.I)) for k, d, p in [
    # Federal NEFT/IMPS: "<payee> has received Rs 101.00 from your A/c 3422" — money left our account.
    ('debit', 'outflow', r'^(?:dear \w+,\s*)?(?P<party>[A-Za-z][\w .&\'-]{2,60}?) has received ' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?) from your a/?c'),
    # PSB: "NEFT ... for Rs. 40000 has been credited ... to Beneficiary" — our outgoing NEFT.
    ('debit', 'outflow', r'for ' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?) has been credited .{0,60}to beneficiary'),
    # Card bill paid: credit on the card side.
    ('cc_payment', 'inflow', r'payment of ' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?) has been received (?:towards|on) your .{0,40}credit card'),
    ('cc_payment', 'inflow', _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?) (?:received|credited) (?:towards|against) your .{0,20}credit card'),
    ('card_refund', 'inflow', r'refund of ' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?) credited to .{0,30}credit card'),
    # Fund house confirmations.
    ('mf_purchase', 'outflow', r'transaction of ' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?) in (?P<party>.{3,80}?) has been processed'),
    # Bill payments made through the bank (biller named after "for").
    ('debit', 'outflow', r'processed payment of ' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)'),
    # Card spends.
    ('card_spend', 'outflow', r'txn of ' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?) at (?P<party>.{2,60}?) on your .{0,40}card'),
    ('card_spend', 'outflow', r'spent ' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)'),
    ('card_spend', 'outflow', _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?) (?:was |has been )?spent'),
    # Account debits / credits (verb after or before the amount).
    ('debit', 'outflow', r'(?:debited|deducted|withdrawn)\s+(?:with\s+|by\s+|for\s+)?' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)'),
    ('debit', 'outflow', r'(?:sent|paid)[!:]?\s+' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)'),
    ('debit', 'outflow', _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)\s+(?:is |has been |was )?(?:debited|deducted|sent|paid|withdrawn)'),
    ('debit', 'outflow', r'(?:has (?:a )?debit|DEBIT with amount)\b.{0,60}?' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)'),
    ('credit', 'inflow', r'credited\s+(?:with\s+|by\s+)?' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)'),
    ('credit', 'inflow', _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)\s+(?:is |has been |was )?credited'),
    ('credit', 'inflow', r'(?:has (?:a )?credit|CREDIT with amount)\b.{0,60}?' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)'),
    ('credit', 'inflow', _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)\s+(?:is |has been |was )?deposited'),
    # HDFC: "UPI ATM Withdrawal:Rs.10000", "Payment Successful! Rs. 10000.00 from A/c **8196 to X".
    ('debit', 'outflow', r'withdrawal\s*:?\s*' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)'),
    ('debit', 'outflow', _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)\s+from a/?c\b'),
    ('credit', 'inflow', r'(?:received|deposited)\s+' + _MONEY + r'(?P<amount>\d[\d,]*(?:\.\d+)?)'),
]]

# Our own account/card: the first mention wins ("from A/c XX8196 ... To A/c xx7799").
_ACCOUNT = re.compile(
    r'(?:a/?c|acct|account|card)(?:\s*(?:no\.?|number|ending(?:\s+with)?))?\s*[:.]?\s*(?:[xX*•]+\s*)?(?P<digits>[xX*•\d]*\d{3,})',
    re.I,
)
_BALANCE_PATTERNS = [re.compile(p, re.I) for p in [
    r'available bal(?:ance)?\b.{0,60}?\bis\s*' + _MONEY + r'(?P<bal>\d[\d,]*(?:\.\d+)?)',
    r'(?:avl\.?|avail(?:able)?|current|updated account|clr)\s*bal(?:ance)?\.?\s*(?:is|:)?\s*' + r'(?:Rs\.?|INR|₹)?\s*(?P<bal>\d[\d,]*(?:\.\d+)?)',
    r'\bbal(?:ance)?\s*[:.]?\s*' + _MONEY + r'(?P<bal>\d[\d,]*(?:\.\d+)?)',
]]
_REFERENCE_PATTERNS = [re.compile(p, re.I) for p in [
    r'\bUPI[:\s/]+(?:ref(?:erence)?(?: no\.?)?[:\s]*)?(\d{9,})',
    r'\b(?:retrieval )?ref(?:erence)?(?:\s*(?:no|number)\.?)?[\s:.\-]*([A-Za-z0-9]{6,})',
    r'\bRRN[\s:]*([A-Za-z0-9]{6,})',
    r'\btransaction id[\s:]*([A-Za-z0-9]{6,})',
    r'\bUMRN[\s:]*([A-Za-z0-9]{6,})',
]]
_PARTY_PATTERNS = [re.compile(p, re.I) for p in [
    r'transferred to (?:mrs?\.?|ms\.?)?\s*(?P<party>[A-Za-z][A-Za-z .]{1,40}?)(?:\.\s|\.$|\s+avl|-|$)',
    r'(?:deposit by transfer|credited|received)\s.{0,40}?\bfrom (?:mrs?\.?|ms\.?)?\s*(?P<party>(?!your)[A-Za-z][A-Za-z .]{1,40}?)(?:\.\s|\.$|\s+upi|\s+on\b|-|$)',
    r'credit by (?:NACH|NEFT|IMPS)[-\s]*(?P<party>[A-Za-z][\w .&]{2,40}?)\s+of\b',
    r'\bvia UPI to (?P<party>[A-Za-z][\w .&@\'-]{1,40}?)(?:\.\s|\s+on\b|\s+ref|$)',
    r'\bto (?!a/?c\b|your\b|beneficiary\b|clearance\b|report\b)(?P<party>[A-Za-z][\w .&@\'-]{1,40}?)(?:\s+on\b|\s+ref|\s+via|\.\s|$)',
    r'\btowards (?!your\b)(?P<party>[A-Za-z][\w .&\'-]{1,40}?)(?:\s+for\b|\s+UMRN|\s+ref|\s+on\b|\.\s|$)',
    r'\bIST (?P<party>[A-Za-z][\w .&\'-]{1,30}?) Avl Limit',
    r'\bat (?P<party>[A-Za-z][\w .&\'-]{1,40}?)(?:\s+on\b|\.\s|,|$)',
]]
_DATE_NUMERIC = re.compile(r'\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b')
_DATE_TEXT = re.compile(r'\b(\d{1,2})[- ]?([A-Za-z]{3})[a-z]*[- ,]?(\d{2,4})\b')
_BAL_AS_ON = re.compile(r'as on (?:yesterday)?\s*[:\-]?\s*(\d{1,2}[-/ ]?[A-Za-z]{3}[a-z]*[-/ ]?\d{2,4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})', re.I)


def _year(y: str) -> int:
    return 2000 + int(y) if len(y) == 2 else int(y)


def _dates(text: str) -> list[date]:
    found: list[tuple[int, date]] = []
    for m in _DATE_NUMERIC.finditer(text):
        try:
            found.append((m.start(), date(_year(m.group(3)), int(m.group(2)), int(m.group(1)))))
        except ValueError:
            pass
    for m in _DATE_TEXT.finditer(text):
        month = _MONTHS.get(m.group(2)[:3].lower())
        if month:
            try:
                found.append((m.start(), date(_year(m.group(3)), month, int(m.group(1)))))
            except ValueError:
                pass
    return [d for _, d in sorted(found)]


def _plausible_date(text: str, received: date) -> date:
    """First date in the text within 60 days of when the SMS arrived, else the arrival date."""
    for d in _dates(text):
        if abs((d - received).days) <= 60:
            return d
    return received


def _account_hint(text: str) -> str:
    m = _ACCOUNT.search(text)
    if not m:
        return ''
    digits = re.sub(r'\D', '', m.group('digits'))
    return digits[-4:] if len(digits) >= 3 else ''


def _balance(text: str) -> Decimal | None:
    for pattern in _BALANCE_PATTERNS:
        for m in pattern.finditer(text):
            before = text[max(0, m.start() - 12):m.start()].lower()
            if 'limit' in m.group(0).lower() or 'due' in before:
                continue
            value = _money(m.group('bal'))
            if value is not None:
                return value
    return None


def _first(patterns: list[re.Pattern], text: str, group: str | int = 1) -> str:
    for pattern in patterns:
        m = pattern.search(text)
        if m:
            return m.group(group).strip(' .,-')
    return ''


def extract_sms(body: str, sender: str = '', received_at: datetime | date | None = None) -> dict:
    """Everything the SMS states, as plain values. `kind` is one of: debit, credit,
    card_spend, card_refund, cc_payment (card bill received, card side),
    cc_bill_paid (card bill paid, bank side), mf_purchase, balance, otp, failed,
    reminder, promotion, unknown."""
    text = re.sub(r'\s+', ' ', body or '').strip()
    received = (received_at.date() if isinstance(received_at, datetime) else received_at) or date.today()

    kind, direction, amount, party = 'unknown', '', None, ''
    for k, info_re in _INFO_KINDS:
        if info_re.search(text):
            kind = k
            break
    if kind == 'unknown':
        for k, d, pattern in _TX_PATTERNS:
            m = pattern.search(text)
            if m:
                kind, direction, amount = k, d, _money(m.group('amount'))
                party = (m.groupdict().get('party') or '').strip(' .,-')
                break
        if kind in ('debit', 'unknown') and _MF.search(text) and re.search(r'purchase|sip|allot', text, re.I):
            kind, direction = 'mf_purchase', 'outflow'
            amount = amount or _money(_first([re.compile(_MONEY + _AMT, re.I)], text))

    if not party and kind in ('debit', 'credit', 'card_spend'):
        party = _first(_PARTY_PATTERNS, text, 'party')
    party = re.sub(r'\s{2,}', ' ', party)[:80]

    if kind == 'debit' and (
        re.search(r'CC Bill\b|credit ?card (?:bill|payment)|towards your .{0,20}credit card', text, re.I)
        # Card bills paid over UPI to the card app.
        or re.match(r'(?:CRED|Scapia)\b', party, re.I)
    ):
        kind = 'cc_bill_paid'

    balance = _balance(text)
    if kind == 'unknown':
        if balance is not None:
            kind = 'balance'
        elif _PROMO.search(text):
            kind = 'promotion'

    balance_date = None
    if balance is not None:
        m = _BAL_AS_ON.search(text)
        balance_date = (_dates(m.group(1)) or [None])[0] if m else None

    tx_date = _plausible_date(text, received)
    to_account = re.search(r'\bto a/?c(?:\s*no\.?)?\s*[xX*•]*(\d{3,})', text, re.I)
    return {
        'kind': kind,
        'to_account_hint': to_account.group(1)[-4:] if to_account else '',
        'amount': amount,
        'direction': direction,
        'tx_date': tx_date,
        'account_hint': _account_hint(text),
        'counterparty': party,
        'reference': _first(_REFERENCE_PATTERNS, text),
        'balance': balance,
        'balance_date': balance_date or tx_date,
        'sender_code': normalize_sender(sender),
    }


TRANSACTION_KINDS = ('debit', 'credit', 'card_spend', 'card_refund', 'cc_payment', 'cc_bill_paid', 'mf_purchase')
