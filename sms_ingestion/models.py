import secrets

from django.db import models

from core.models import TimeStampedModel


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


class SmsApiKey(TimeStampedModel):
    """
    Static bearer token issued to a single Android device.

    Authenticates "this request comes from a trusted phone belonging to this
    household" — it intentionally does NOT identify which household member the
    forwarded SMS belongs to, since one phone number can receive transaction
    alerts for multiple members' accounts (e.g. a joint number used for both a
    Groww and an Upstox account). That attribution happens later, at approval
    time, same as the Gmail staging flow.
    """
    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='sms_api_keys')
    label = models.CharField(max_length=100, blank=True, help_text='Friendly name, e.g. "Dad\'s Phone"')
    token = models.CharField(max_length=64, unique=True, default=_generate_token, editable=False)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f'{self.label or "SMS device"} ({self.household.name})'


class SmsRule(TimeStampedModel):
    """
    User-defined rule that matches incoming SMS messages and pre-populates
    the parsed_tx suggestion with mapped field values.  Rules are evaluated
    in priority order at ingest time; first match wins and overrides the
    generic template-detection result.
    """
    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='sms_rules')
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    priority = models.IntegerField(default=0, help_text='Lower value = evaluated first')

    # Condition tree stored as JSON — see rule_engine.py for schema docs
    conditions = models.JSONField(default=dict, blank=True)

    # Mapped output fields — blank means "don't override the template default"
    account = models.ForeignKey('instruments.Account', on_delete=models.SET_NULL, null=True, blank=True)
    member = models.ForeignKey('core.Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='sms_rules')
    direction = models.CharField(max_length=10, blank=True)
    transaction_type = models.CharField(max_length=30, blank=True)
    classification = models.CharField(max_length=20, blank=True)
    spend_category = models.CharField(max_length=30, blank=True)

    # Regex extractors — must use a named group (?P<value>...) for the captured value
    amount_regex = models.CharField(max_length=300, blank=True)
    merchant_regex = models.CharField(max_length=300, blank=True)
    reference_regex = models.CharField(max_length=300, blank=True)
    notes_regex = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ['priority', 'created_at']

    def __str__(self) -> str:
        return f'{self.name} ({"on" if self.is_active else "off"})'


class SmsApprovalObservation(TimeStampedModel):
    """
    One record per approved SMS — captures which sender was mapped to which
    account/member/direction/classification.  The suggestion engine reads these
    to propose rules for senders with consistent patterns.
    """
    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='sms_observations')
    sender = models.CharField(max_length=64, db_index=True)
    account = models.ForeignKey('instruments.Account', on_delete=models.SET_NULL, null=True, blank=True)
    member = models.ForeignKey('core.Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='sms_observations')
    direction = models.CharField(max_length=10, blank=True)
    classification = models.CharField(max_length=20, blank=True)
    spend_category = models.CharField(max_length=30, blank=True)
    transaction_type = models.CharField(max_length=30, blank=True)
    body_sample = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.sender} → {self.account} ({self.direction})'


class SmsRuleSuggestion(TimeStampedModel):
    """
    Auto-generated rule proposal derived from consistent approval observations.
    Created when 2+ approvals from the same sender share the same
    account/direction/classification.  Dismissed by the user or auto-deleted
    when a covering rule is created.
    """
    STATUS_PENDING = 'pending'
    STATUS_DISMISSED = 'dismissed'
    STATUS_ACCEPTED = 'accepted'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_DISMISSED, 'Dismissed'),
        (STATUS_ACCEPTED, 'Accepted'),
    ]

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='sms_suggestions')
    sender = models.CharField(max_length=64)
    observation_count = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)

    # Proposed rule fields — mirrors SmsRule mapped fields
    account = models.ForeignKey('instruments.Account', on_delete=models.SET_NULL, null=True, blank=True)
    member = models.ForeignKey('core.Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='sms_suggestions')
    direction = models.CharField(max_length=10, blank=True)
    classification = models.CharField(max_length=20, blank=True)
    spend_category = models.CharField(max_length=30, blank=True)
    transaction_type = models.CharField(max_length=30, blank=True)
    body_samples = models.JSONField(default=list, blank=True)

    class Meta:
        unique_together = ('household', 'sender')
        ordering = ['-observation_count', '-created_at']

    def __str__(self) -> str:
        return f'Suggestion: {self.sender} ({self.observation_count} obs)'


class SmsMessage(TimeStampedModel):
    """
    Raw SMS forwarded from an Android device, staged for later review and
    conversion into a ledger Transaction — mirrors GmailProcessedMessage.
    """
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='sms_messages')
    api_key = models.ForeignKey(SmsApiKey, on_delete=models.SET_NULL, null=True, blank=True, related_name='messages')

    # Owner is intentionally nullable — cannot be determined from the phone/sender
    # alone (one number may carry SMS for several members' accounts). Resolved by
    # the user during approval, same as Gmail staged transactions.
    owner = models.ForeignKey('core.Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='sms_messages')

    sender = models.CharField(max_length=64)
    body = models.TextField()
    received_at = models.DateTimeField()
    raw_payload = models.JSONField(default=dict, blank=True)

    # App-supplied device identifier (e.g. Android ANDROID_ID), sent by the
    # forwarding app independently of the bearer token — lets a single API
    # key be shared across several phones and still tell messages apart in
    # the UI, and disambiguates two devices forwarding an identical SMS
    # (see unique_together below). Blank for messages ingested before the
    # app started sending it, or if the user leaves the Settings field empty.
    device_id = models.CharField(max_length=100, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    template_key = models.CharField(max_length=60, blank=True)
    confidence = models.FloatField(null=True, blank=True)
    imported_transaction_id = models.IntegerField(null=True, blank=True)

    class Meta:
        unique_together = ('household', 'sender', 'received_at', 'body', 'device_id')
        indexes = [
            models.Index(fields=['household', 'status']),
        ]
        ordering = ['-received_at']

    def __str__(self) -> str:
        return f'{self.sender} @ {self.received_at} ({self.status})'
