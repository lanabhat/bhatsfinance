"""
SMS rule evaluation and field extraction engine.

Condition tree schema
---------------------
A tree is either a ConditionGroup or a ConditionLeaf.

ConditionGroup  { "op": "and"|"or", "conditions": [ <node>, ... ] }
ConditionLeaf   { "field": "sender"|"body",
                  "op": "contains"|"not_contains"|"equals"|
                        "starts_with"|"ends_with"|"regex",
                  "value": "<string>" }

All string comparisons are case-insensitive.
"""
import re
from datetime import date, datetime, timezone as dt_timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sms_ingestion.models import SmsRule


# ---------------------------------------------------------------------------
# Condition evaluation
# ---------------------------------------------------------------------------

def _match_leaf(node: dict, sender: str, body: str) -> bool:
    field = node.get('field', 'body')
    op = node.get('op', 'contains')
    value = (node.get('value') or '').lower()
    text = (sender if field == 'sender' else body).lower()

    if op == 'contains':
        return value in text
    if op == 'not_contains':
        return value not in text
    if op == 'equals':
        return text == value
    if op == 'starts_with':
        return text.startswith(value)
    if op == 'ends_with':
        return text.endswith(value)
    if op == 'regex':
        try:
            return bool(re.search(value, text, re.IGNORECASE))
        except re.error:
            return False
    return False


def evaluate_condition(node: dict, sender: str, body: str) -> bool:
    """Recursively evaluate a condition node (group or leaf)."""
    if not node:
        return True
    if 'conditions' in node:
        op = node.get('op', 'and')
        children = node.get('conditions') or []
        if not children:
            return True
        if op == 'and':
            return all(evaluate_condition(c, sender, body) for c in children)
        return any(evaluate_condition(c, sender, body) for c in children)
    return _match_leaf(node, sender, body)


def match_rule(rule: 'SmsRule', sender: str, body: str) -> bool:
    return evaluate_condition(rule.conditions or {}, sender, body)


def find_matching_rule(rules: list, sender: str, body: str) -> 'SmsRule | None':
    """Return the first active rule (pre-ordered by priority) whose conditions match."""
    for rule in rules:
        if rule.is_active and match_rule(rule, sender, body):
            return rule
    return None


# ---------------------------------------------------------------------------
# Regex extraction helper
# ---------------------------------------------------------------------------

def _extract(pattern: str, text: str) -> str:
    """
    Run pattern against text.  Returns the (?P<value>...) named group when
    present; falls back to the first numbered capture group so that patterns
    without the named group still work.  Returns '' on no match or bad regex.
    """
    if not pattern:
        return ''
    try:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            # Prefer named group; fall back to group 1 if it exists
            named = (m.groupdict() or {}).get('value')
            if named is not None:
                return named.strip()
            if m.lastindex:
                first = next((g for g in m.groups() if g is not None), None)
                if first is not None:
                    return first.strip()
    except re.error:
        pass
    return ''


# ---------------------------------------------------------------------------
# Rule application
# ---------------------------------------------------------------------------

def apply_rule(rule: 'SmsRule', base_parsed_tx: dict, body: str, received_at: 'datetime | None' = None) -> dict:
    """
    Overlay rule's mapped fields onto base_parsed_tx.
    Only non-blank rule fields override the base value.
    Always sets tx_date (extracted from body, falling back to received_at or today)
    and currency (defaulting to INR) so the approval form is never missing them.
    Returns a new dict (base_parsed_tx is not mutated).
    """
    from sms_ingestion.templates import extract_date
    result = dict(base_parsed_tx)

    if rule.account_id:
        result['account'] = str(rule.account_id)
    if rule.member_id:
        result['member'] = str(rule.member_id)
    if rule.direction:
        result['direction'] = rule.direction
    if rule.transaction_type:
        result['transaction_type'] = rule.transaction_type
    if rule.classification:
        result['classification'] = rule.classification
    if rule.spend_category:
        result['spend_category'] = rule.spend_category

    # Regex extractors — only override if the pattern extracts something
    amount = _extract(rule.amount_regex, body)
    if amount:
        result['amount'] = amount.replace(',', '')

    merchant = _extract(rule.merchant_regex, body)
    if merchant:
        result['merchant'] = merchant

    reference = _extract(rule.reference_regex, body)
    if reference:
        result['external_reference'] = reference

    notes = _extract(rule.notes_regex, body)
    if notes:
        result['notes'] = notes

    # Always populate tx_date and currency so the approval form is never blank
    if not result.get('tx_date'):
        if received_at is not None:
            fallback = received_at.date() if hasattr(received_at, 'date') else received_at
        else:
            fallback = date.today()
        result['tx_date'] = extract_date(body, fallback).isoformat()

    if not result.get('currency'):
        result['currency'] = 'INR'

    return result


def test_rule_extractions(rule_data: dict, sender: str, body: str) -> dict:
    """
    Test a rule definition (as a plain dict, not a saved model instance)
    against sample sender + body.  Returns matched flag and extracted values.
    Used by the /test-new/ endpoint so users can validate rules before saving.
    """
    conditions = rule_data.get('conditions') or {}
    matched = evaluate_condition(conditions, sender, body)
    extractions = {
        'amount': _extract(rule_data.get('amount_regex', ''), body),
        'merchant': _extract(rule_data.get('merchant_regex', ''), body),
        'reference': _extract(rule_data.get('reference_regex', ''), body),
        'notes': _extract(rule_data.get('notes_regex', ''), body),
    }
    return {'matched': matched, 'extractions': {k: v for k, v in extractions.items() if v}}
