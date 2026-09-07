from rest_framework import serializers

from fund_data.models import ExternalFund


class ExternalFundSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExternalFund
        fields = ['id', 'instrument', 'mfapi_scheme_code', 'scheme_name', 'fund_house', 'last_synced_at', 'created_at', 'updated_at']
        read_only_fields = ['id', 'last_synced_at', 'created_at', 'updated_at']
