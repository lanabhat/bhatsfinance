"""Turn an incoming SMS into a ready-to-approve suggestion, with no user setup.

process_message() reads the SMS (extract.extract_sms), works out which household
account it's about from the account/card digits it mentions, who owns that
account, how to classify it, and — when the SMS states the balance — records a
balance reading for that account so account balances stay current. The user's
SmsRules are then applied on top as overrides.
"""
from __future__ import annotations

import re
from datetime import date

from sms_ingestion.extract import BANK_KEYWORDS, TRANSACTION_KINDS, extract_sms

# Counterparties that mean the debit bought an investment rather than spent money.
_INVESTMENT_PAYEE = re.compile(r'mutual fund|\bAMC\b|digital gold|clearing corporation|securities|\bNSE\b|\bBSE\b', re.I)

_KIND_DEFAULTS = {
    # kind: (transaction_type, classification)
    'debit': ('withdrawal', 'spend'),
    'credit': ('deposit', 'income'),
    'card_spend': ('withdrawal', 'spend'),
    'card_refund': ('deposit', 'income'),
    'cc_payment': ('cc_bill_payment', 'internal_transfer'),
    'cc_bill_paid': ('cc_bill_payment', 'internal_transfer'),
    'mf_purchase': ('buy', ''),
}


def _letters(s: str) -> str:
    return re.sub(r'[^a-z]', '', (s or '').lower())


def account_identifiers(account) -> set[str]:
    """Digits an SMS may use for this account: its saved SMS identifiers plus any
    4+ digit run in its name (e.g. "LN Federal (3422)")."""
    ids = {re.sub(r'\D', '', part) for part in (account.sms_identifiers or '').split(',')}
    ids |= set(re.findall(r'\d{4,}', account.name or ''))
    return {i for i in ids if len(i) >= 3}


def _digits_match(hint: str, identifier: str) -> bool:
    # SMS mask lengths vary ("XX374" vs "6374", "XXXXX914252" vs "4252").
    return identifier.endswith(hint) or hint.endswith(identifier[-4:])


_CARD_KINDS = ('card_spend', 'card_refund', 'cc_payment')


def _at_bank(account, sender_code: str) -> bool:
    keywords = BANK_KEYWORDS.get(sender_code, ())
    return any(k in f' {account.name} {account.institution_name}'.lower() for k in keywords)


def resolve_account(household_id: int, hint: str, sender_code: str = '', kind: str = ''):
    """The household account an SMS refers to, or None when it can't be pinned to
    exactly one. Matched on the account/card digits the SMS mentions (narrowed by
    bank when several share them); an SMS with no digits (e.g. Scapia card alerts)
    falls back to the only account of the right type at the sender's bank."""
    from instruments.models import Account

    accounts = list(Account.objects.filter(household_id=household_id, is_active=True))
    if hint:
        candidates = [a for a in accounts if any(_digits_match(hint, i) for i in account_identifiers(a))]
        if len(candidates) > 1:
            candidates = [a for a in candidates if _at_bank(a, sender_code)] or candidates
    elif kind and sender_code in BANK_KEYWORDS:
        wanted = ('credit_card',) if kind in _CARD_KINDS else ('bank',)
        candidates = [a for a in accounts if a.account_type in wanted and _at_bank(a, sender_code)]
    else:
        return None
    return candidates[0] if len(candidates) == 1 else None


def remember_identifier(account, hint: str) -> bool:
    """Add an SMS's account digits to the account the user approved it against,
    so the next SMS mentioning them is matched automatically."""
    if not hint or any(_digits_match(hint, i) for i in account_identifiers(account)):
        return False
    existing = [p.strip() for p in (account.sms_identifiers or '').split(',') if p.strip()]
    account.sms_identifiers = ', '.join(existing + [hint])[:200]
    account.save(update_fields=['sms_identifiers', 'updated_at'])
    return True


def _member_for_party(household_id: int, party: str):
    """A household member the counterparty names ("ANUSHREE L", "Mrs. ANUSHREEL")."""
    from core.models import Member

    p = _letters(party)
    if len(p) < 4:
        return None
    for member in Member.objects.filter(household_id=household_id):
        name = _letters(member.full_name)
        if name and (name == p or (len(p) >= 6 and (name.startswith(p) or p.startswith(name)))):
            return member
    return None


# Notes valuations.services.bulk_snapshot writes on the account copies it makes
# every day — derived values, not readings anyone took.
_AUTO_NOTES = ('Carried forward', 'Computed from')


def _is_auto(snapshot) -> bool:
    return (snapshot.notes or '').startswith(_AUTO_NOTES)


