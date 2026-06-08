from rest_framework.permissions import BasePermission

from sms_ingestion.models import SmsApiKey


class HasSmsApiKey(BasePermission):
    """Grants access only when SmsApiKeyAuthentication resolved a valid, active key."""

    def has_permission(self, request, view):
        return isinstance(request.auth, SmsApiKey)
