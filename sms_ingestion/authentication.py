from django.utils import timezone
from rest_framework import authentication, exceptions

from sms_ingestion.models import SmsApiKey


class SmsApiKeyAuthentication(authentication.BaseAuthentication):
    """
    Authenticates Android SMS-forwarder devices via a static bearer token.

    Expects: Authorization: Bearer <token>

    On success, request.user is None (no Django user — these are device
    credentials, not user accounts) and request.auth is the resolved
    SmsApiKey, which carries the household the message should be staged under.
    """

    keyword = 'Bearer'

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode('utf-8')
        if not header:
            return None

        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            return None

        token = parts[1]
        try:
            api_key = SmsApiKey.objects.select_related('household').get(token=token, is_active=True)
        except SmsApiKey.DoesNotExist:
            raise exceptions.AuthenticationFailed('Invalid or inactive API key.')

        SmsApiKey.objects.filter(pk=api_key.pk).update(last_used_at=timezone.now())
        return (None, api_key)

    def authenticate_header(self, request):
        return self.keyword
