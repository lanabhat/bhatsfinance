from rest_framework import serializers

from tax.models import TaxProjection, TaxRecord


class TaxRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRecord
        fields = [
            'id',
            'household',
            'member',
            'transaction_date',
            'financial_year',
            'record_type',
            'amount',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TaxProjectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxProjection
        fields = [
            'id',
            'household',
            'member',
            'financial_year',
            'projected_total_income',
            'declared_deductions',
            'projected_tax',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
