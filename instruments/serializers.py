from rest_framework import serializers

from instruments.models import (
    Account,
    AccountOwnership,
    AllocationTarget,
    AssetCategory,
    BondDetails,
    FDDetails,
    FundHolding,
    FundHoldingsSnapshot,
    Instrument,
    InstrumentOwnership,
    Investment,
    MutualFundDetails,
)


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
            'sub_category',
            'symbol',
            'metadata',
            'is_active',
            'include_in_rebalancing',
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
            'funding_transaction',
            'account_number',
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

    def validate(self, attrs):
        account_number = attrs.get('account_number', getattr(self.instance, 'account_number', ''))
        instrument = attrs.get('instrument', getattr(self.instance, 'instrument', None))

        if account_number and instrument:
            qs = FDDetails.objects.filter(instrument__household=instrument.household, account_number=account_number)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            existing = qs.select_related('instrument').first()
            if existing:
                raise serializers.ValidationError({
                    'account_number': f'An FD with account number "{account_number}" already exists under '
                                       f'"{existing.instrument.name}". Add the new owner to that deposit instead '
                                       f'of creating a duplicate.',
                })

        return attrs


class BondDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BondDetails
        fields = [
            'id',
            'instrument',
            'funding_transaction',
            'issuer_name',
            'bond_type',
            'isin',
            'face_value',
            'quantity',
            'coupon_rate',
            'coupon_frequency',
            'investment_date',
            'maturity_date',
            'first_coupon_date',
            'grace_days',
            'maturity_value',
            'credit_rating',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class InstrumentOwnershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstrumentOwnership
        fields = ['id', 'instrument', 'member', 'allocation_percent', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class InvestmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Investment
        fields = [
            'id', 'instrument', 'member', 'name', 'symbol', 'isin', 'folio_no',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class MutualFundDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = MutualFundDetails
        fields = [
            'id',
            'investment',
            'amc',
            'fund_category',
            'fund_sub_category',
            'expense_ratio',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AllocationTargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = AllocationTarget
        fields = ['id', 'household', 'asset_category', 'target_percent', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class FundHoldingSerializer(serializers.ModelSerializer):
    class Meta:
        model = FundHolding
        fields = ['id', 'isin', 'instrument_name', 'industry', 'weight_percent']
        read_only_fields = ['id']


class FundHoldingsSnapshotSerializer(serializers.ModelSerializer):
    holdings = FundHoldingSerializer(many=True, read_only=True)
    holding_count = serializers.SerializerMethodField()

    class Meta:
        model = FundHoldingsSnapshot
        fields = [
            'id', 'investment', 'as_of_date', 'source_url', 'uploaded_file_name',
            'holding_count', 'holdings', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'holding_count', 'holdings', 'created_at', 'updated_at']

    def get_holding_count(self, obj):
        return obj.holdings.count()
