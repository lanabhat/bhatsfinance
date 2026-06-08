from rest_framework import serializers

from alerts.models import SIPMandate


class SIPMandateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SIPMandate
        fields = [
            'id',
            'household',
            'member',
            'account',
            'instrument',
            'expected_amount',
            'frequency',
            'due_day',
            'start_date',
            'end_date',
            'grace_days',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
