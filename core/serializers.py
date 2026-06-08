from rest_framework import serializers

from core.models import Household, IntegrationCredential, Member, UserProfile


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
            'relation_type', 'is_active', 'include_in_networth',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class UserProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    name = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ['id', 'email', 'name', 'google_picture', 'role', 'status', 'household', 'created_at']
        read_only_fields = ['id', 'email', 'name', 'google_picture', 'created_at']

    def get_name(self, obj):
        return obj.user.get_full_name() or obj.google_email


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
