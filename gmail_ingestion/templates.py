"""
Rule templates for Gmail email parsing.
Each template describes a pattern of Indian bank/financial email alerts.
"""
import re
from decimal import Decimal, InvalidOperation

# ---------------------------------------------------------------------------
# Template registry
# ---------------------------------------------------------------------------

RULE_TEMPLATES: dict[str, dict] = {
    'bank_debit_cc': {
        'label': 'Bank Credit Card Spend',
        'description': 'Debit alerts for credit card transactions (Axis, HDFC, ICICI etc.)',
        'amount_re': r'(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)\s+spent',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['spent on credit card', 'credit card no', 'credit card no.'],
    },
    'bank_debit_account': {
        'label': 'Bank Account Debit',
        'description': 'Debit alerts for savings/current account debits',
        'amount_re': r'(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+(?:is |has been )?debited|(?:Rs\.?|₹|INR)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+debited',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['debited from', 'account number', 'XXXXXXXXXX', 'has been debited', 'is debited'],
    },
    'bank_balance': {
        'label': 'Bank Balance Update',
        'description': 'Account balance notifications — creates a valuation snapshot, not a transaction',
        'amount_re': r'(?:avail(?:able)?\s*balance|balance\s+in\s+your\s+account(?:\s+ending\s+\S+)?)\s+(?:is\s+)?(?:Rs\.?\s*)?(?:INR\s*)?(?:Rs\.?\s+INR\s+)?([0-9][0-9,]*\.?[0-9]*)',
        'direction': None,
        'tx_type': None,
        'target': 'account',
        'classification': '',
        'default_spend_category': '',
        'confidence_signals': ['available balance', 'balance in your account', 'account ending', 'does not include', 'as of'],
        'negative_signals': ['has been debited', 'is debited', 'has been credited', 'credited to', 'spent on'],
    },
    'bank_inflow': {
        'label': 'Bank Credit / Salary',
        'description': 'Credit alerts — salary, transfers, refunds credited to account',
        'amount_re': r'(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)\s+(?:has been )?credited|credited\s+(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)|[Aa]mount\s+[Rr]eceived\s*:\s*(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'inflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'income',
        'default_spend_category': '',
        'confidence_signals': ['credited to', 'credited in', 'has been credited', 'bank reference number', 'UTR', 'received a credit', 'amount received', 'neft cr', 'deposit alert', 'new deposit'],
        'negative_signals': ['personal loan offer', 'pre-approved loan', 'pre approved loan', 'loan offer', 'eligible for a loan', 'apply for a loan', 'loan approved for you', 'you are eligible'],
    },
    'mf_sip': {
        'label': 'Mutual Fund SIP',
        'description': 'SIP / purchase confirmations from AMCs (Nippon, ABSL, HDFC MF, Jupiter, etc.)',
        'amount_re': r'(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'buy',
        'target': 'instrument',
        'classification': 'internal_transfer',
        'default_spend_category': '',
        'confidence_signals': ['systematic investment', 'SIP transaction', 'units allotted', 'folio', 'purchase in',
                               'mutual fund name', 'payment date', 'bank reference number', 'SIP'],
    },
    'jupiter_sip': {
        'label': 'Jupiter SIP / Investment',
        'description': 'Daily/weekly SIP and lump-sum investments placed via Jupiter Money savings account',
        'amount_re': r'₹\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'buy',
        'target': 'instrument',
        'classification': 'internal_transfer',
        'default_spend_category': '',
        'confidence_signals': ['jupiter', 'mutual fund name', 'bank reference number', 'payment date',
                               'summary for your reference', 'jupiter savings', 'invested'],
    },
    'insurance_premium': {
        'label': 'Insurance Premium',
        'description': 'LIC, health, vehicle insurance premium payment confirmations',
        'amount_re': r'(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'premium',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['premium', 'policy', 'LIC', 'insurance', 'insured'],
    },
    'atm_withdrawal': {
        'label': 'ATM / Cash Withdrawal',
        'description': 'ATM cash withdrawal alerts',
        'amount_re': r'(?:INR|Rs\.?|₹|Rs)\s*([0-9][0-9,]*(?:\.[0-9]*)?)',
        'direction': 'outflow',
        'tx_type': 'withdrawal',
        'target': 'account',
        'classification': 'internal_transfer',
        'default_spend_category': '',
        'confidence_signals': ['ATM withdrawal', 'ATM', 'cash withdrawal'],
    },
    'neft_imps': {
        'label': 'NEFT / IMPS / UPI Transfer',
        'description': 'Outward NEFT/IMPS/UPI transfers from bank account',
        'amount_re': r'[Aa]mount\s+[Rr]emitted\s*:\s*(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)|(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+(?:transferred|remitted)|[Tt]ransfer\s+of\s+(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['NEFT', 'IMPS', 'UPI', 'transferred to', 'transfer of', 'towards VPA', 'VPA', 'Amount Remitted', 'Beneficiary Name', 'UTR No', 'fund transfer'],
    },
    'emi_payment': {
        'label': 'EMI / Loan Repayment',
        'description': 'EMI deductions for home loan, auto loan, personal loan',
        'amount_re': r'(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'emi',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'emi',
        'confidence_signals': ['EMI', 'loan repayment', 'installment', 'towards'],
    },
    'stock_trade': {
        'label': 'Stock Purchase / Sale',
        'description': 'Equity trade confirmations from brokers (Upstox, Zerodha, Groww etc.)',
        'amount_re': r'(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'buy',
        'target': 'instrument',
        'classification': 'internal_transfer',
        'default_spend_category': '',
        'confidence_signals': ['shares', 'equity', 'NSE', 'BSE', 'trade confirmation', 'contract note'],
    },
    'cc_spend_alert': {
        'label': 'Credit Card Spend Alert',
        'description': 'Transaction-successful alerts from credit cards (Scapia Federal, IDFC, etc.)',
        'amount_re': r'(?:Amount|Amt)[^\n]*?(?:₹|INR|Rs\.?)\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['transaction was successful', 'merchant', "you've earned", 'rupay credit card'],
    },
    'cc_bill_statement': {
        'label': 'Credit Card Bill Statement',
        'description': 'Monthly billing/statement emails with payment due date and total/minimum due',
        'amount_re': r'[Tt]otal\s+[Aa]mount\s+[Dd]ue[^\n]*?(?:₹|INR|Rs\.?)\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': None,
        'tx_type': None,
        'target': 'account',
        'classification': '',
        'default_spend_category': '',
        'confidence_signals': ['payment due', 'minimum amount due', 'total amount due', 'credit card statement'],
    },
    'cc_transaction_alert': {
        'label': 'Credit Card Transaction Alert',
        'description': 'Card-used alerts from ICICI, SBI, Axis showing card number and merchant info',
        'amount_re': r'(?:for|of)\s+(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['credit card', 'has been used', 'available credit limit', 'info:'],
    },
    'cc_bill_payment': {
        'label': 'Credit Card Bill Payment',
        'description': 'Confirmation that a credit card bill payment was made successfully',
        'amount_re': r'(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+payment\s+(?:successful|received|processed)|payment\s+of\s+(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+(?:successful|received|processed)|(?:bill\s+of\s+|bill\s+payment\s+of\s+)(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'cc_bill_payment',
        'target': 'account',
        'classification': 'internal_transfer',
        'default_spend_category': '',
        'confidence_signals': ['payment successful', 'bill payment', 'credit card bill', 'card payment successful', 'payment received for your credit card', 'processed successfully via', 'SmartPay'],
    },
    'upi_debit': {
        'label': 'UPI Debit / Payment',
        'description': 'UPI payment debits — towards VPA, PhonePe, GPay, etc.',
        'amount_re': r'(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+(?:is |has been )?debited|debited\s+(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['towards VPA', 'VPA', 'upi transaction', 'you have done a upi', 'upi ref', 'UPI/'],
    },
    'fastag_recharge': {
        'label': 'FASTag Wallet Recharge',
        'description': 'HDFC/ICICI/other FASTag wallet recharge confirmation — updates wallet balance',
        'amount_re': r'recharged\s+for\s+(?:Rs\.?|INR|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)|(?:Rs\.?|INR|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+(?:has been )?recharged',
        'direction': 'inflow',
        'tx_type': 'deposit',
        'target': 'account',
        'classification': 'internal_transfer',
        'default_spend_category': '',
        'confidence_signals': ['FASTag', 'NETC FASTag', 'FASTag wallet', 'recharge successful', 'recharged'],
    },
    'fastag_toll': {
        'label': 'FASTag Toll Deduction',
        'description': 'Toll fee deducted from FASTag wallet',
        'amount_re': r'(?:Toll\s+Paid|toll\s+fee|deducted)\s+(?:Rs\.?|INR|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)|(?:Rs\.?|INR|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+(?:deducted|toll)',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'transport',
        'confidence_signals': ['FASTag Wallet', 'Toll Paid', 'toll fee', 'toll deducted', 'FASTag'],
    },
    'cc_action_required': {
        'label': 'Credit Card — Action Required',
        'description': 'Unclaimed funds, cashback, rewards or action needed on credit card',
        'amount_re': r'(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'inflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'income',
        'default_spend_category': '',
        'confidence_signals': ['unclaimed', 'action required', 'claim your', 'cashback pending', 'reward pending'],
    },
    'tds_deduction': {
        'label': 'TDS Deduction',
        'description': 'TDS deducted on FD/savings interest — maps to the FD or savings account',
        'amount_re': r'[Tt][Dd][Ss]\s+of\s+(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)|(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+(?:TDS|tds)\s+deducted',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['TDS', 'deducted for interest', '15G', '15H', 'submit 15', 'A/C No'],
    },
    'fd_maturity': {
        'label': 'Fixed Deposit Maturity / Renewal',
        'description': 'FD matured, auto-renewed, or proceeds credited to account',
        'amount_re': r'(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'inflow',
        'tx_type': 'deposit',
        'target': 'account',
        'classification': 'income',
        'default_spend_category': '',
        'confidence_signals': ['FD maturity', 'fixed deposit matured', 'fixed deposit renewed', 'auto-renewed', 'maturity proceeds', 'maturity amount'],
    },
    'cc_reward_credit': {
        'label': 'Credit Card Cashback / Reward Credit',
        'description': 'Cashback or reward points credited to credit card or bank account',
        'amount_re': r'(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'inflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'income',
        'default_spend_category': '',
        'confidence_signals': ['cashback credited', 'cashback of', 'reward points redeemed', 'rewards redeemed', 'reward credited'],
    },
    'bank_interest': {
        'label': 'Savings / FD Interest Credit',
        'description': 'Interest credited to savings or FD account',
        'amount_re': r'(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+(?:has been )?credited|credited\s+(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'inflow',
        'tx_type': 'interest',
        'target': 'account',
        'classification': 'income',
        'default_spend_category': '',
        'confidence_signals': ['interest credited', 'interest of', 'interest amount', 'quarterly interest', 'savings interest'],
    },
    'ppf_contribution': {
        'label': 'PPF / NPS Contribution',
        'description': 'Contribution to PPF, NPS, EPF or other provident fund accounts',
        'amount_re': r'(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'buy',
        'target': 'instrument',
        'classification': 'internal_transfer',
        'default_spend_category': '',
        'confidence_signals': ['PPF', 'NPS contribution', 'provident fund', 'pension fund', 'EPF contribution'],
    },
    'cheque_cleared': {
        'label': 'Cheque Cleared',
        'description': 'Outward or inward cheque clearance debit/credit',
        'amount_re': r'(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'other',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'other',
        'confidence_signals': ['cheque no', 'cheque cleared', 'outward cheque', 'cheque has been cleared', 'chq no'],
    },
    'nach_debit': {
        'label': 'NACH / ECS Mandate Debit',
        'description': 'Recurring NACH or ECS auto-debit for loan, insurance, or subscription',
        'amount_re': r'(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)\s+(?:is |has been )?debited|debited\s+(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'outflow',
        'tx_type': 'emi',
        'target': 'account',
        'classification': 'spend',
        'default_spend_category': 'emi',
        'confidence_signals': ['NACH', 'ECS', 'mandate debit', 'auto debit', 'standing instruction', 'SI fund transfer', 'SI transfer'],
    },
    'loan_disbursal': {
        'label': 'Loan Disbursement',
        'description': 'Loan amount credited/disbursed to account (home loan, personal loan, etc.)',
        'amount_re': r'(?:INR|Rs\.?|₹)\.?\s*([0-9][0-9,]*\.?[0-9]*)',
        'direction': 'inflow',
        'tx_type': 'deposit',
        'target': 'account',
        'classification': 'income',
        'default_spend_category': '',
        'confidence_signals': ['loan disbursed', 'disbursement amount', 'loan amount credited', 'sanctioned amount', 'loan of'],
        'negative_signals': ['personal loan offer', 'pre-approved loan', 'pre approved loan', 'loan offer', 'eligible for a loan'],
    },
}


