from rest_framework import serializers

from instruments.models import Account, AccountOwnership, AssetCategory, FDDetails, Instrument, InstrumentOwnership


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = [
            'id',
            'household',
            'name',
            'account_type',
            'institution_name',
            'primary_member',
            'opening_balance',
            'credit_limit',
            'statement_due_day',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AccountOwnershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountOwnership
        fields = ['id', 'account', 'member', 'allocation_percent', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class AssetCategorySerializer(serializers.ModelSerializer):
    instrument_count = serializers.SerializerMethodField()

    class Meta:
        model = AssetCategory
        fields = ['id', 'household', 'name', 'color', 'icon_name', 'sort_order',
                  'instrument_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'instrument_count', 'created_at', 'updated_at']

    def get_instrument_count(self, obj):
        return obj.instruments.filter(is_active=True).count()


class InstrumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Instrument
        fields = [
            'id',
            'household',
            'asset_category',
            'default_account',
            'name',
            'instrument_type',
            'symbol',
            'metadata',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class FDDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = FDDetails
        fields = [
            'id',
            'instrument',
            'principal',
            'annual_rate',
            'investment_date',
            'maturity_date',
            'compounding',
            'maturity_value',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class InstrumentOwnershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstrumentOwnership
        fields = ['id', 'instrument', 'member', 'allocation_percent', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
