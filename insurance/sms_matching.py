from __future__ import annotations

import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

DATE_WINDOW_DAYS = 30
MAX_RESULTS = 5


def _policy_last_digits(policy_number: str, n: int = 4) -> str:
    digits = re.sub(r'\D', '', policy_number or '')
    return digits[-n:] if len(digits) >= n else ''


def _extract_sms_amount(msg) -> Decimal | None:
    parsed_tx = (msg.raw_payload or {}).get('parsed_tx') or {}
    raw_amount = parsed_tx.get('amount')
    if raw_amount:
        try:
            return Decimal(str(raw_amount).replace(',', ''))
        except InvalidOperation:
            pass

    from sms_ingestion.templates import detect_template

    _key, _confidence, amount, _direction = detect_template(msg.body, msg.sender)
    return amount


def find_sms_matches(policy, due_date: date | None = None) -> list[dict]:
    """
    Search the policy's household's pending SMS messages for likely premium
    payment matches: the SMS amount equals the policy's premium_amount, and/or
    the last 4 digits of the policy number appear in the SMS body.

    Returns candidates sorted best-first (amount+digits match ranked above
    amount-only), capped to MAX_RESULTS.
    """
    from sms_ingestion.models import SmsMessage

    if not policy.premium_amount:
        return []

    qs = SmsMessage.objects.filter(household_id=policy.household_id, status=SmsMessage.STATUS_PENDING)

    if due_date:
        window_start = due_date - timedelta(days=DATE_WINDOW_DAYS)
        window_end = due_date + timedelta(days=DATE_WINDOW_DAYS)
        qs = qs.filter(received_at__date__gte=window_start, received_at__date__lte=window_end)

    last_digits = _policy_last_digits(policy.policy_number)
    target_amount = policy.premium_amount

    candidates = []
    for msg in qs:
        amount = _extract_sms_amount(msg)
        amount_match = amount is not None and amount == target_amount
        digits_match = bool(last_digits) and last_digits in re.sub(r'\D', '', msg.body)

        if not amount_match and not digits_match:
            continue

        confidence = 'high' if (amount_match and digits_match) else 'low'
        candidates.append({
            'sms_id': msg.id,
            'sender': msg.sender,
            'body': msg.body,
            'received_at': msg.received_at.isoformat(),
            'matched_amount': str(amount) if amount is not None else None,
            'digits_matched': digits_match,
            'confidence': confidence,
        })

    candidates.sort(key=lambda c: (0 if c['confidence'] == 'high' else 1, c['received_at']))
    return candidates[:MAX_RESULTS]