# ---------------------------------------------------------------------------
# Detection helpers
# ---------------------------------------------------------------------------

def _to_decimal(s: str) -> Decimal | None:
    if not s:
        return None
    cleaned = s.replace(',', '').strip()
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def detect_template(subject: str, snippet: str, sender: str = '', custom_templates: dict | None = None) -> tuple[str | None, float, Decimal | None, str | None]:
    """
    Try every template against the combined subject+snippet+sender text.
    Returns (template_key, confidence, parsed_amount, direction).
    Best-scoring template wins; returns (None, 0.0, None, None) if nothing matches.
    """
    text = f'{subject}\n{snippet}\n{sender}'.lower()

    best_key: str | None = None
    best_conf: float = 0.0
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

        # Try to extract amount with this template's regex
        amount: Decimal | None = None
        amount_re_str = tmpl.get('amount_re', '')
        if amount_re_str:
            try:
                m = re.search(amount_re_str, f'{subject}\n{snippet}', re.IGNORECASE)
                if m:
                    # Some patterns have two capture groups (alternation)
                    raw = next((g for g in m.groups() if g), None) if m.lastindex and m.lastindex > 1 else (m.group(1) if m.lastindex else None)
                    amount = _to_decimal(raw) if raw else None
            except re.error:
                pass

        if conf > best_conf:
            best_key = key
            best_conf = conf
            best_amount = amount
            best_direction = tmpl.get('direction')

    return best_key, round(best_conf, 3), best_amount, best_direction