def record_sms_balance(msg, account, balance, on: date) -> int | None:
    """Record the balance an SMS states as a reading for that account. Returns the snapshot id.

    A real reading (statement, manual, or a later SMS) is never overridden. The
    daily job's own carried-forward/computed copies don't count as readings: one
    on the same day is replaced, and later ones are recomputed from this reading
    plus the transactions in between — otherwise they'd keep the stale value as
    the anchor every balance is rolled forward from."""
    from valuations.models import ValuationSnapshot

    if account.account_type == 'credit_card':
        return None  # card SMS state available limit, not a balance
    snaps = ValuationSnapshot.objects.filter(account=account)
    latest_real = next((sn for sn in snaps.order_by('-valuation_date', '-id') if not _is_auto(sn)), None)
    if latest_real and latest_real.valuation_date > on:
        return None
    note = f'From SMS: {msg.sender} (#{msg.pk})'

    if latest_real and latest_real.valuation_date == on:
        if not (latest_real.notes or '').startswith('From SMS'):
            return None  # the user's own reading for that day wins
        earlier = re.search(r'#(\d+)\)', latest_real.notes or '')
        if earlier:
            from sms_ingestion.models import SmsMessage
            prev = SmsMessage.objects.filter(pk=int(earlier.group(1))).values_list('received_at', flat=True).first()
            if prev and prev > msg.received_at:
                return None
        target = latest_real
    else:
        target = snaps.filter(valuation_date=on).order_by('-id').first()  # an auto copy, if any

    if target is not None:
        target.balance = balance
        target.notes = note
        target.save(update_fields=['balance', 'notes'])
    else:
        target = ValuationSnapshot.objects.create(
            household_id=account.household_id, account=account, balance=balance,
            valuation_date=on, source='api', notes=note,
        )
    _recompute_auto_after(account, balance, on)
    return target.pk


def _recompute_auto_after(account, balance, on: date) -> None:
    """Bring the daily job's copies dated after `on` in line with the new reading."""
    from django.db.models import Sum
    from ledger.models import Transaction
    from valuations.models import ValuationSnapshot

    for snap in ValuationSnapshot.objects.filter(account=account, valuation_date__gt=on).order_by('valuation_date', 'id'):
        if not _is_auto(snap):
            break  # a later real reading anchors everything after it
        txs = Transaction.objects.filter(account=account, affects_balance=True, tx_date__gt=on, tx_date__lte=snap.valuation_date)
        inflow = txs.filter(direction='inflow').aggregate(s=Sum('amount'))['s'] or 0
        outflow = txs.filter(direction='outflow').aggregate(s=Sum('amount'))['s'] or 0
        snap.balance = balance + inflow - outflow
        snap.save(update_fields=['balance'])


def build_parsed_tx(household_id: int, x: dict) -> dict:
    """The approval form's pre-filled values for an extracted SMS."""
    kind = x['kind']
    account = resolve_account(household_id, x['account_hint'], x['sender_code'], x['kind'])
    tx_type, classification = _KIND_DEFAULTS.get(kind, ('other', ''))
    party = x['counterparty']

    if kind == 'debit' and _INVESTMENT_PAYEE.search(party):
        kind, tx_type, classification = 'investment_debit', 'buy', ''
    elif kind in ('debit', 'credit'):
        own_account = resolve_account(household_id, x.get('to_account_hint', ''), '')
        if own_account is not None or _member_for_party(household_id, party) is not None:
            classification = 'internal_transfer'

    parsed = {
        'kind': kind,
        'amount': str(x['amount']) if x['amount'] is not None else '',
        'direction': x['direction'],
        'transaction_type': tx_type,
        'tx_date': x['tx_date'].isoformat(),
        'classification': classification,
        'spend_category': 'other' if classification == 'spend' else '',
        'merchant': party,
        'description': party,
        'external_reference': x['reference'],
        'account_hint': x['account_hint'],
        'currency': 'INR',
    }
    if account is not None:
        parsed['account'] = str(account.id)
        if account.primary_member_id:
            parsed['member'] = str(account.primary_member_id)
    if x['balance'] is not None:
        parsed['balance'] = str(x['balance'])
        parsed['balance_date'] = x['balance_date'].isoformat()
    return parsed


def process_message(msg, rules: list | None = None, record_balance: bool = True) -> dict:
    """Fill msg.raw_payload['parsed_tx'] (and template_key/confidence) from the SMS
    text, then apply the first matching user rule as overrides. Saves nothing on
    msg itself — callers save — but may record a balance reading."""
    from sms_ingestion.rule_engine import apply_rule, find_matching_rule

    x = extract_sms(msg.body, msg.sender, msg.received_at)
    parsed = build_parsed_tx(msg.household_id, x)
    raw_payload = dict(msg.raw_payload or {})
    raw_payload.pop('matched_rule_id', None)
    raw_payload.pop('matched_rule_name', None)

    rule = find_matching_rule(rules or [], msg.sender, msg.body)
    if rule:
        base = parsed
        parsed = apply_rule(rule, parsed, msg.body, msg.received_at)
        # What the message itself states beats a per-sender rule: one sender sends
        # both debits and credits, for several accounts.
        for field in ('direction', 'account', 'member'):
            if base.get(field) and (field != 'member' or base.get('account')):
                parsed[field] = base[field]
        raw_payload['matched_rule_id'] = rule.id
        raw_payload['matched_rule_name'] = rule.name
    parsed['sender'] = msg.sender

    if record_balance and parsed.get('account') and parsed.get('balance') and msg.pk:
        from decimal import Decimal
        from instruments.models import Account
        account = Account.objects.filter(pk=int(parsed['account']), household_id=msg.household_id).first()
        if account is not None:
            snap_id = record_sms_balance(msg, account, Decimal(parsed['balance']), date.fromisoformat(parsed['balance_date']))
            if snap_id:
                raw_payload['balance_snapshot_id'] = snap_id

    raw_payload['parsed_tx'] = parsed
    msg.raw_payload = raw_payload
    msg.template_key = parsed['kind']
    # Ready to approve as-is when the amount, direction and account are all known.
    complete = parsed['kind'] in TRANSACTION_KINDS + ('investment_debit',) and all(
        parsed.get(f) for f in ('amount', 'direction', 'account'))
    msg.confidence = 1.0 if complete else (0.5 if parsed['amount'] else 0.0)
    return parsed
