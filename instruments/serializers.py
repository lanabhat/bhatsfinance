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
            'symbol',
            'metadata',
            'is_active',
            'include_in_rebalancing',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_unique_together_validators(self):
        # DRF auto-generates a UniqueTogetherValidator from the
        # unique_fd_account_number_per_household constraint with a generic
        # "fields must make a unique set" message; validate() below runs the
        # same check with a message that names the clashing instrument and
        # explains what to do instead, so drop the auto one to avoid a
        # confusing duplicate/conflicting error on the same submission.
        return [
            v for v in super().get_unique_together_validators()
            if getattr(v, 'fields', None) != ('household', 'symbol')
        ]

    def validate(self, attrs):
        instrument_type = attrs.get('instrument_type', getattr(self.instance, 'instrument_type', None))
        symbol = attrs.get('symbol', getattr(self.instance, 'symbol', ''))
        household = attrs.get('household', getattr(self.instance, 'household', None))

        if instrument_type == Instrument.InstrumentType.FD and symbol and household:
            qs = Instrument.objects.filter(household=household, instrument_type=Instrument.InstrumentType.FD, symbol=symbol)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            existing = qs.first()
            if existing:
                raise serializers.ValidationError({
                    'symbol': f'An FD with account number "{symbol}" already exists ("{existing.name}"). '
                              f'Add the new owner to that FD instead of creating a duplicate.',
                })

        return attrs


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


class BondDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BondDetails
        fields = [
            'id',
            'instrument',
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


class MutualFundDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = MutualFundDetails
        fields = [
            'id',
            'instrument',
            'amc',
            'fund_category',
            'fund_sub_category',
            'folio_no',
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
            'id', 'instrument', 'as_of_date', 'source_url', 'uploaded_file_name',
            'holding_count', 'holdings', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'holding_count', 'holdings', 'created_at', 'updated_at']

    def get_holding_count(self, obj):
        return obj.holdings.count()
