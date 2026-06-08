from datetime import datetime, timezone as dt_timezone

from django.utils.dateparse import parse_datetime
from rest_framework import serializers

from sms_ingestion.categorization import categorize
from sms_ingestion.models import SmsApiKey, SmsMessage


def _mask_token(token: str) -> str:
    if len(token) <= 8:
        return '••••'
    return f'{token[:4]}••••{token[-4:]}'


class SmsApiKeySerializer(serializers.ModelSerializer):
    """
    The full token is included only in the response to the create request
    (see SmsApiKeyViewSet.create) — every other read returns a masked value
    so the secret isn't re-exposed once issued.
    """
    token = serializers.SerializerMethodField()

    class Meta:
        model = SmsApiKey
        fields = ['id', 'household', 'label', 'token', 'is_active', 'last_used_at', 'created_at']
        read_only_fields = ['id', 'token', 'last_used_at', 'created_at']

    def get_token(self, obj):
        return _mask_token(obj.token)


class SmsIngestSerializer(serializers.Serializer):
    """
    Validates the inbound payload from the Android forwarder app.

    `timestamp` accepts either epoch milliseconds (Android's
    SmsMessage.getTimestampMillis(), the common case) or an ISO-8601 string.
    """
    sender = serializers.CharField(max_length=64)
    body = serializers.CharField(allow_blank=True)
    timestamp = serializers.CharField()

    def validate_timestamp(self, value):
        value = value.strip()
        if value.isdigit():
            millis = int(value)
            return datetime.fromtimestamp(millis / 1000, tz=dt_timezone.utc)
        parsed = parse_datetime(value)
        if parsed is None:
            raise serializers.ValidationError('timestamp must be epoch milliseconds or an ISO-8601 datetime string.')
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt_timezone.utc)
        return parsed


class SmsMessageSerializer(serializers.ModelSerializer):
    categories = serializers.SerializerMethodField()

    class Meta:
        model = SmsMessage
        fields = [
            'id', 'household', 'owner', 'sender', 'body', 'received_at',
            'status', 'imported_transaction_id', 'created_at', 'categories',
        ]
        read_only_fields = fields

    def get_categories(self, obj):
        return categorize(obj.body)
