from rest_framework import serializers

from insurance.models import InsurancePolicy, InsurancePremiumAck, VehicleClaim


class VehicleClaimSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleClaim
        fields = ['id', 'policy', 'claim_date', 'description', 'claim_amount', 'status', 'settled_amount', 'notes', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class InsurancePolicySerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField()
    account_name = serializers.SerializerMethodField()
    covered_member_names = serializers.SerializerMethodField()
    vehicle_claims = VehicleClaimSerializer(many=True, read_only=True)

    class Meta:
        model = InsurancePolicy
        fields = [
            'id', 'household', 'member', 'member_name',
            'nominee_name', 'nominee_relation',
            'policy_type', 'policy_subtype', 'policy_name', 'policy_number', 'insurer_name',
            'sum_insured', 'premium_amount', 'premium_frequency', 'premium_due_day', 'premium_due_month',
            'start_date', 'maturity_date', 'end_date', 'grace_days',
            'is_active', 'is_employer_paid',
            'account', 'account_name', 'notes',
            'is_family_floater', 'covered_members', 'covered_member_names',
            'vehicle_instrument', 'vehicle_type', 'coverage_type',
            'idv_amount', 'ncb_percent', 'add_on_covers',
            'vehicle_claims',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'member_name', 'account_name', 'covered_member_names', 'vehicle_claims', 'created_at', 'updated_at']

    def validate_vehicle_type(self, value):
        return value or ''

    def validate_coverage_type(self, value):
        return value or ''

    def get_member_name(self, obj):
        return obj.member.full_name if obj.member else None

    def get_account_name(self, obj):
        return obj.account.name if obj.account else None

    def get_covered_member_names(self, obj):
        return list(obj.covered_members.values_list('full_name', flat=True))


class InsurancePremiumAckSerializer(serializers.ModelSerializer):
    class Meta:
        model = InsurancePremiumAck
        fields = ['id', 'policy', 'due_date', 'acknowledged_on', 'note', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
