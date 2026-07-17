import re

from rest_framework import serializers

from core.models import Household, IntegrationCredential, Member, UserProfile

# Data URI photos are stored inline in the DB (no media storage configured), so cap
# the encoded size to keep rows small — 2MB of base64 is roughly a 1.5MB image.
MAX_PHOTO_DATA_URI_LENGTH = 2 * 1024 * 1024
PHOTO_DATA_URI_RE = re.compile(r'^data:image/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$')


def validate_photo_data_uri(value):
    if not value:
        return value
    if len(value) > MAX_PHOTO_DATA_URI_LENGTH:
        raise serializers.ValidationError('Photo is too large (max ~1.5MB).')
    if not PHOTO_DATA_URI_RE.match(value):
        raise serializers.ValidationError('Photo must be a base64 data URI (png, jpg, or webp).')
    return value


class HouseholdSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = ['id', 'name', 'base_currency', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class MemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Member
        fields = [
            'id', 'household', 'full_name', 'email',
            'relation_type', 'is_active', 'include_in_networth', 'photo',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_photo(self, value):
        return validate_photo_data_uri(value)


class UserProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    name = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ['id', 'email', 'name', 'google_picture', 'photo', 'role', 'status', 'household', 'created_at']
        read_only_fields = ['id', 'email', 'name', 'google_picture', 'created_at']

    def get_name(self, obj):
        return obj.user.get_full_name() or obj.google_email

    def validate_photo(self, value):
        return validate_photo_data_uri(value)


class IntegrationCredentialSerializer(serializers.ModelSerializer):
    # Do not expose decrypted value back to the client.
    value = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_value = serializers.SerializerMethodField()

    class Meta:
        model = IntegrationCredential
        fields = ['id', 'key', 'scope', 'household', 'user', 'description', 'has_value', 'value', 'created_at', 'updated_at']
        read_only_fields = ['id', 'has_value', 'created_at', 'updated_at']

    def get_has_value(self, obj):
        return bool(obj.value)

    def validate(self, attrs):
        # For updates, include existing instance values.
        scope = attrs.get('scope') or (self.instance.scope if self.instance else IntegrationCredential.Scope.GLOBAL)
        household = attrs.get('household') if 'household' in attrs else (self.instance.household if self.instance else None)
        user = attrs.get('user') if 'user' in attrs else (self.instance.user if self.instance else None)

        if scope == IntegrationCredential.Scope.GLOBAL:
            if household is not None or user is not None:
                raise serializers.ValidationError('Global credentials cannot be scoped to a household or user.')
        if scope == IntegrationCredential.Scope.HOUSEHOLD:
            if household is None or user is not None:
                raise serializers.ValidationError('Household credentials require household and cannot have user.')
        if scope == IntegrationCredential.Scope.USER:
            if user is None:
                raise serializers.ValidationError('User credentials require user.')
        return attrs