def apply_template_regex(template_key: str, text: str, custom_templates: dict | None = None) -> Decimal | None:
    """Run the amount regex for a specific template against text. Returns first match or None."""
    tmpl = get_effective_templates(custom_templates).get(template_key)
    if not tmpl:
        return None
    amount_re_str = tmpl.get('amount_re', '')
    if not amount_re_str:
        return None
    try:
        m = re.search(amount_re_str, text, re.IGNORECASE)
        if not m:
            return None
        raw = next((g for g in m.groups() if g), None) if m.lastindex and m.lastindex > 1 else (m.group(1) if m.lastindex else None)
        return _to_decimal(raw) if raw else None
    except re.error:
        return None


def get_effective_templates(custom: dict | None = None) -> dict:
    """Merge built-in RULE_TEMPLATES with user custom_templates. Custom wins on key conflict."""
    merged = dict(RULE_TEMPLATES)
    for key, tmpl in (custom or {}).items():
        merged[key] = tmpl
    return merged


def templates_for_api() -> list[dict]:
    """Serialise RULE_TEMPLATES for the frontend (drop internal regex detail)."""
    return [
        {
            'key': k,
            'label': v['label'],
            'description': v['description'],
            'direction': v['direction'],
            'tx_type': v['tx_type'],
            'target': v['target'],
        }
        for k, v in RULE_TEMPLATES.items()
    ]


