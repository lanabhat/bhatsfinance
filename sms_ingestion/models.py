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

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    template_key = models.CharField(max_length=60, blank=True)
    confidence = models.FloatField(null=True, blank=True)
    imported_transaction_id = models.IntegerField(null=True, blank=True)

    class Meta:
        unique_together = ('household', 'sender', 'received_at', 'body')
        indexes = [
            models.Index(fields=['household', 'status']),
        ]
        ordering = ['-received_at']

    def __str__(self) -> str:
        return f'{self.sender} @ {self.received_at} ({self.status})'
