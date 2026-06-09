from datetime import datetime, timezone as dt_timezone

from django.utils.dateparse import parse_datetime
from rest_framework import serializers

from sms_ingestion.categorization import categorize
from sms_ingestion.models import SmsApiKey, SmsMessage, SmsRule, SmsRuleSuggestion


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
    parsed_tx = serializers.SerializerMethodField()

    class Meta:
        model = SmsMessage
        fields = [
            'id', 'household', 'owner', 'sender', 'body', 'received_at',
            'status', 'template_key', 'confidence', 'parsed_tx',
            'imported_transaction_id', 'created_at', 'categories',
        ]
        read_only_fields = fields

    def get_categories(self, obj):
        return categorize(obj.body)

    def get_parsed_tx(self, obj):
        return (obj.raw_payload or {}).get('parsed_tx') or {}


class SmsRuleSerializer(serializers.ModelSerializer):
    account_name = serializers.SerializerMethodField()
    member_name = serializers.SerializerMethodField()

    class Meta:
        model = SmsRule
        fields = [
            'id', 'household', 'name', 'is_active', 'priority', 'conditions',
            'account', 'account_name', 'member', 'member_name',
            'direction', 'transaction_type', 'classification', 'spend_category',
            'amount_regex', 'merchant_regex', 'reference_regex', 'notes_regex',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'account_name', 'member_name']

    def get_account_name(self, obj):
        return obj.account.name if obj.account_id else ''

    def get_member_name(self, obj):
        return obj.member.full_name if obj.member_id else ''


class SmsRuleSuggestionSerializer(serializers.ModelSerializer):
    account_name = serializers.SerializerMethodField()
    member_name = serializers.SerializerMethodField()

    class Meta:
        model = SmsRuleSuggestion
        fields = [
            'id', 'household', 'sender', 'observation_count', 'status',
            'account', 'account_name', 'member', 'member_name',
            'direction', 'classification', 'spend_category', 'transaction_type',
            'body_samples', 'created_at',
        ]
        read_only_fields = ['id', 'household', 'sender', 'observation_count',
                            'account_name', 'member_name', 'body_samples', 'created_at']

    def get_account_name(self, obj):
        return obj.account.name if obj.account_id else ''

    def get_member_name(self, obj):
        return obj.member.full_name if obj.member_id else ''