def templates_for_api_full(custom: dict | None = None) -> list[dict]:
    """Serialise all effective templates including internal regex and signals for the editor UI."""
    effective = get_effective_templates(custom)
    builtin_keys = set(RULE_TEMPLATES.keys())
    custom_keys = set(custom.keys()) if custom else set()
    return [
        {
            'key': k,
            'label': v.get('label', ''),
            'description': v.get('description', ''),
            'direction': v.get('direction'),
            'tx_type': v.get('tx_type'),
            'target': v.get('target', 'account'),
            'amount_re': v.get('amount_re', ''),
            'confidence_signals': v.get('confidence_signals', []),
            'negative_signals': v.get('negative_signals', []),
            'is_builtin': k in builtin_keys and k not in custom_keys,
        }
        for k, v in effective.items()
    ]


# ---------------------------------------------------------------------------
# Structured field extraction
# ---------------------------------------------------------------------------

# Patterns for common structured fields in Indian bank/AMC emails
_FIELD_PATTERNS: list[tuple[str, str, str]] = [
    # (field_key, label, regex)  — first capture group is the value
    ('amount',        'Amount',         r'(?:Investment\s+)?(?:Amount|Amt)[^\n:]*[:=\t]\s*(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)'),
    ('folio_no',      'Folio No',       r'[Ff]olio\s*[Nn]o\.?\s*[:\-]?\s*([0-9]{5,20})'),
    ('scheme_name',   'Scheme Name',    r'[Ss]cheme\s*[-–]?\s*[Pp]lan\s*[Dd]etails?\s*[:\-]?\s*([^\n\r]{5,120})|[Ss]cheme\s*[Nn]ame\s*[:\-]?\s*([^\n\r]{5,120})'),
    ('nav',           'NAV (₹/unit)',   r'NAV\s*(?:\(₹\s*per\s*unit\))?\s*[:\-]?\s*([0-9]+\.?[0-9]*)'),
    ('units',         'Units allotted', r'[Uu]nits?\s*(?:\([Nn]os?\.\))?\s*(?:allotted|purchased)?\s*[:\-]?\s*([0-9]+\.?[0-9]*)'),
    ('nav_date',      'NAV Date',       r'NAV\s*[Dd]ate\s*[:\-]?\s*([0-9]{2}/[0-9]{2}/[0-9]{4}|[0-9]{2}-[0-9]{2}-[0-9]{4})'),
    ('tx_ref',        'Transaction Ref',r'[Tt]ransaction\s*[Rr]eference\s*[Nn]umber\s*[:\-]?\s*([0-9]{5,20})'),
    ('utr_no',        'UTR No',         r'UTR\s*[Nn]o\.?\s*[:\-]?\s*([A-Z0-9]{10,25})'),
    ('account_suffix','Account (last 4)',r'[Aa]/[Cc]\s*[:=\s]*(?:no\.?)?\s*(?:XX|xx|\*+)?([0-9]{4})|[Cc]redited\s+to\s+[Yy]our\s+[Aa]/[Cc]\s*[:=\s]*(?:XX)?([0-9]{4})'),
    ('credited_by',   'Sent by',        r'[Ss]ent\s+by\s*[:\-]?\s*([^\n\r]{3,80})'),
    ('ifsc',          'Sender IFSC',    r'IFSC\s*[:\-]?\s*([A-Z]{4}0[A-Z0-9]{6})'),
    ('sip_amount',    'SIP Amount',     r'SIP\s+[Aa]mount\s*(?:\(₹\))?\s*[:\-]?\s*([0-9][0-9,]*\.?[0-9]*)'),
    ('stamp_duty',    'Stamp Duty',     r'[Ss]tamp\s+[Dd]uty\s*(?:\(₹\))?\s*[:\-]?\s*([0-9]+\.?[0-9]*)'),
    ('net_amount',    'Net Amount',     r'[Nn]et\s+[Aa]mount\s*(?:\(₹\))?\s*[:\-]?\s*([0-9][0-9,]*\.?[0-9]*)'),
    ('merchant',      'Merchant',       r'[Mm]erchant\s*[:\-]?\s*([^\n\r]{3,80})'),
    ('card_suffix',   'Card (last 4)',  r'(?:[Cc]ard|CC)\s*(?:[Nn]o\.?|[Nn]umber)?\s*(?:XX|xx|\*+)([0-9]{4})|XX([0-9]{4})'),
    ('amount_due',    'Total Amount Due', r'[Tt]otal\s+[Aa]mount\s+[Dd]ue[^\n]*?(?:₹|INR|Rs\.?)\s*([0-9][0-9,]*\.?[0-9]*)'),
    ('min_due',       'Minimum Amount Due', r'[Mm]inimum\s+[Aa]mount\s+[Dd]ue[^\n]*?(?:₹|INR|Rs\.?)\s*([0-9][0-9,]*\.?[0-9]*)'),
    ('due_date',      'Payment Due Date', r'[Pp]ayment\s+[Dd]ue\s+(?:by\s+)?([A-Za-z]+ [0-9]{1,2}(?:,? [0-9]{4})?|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})'),
    ('rewards_earned', 'Rewards Earned', r"[Yy]ou(?:'ve)?\s+earned\s+([0-9]+)\s*(?:rewards?|pts?|points?|coins?)?"),
    ('tx_info',       'Transaction Info', r'[Ii]nfo:\s*([A-Z][A-Z0-9 /&]{4,60})'),
]


