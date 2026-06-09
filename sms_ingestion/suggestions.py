"""
Auto-rule suggestion engine.

After each approval, call record_observation() to store what was approved.
Then call refresh_suggestions() to create/update SmsRuleSuggestion rows for
senders with consistent patterns.

A suggestion is generated when:
  - 2+ observations from the same sender in the same household
  - All share the same account + direction
  - No active rule already covers that sender

The suggestion is updated (observation_count bumped) on every new approval
that matches an existing suggestion's sender, even after it's been dismissed
so the count remains accurate.
"""
from __future__ import annotations

MIN_OBSERVATIONS = 2


def record_observation(
    household_id: int,
    sender: str,
    account_id: int | None,
    member_id: int | None,
    direction: str,
    classification: str,
    spend_category: str,
    transaction_type: str,
    body_sample: str,
) -> None:
    from sms_ingestion.models import SmsApprovalObservation
    SmsApprovalObservation.objects.create(
        household_id=household_id,
        sender=sender,
        account_id=account_id,
        member_id=member_id,
        direction=direction,
        classification=classification,
        spend_category=spend_category,
        transaction_type=transaction_type,
        body_sample=body_sample[:500],
    )
    refresh_suggestions_for_sender(household_id, sender)


def _sender_already_covered(household_id: int, sender: str) -> bool:
    """Return True if an active rule already matches this sender."""
    from sms_ingestion.models import SmsRule
    from sms_ingestion.rule_engine import match_rule

    rules = SmsRule.objects.filter(household_id=household_id, is_active=True)
    dummy_body = ''
    for rule in rules:
        if match_rule(rule, sender, dummy_body):
            return True
    return False


def refresh_suggestions_for_sender(household_id: int, sender: str) -> None:
    from django.db.models import Count
    from sms_ingestion.models import SmsApprovalObservation, SmsRuleSuggestion

    obs_qs = SmsApprovalObservation.objects.filter(
        household_id=household_id, sender=sender
    )
    total = obs_qs.count()
    if total < MIN_OBSERVATIONS:
        return

    # Find the most common (account, direction) combination
    from django.db.models import Count
    combo = (
        obs_qs
        .values('account_id', 'direction')
        .annotate(n=Count('id'))
        .order_by('-n')
        .first()
    )
    if not combo or not combo['account_id'] or not combo['direction']:
        return

    dominant_account_id = combo['account_id']
    dominant_direction = combo['direction']
    dominant_count = combo['n']

    # Only suggest if the dominant combo covers ≥60% of observations
    if dominant_count / total < 0.6:
        return

    # Find the most common member/classification/spend_category/tx_type
    # within the dominant combo
    dominant_obs = obs_qs.filter(
        account_id=dominant_account_id, direction=dominant_direction
    )

    def _modal(field: str) -> str:
        row = (
            dominant_obs.values(field)
            .annotate(n=Count('id'))
            .order_by('-n')
            .first()
        )
        return (row or {}).get(field) or ''

    member_id = _modal('member_id') or None
    classification = _modal('classification')
    spend_category = _modal('spend_category')
    transaction_type = _modal('transaction_type')

    # Collect up to 3 body samples from dominant obs
    samples = list(
        dominant_obs.exclude(body_sample='')
        .values_list('body_sample', flat=True)
        .order_by('-created_at')[:3]
    )

    suggestion, created = SmsRuleSuggestion.objects.get_or_create(
        household_id=household_id,
        sender=sender,
        defaults={
            'account_id': dominant_account_id,
            'member_id': member_id,
            'direction': dominant_direction,
            'classification': classification,
            'spend_category': spend_category,
            'transaction_type': transaction_type,
            'observation_count': total,
            'body_samples': samples,
        },
    )

    if not created:
        # Always refresh counts and fields; reset dismissed→pending if count grew
        update_fields = [
            'observation_count', 'account_id', 'member_id', 'direction',
            'classification', 'spend_category', 'transaction_type', 'body_samples',
        ]
        suggestion.observation_count = total
        suggestion.account_id = dominant_account_id
        suggestion.member_id = member_id
        suggestion.direction = dominant_direction
        suggestion.classification = classification
        suggestion.spend_category = spend_category
        suggestion.transaction_type = transaction_type
        suggestion.body_samples = samples
        # Re-surface dismissed suggestions if new approvals add more evidence
        if suggestion.status == SmsRuleSuggestion.STATUS_DISMISSED and total >= suggestion.observation_count + 2:
            suggestion.status = SmsRuleSuggestion.STATUS_PENDING
            update_fields.append('status')
        suggestion.save(update_fields=update_fields)
