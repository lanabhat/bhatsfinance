from django.conf import settings
from django.db import models

from core.fields import EncryptedTextField


class GoogleCredential(models.Model):
    """
    Stores Google OAuth tokens for a user.
    One user can connect multiple Google accounts (personal, spouse, etc.).
    Tokens are stored server-side only; the frontend never sees them.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='google_credentials')
    email = models.CharField(max_length=255, blank=True, help_text="Google account email, populated after OAuth")
    label = models.CharField(max_length=100, blank=True, help_text="User-friendly label, defaults to email")
    refresh_token = EncryptedTextField(blank=True)
    access_token = EncryptedTextField(blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    scope = models.TextField(blank=True)
    token_type = models.CharField(max_length=50, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class GmailSyncConfig(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='gmail_sync_configs')
    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='gmail_sync_configs')
    enabled = models.BooleanField(default=True)
    query_override = models.TextField(blank=True)
    # List of rules: [{ "sender": "alerts@bank.com" | "@bank.com", "account_id": 123 }]
    account_rules = models.JSONField(default=list, blank=True)
    excluded_recipients = models.JSONField(default=list, blank=True)
    excluded_senders = models.JSONField(default=list, blank=True)
    custom_templates = models.JSONField(default=dict, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'household')


class GmailProcessedMessage(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_VALUATION_ONLY = 'valuation_only'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_VALUATION_ONLY, 'Valuation Only'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='gmail_processed_messages')
    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='gmail_processed_messages')
    message_id = models.CharField(max_length=200)
    thread_id = models.CharField(max_length=200, blank=True)
    internal_date_ms = models.BigIntegerField(null=True, blank=True)
    imported_transaction_id = models.IntegerField(null=True, blank=True)
    imported_valuation_id = models.IntegerField(null=True, blank=True)
    raw = models.JSONField(default=dict, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    confidence = models.FloatField(null=True, blank=True)
    template_key = models.CharField(max_length=60, blank=True)
    suggestions = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'household', 'message_id')
        indexes = [
            models.Index(fields=['user', 'household', 'message_id']),
        ]
