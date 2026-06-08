from rest_framework import serializers

from valuations.models import ValuationSnapshot


class ValuationSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = ValuationSnapshot
        fields = [
            'id',
            'household',
            'valuation_date',
            'account',
            'instrument',
            'unit_price',
            'market_value',
            'balance',
            'source',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