def extract_fields(subject: str, body: str) -> dict[str, dict]:
    """
    Run structured regexes against subject + body text.
    Returns dict[field_key] -> {'label': str, 'value': str}.
    Only keys with actual matches are included.
    """
    text = f'{subject}\n{body}'
    result: dict[str, dict] = {}
    for field_key, label, pattern in _FIELD_PATTERNS:
        try:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                # Take first non-None capture group
                raw = next((g for g in m.groups() if g is not None), None)
                if raw:
                    result[field_key] = {'label': label, 'value': raw.strip()}
        except re.error:
            pass
    return result


# ---------------------------------------------------------------------------
# Multiline label-value extraction (Jupiter Money, PhonePe, Groww style)
# Label on one line, value on the next non-blank line.
# ---------------------------------------------------------------------------

# Each entry: (field_key, label_text, optional_value_regex)
# If value_regex is None: the entire next non-blank line is the value.
# If value_regex is given: it is applied to the next non-blank line (and same line).
MULTILINE_FIELD_MAP: list[tuple[str, str, str | None]] = [
    ('scheme_name',   'Mutual fund name',      None),
    ('scheme_name',   'Fund name',             None),
    ('scheme_name',   'Scheme name',           None),
    ('amount',        'Amount',                r'₹?\s*([0-9][0-9,]*\.?[0-9]*)'),
    ('sip_amount',    'SIP amount',            r'₹?\s*([0-9][0-9,]*\.?[0-9]*)'),
    ('payment_date',  'Payment date',          None),
    ('payment_date',  'Transaction date',      None),
    ('payment_date',  'Date',                  None),
    ('tx_ref',        'Transaction ID',        None),
    ('tx_ref',        'Transaction id',        None),
    ('tx_ref',        'Transaction reference', None),
    ('bank_ref',      'Bank reference number', None),
    ('bank_ref',      'Bank reference',        None),
    ('bank_ref',      'UTR number',            None),
    ('folio_no',      'Folio number',          None),
    ('folio_no',      'Folio no',              None),
    ('nav',           'NAV',                   r'([0-9]+\.?[0-9]*)'),
    ('units',         'Units allotted',        r'([0-9]+\.?[0-9]*)'),
    ('units',         'Units',                 r'([0-9]+\.?[0-9]*)'),
    ('net_amount',    'Net amount',            r'₹?\s*([0-9][0-9,]*\.?[0-9]*)'),
    ('stamp_duty',    'Stamp duty',            r'([0-9]+\.?[0-9]*)'),
    ('merchant',      'Merchant name',         None),
    ('merchant',      'Merchant',              None),
    ('card_suffix',   'Card number',           r'XX([0-9]{4})'),
    ('amount_due',    'Total amount due',      r'(?:₹|INR|Rs\.?)?\s*([0-9][0-9,]*\.?[0-9]*)'),
    ('min_due',       'Minimum amount due',    r'(?:₹|INR|Rs\.?)?\s*([0-9][0-9,]*\.?[0-9]*)'),
    ('due_date',      'Payment due date',      None),
    ('due_date',      'Due date',              None),
    ('rewards_earned', 'Rewards earned',       r'([0-9]+)'),
    ('tx_info',       'Info',                  None),
]

