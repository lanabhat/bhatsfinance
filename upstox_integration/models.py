from django.conf import settings
from django.db import models

from core.fields import EncryptedTextField


class UpstoxCredential(models.Model):
    """
    Stores Upstox OAuth2 tokens for a user.
    Tokens are stored server-side only; the frontend never sees them.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='upstox_credentials',
    )
    member = models.ForeignKey(
        'core.Member',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='upstox_credentials',
        help_text='Household member whose Upstox account this is',
    )
    upstox_user_id = models.CharField(max_length=100, blank=True)
    email = models.CharField(max_length=255, blank=True)
    label = models.CharField(max_length=100, blank=True)
    access_token = EncryptedTextField(blank=True)
    refresh_token = EncryptedTextField(blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Upstox: {self.label or self.email or self.upstox_user_id}'