# Label for display (field_key -> label string)
_MULTILINE_LABELS: dict[str, str] = {
    'scheme_name':  'Scheme Name',
    'amount':       'Amount',
    'sip_amount':   'SIP Amount',
    'payment_date': 'Payment Date',
    'tx_ref':       'Transaction ID',
    'bank_ref':     'Bank Reference',
    'folio_no':     'Folio No',
    'nav':          'NAV (₹/unit)',
    'units':        'Units Allotted',
    'net_amount':    'Net Amount',
    'stamp_duty':    'Stamp Duty',
    'merchant':      'Merchant',
    'card_suffix':   'Card (last 4)',
    'amount_due':    'Total Amount Due',
    'min_due':       'Minimum Amount Due',
    'due_date':      'Payment Due Date',
    'rewards_earned': 'Rewards Earned',
    'tx_info':       'Transaction Info',
}


def extract_fields_multiline(text: str) -> dict[str, dict]:
    """
    Extract fields from emails where label and value appear on separate lines.
    E.g.:
        Mutual fund name
        Aditya Birla Sun Life Nifty Midcap 150 Index Fund Direct Growth
    Returns same shape as extract_fields: dict[field_key] -> {'label', 'value'}.
    Earlier entries in MULTILINE_FIELD_MAP win (first match per field_key).
    """
    lines = [l.strip() for l in text.splitlines()]
    result: dict[str, dict] = {}

    for field_key, label_text, value_re in MULTILINE_FIELD_MAP:
        if field_key in result:
            continue  # already found from an earlier, higher-priority entry
        label_lower = label_text.lower()
        for i, line in enumerate(lines):
            if line.lower() != label_lower:
                continue
            # Find next non-blank line
            next_val = ''
            for j in range(i + 1, min(i + 4, len(lines))):
                if lines[j]:
                    next_val = lines[j]
                    break
            if not next_val:
                continue

            if value_re:
                m = re.search(value_re, next_val, re.IGNORECASE)
                # also try same line (label: value on one line)
                if not m:
                    m = re.search(value_re, line, re.IGNORECASE)
                value = m.group(1).strip() if m else ''
            else:
                # Skip lines that look like noise (single word keywords like "SIP", "null")
                if next_val.lower() in ('sip', 'null', 'n/a', '-', '—'):
                    continue
                value = next_val

            if value:
                display_label = _MULTILINE_LABELS.get(field_key, label_text)
                result[field_key] = {'label': display_label, 'value': value}
            break  # found the label line; move to next field

    return result


def extract_instrument_proposal(fields: dict[str, dict]) -> dict | None:
    """
    Given extracted fields, return an instrument proposal dict if this looks like an MF email.
    Returns None if insufficient data.
    """
    scheme = (fields.get('scheme_name') or {}).get('value', '').strip()
    folio = (fields.get('folio_no') or {}).get('value', '').strip()
    if not scheme:
        return None
    # Normalise scheme name: strip trailing whitespace and common suffixes from email line breaks
    scheme = re.sub(r'\s+', ' ', scheme)[:200]
    return {
        'scheme_name': scheme,
        'folio_no': folio or None,
        'instrument_type': 'mutual_fund',
        'nav': (fields.get('nav') or {}).get('value'),
        'units': (fields.get('units') or {}).get('value'),
    }
