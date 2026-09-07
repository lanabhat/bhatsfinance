from rest_framework import serializers

from ai_insights.models import FundClassification, FundReturnsComparison, RebalancingExplanation


class FundClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = FundClassification
        fields = ['id', 'instrument', 'bucket', 'rule_60_40_category', 'reasoning', 'model_used', 'generated_at']
        read_only_fields = fields


class FundReturnsComparisonSerializer(serializers.ModelSerializer):
    class Meta:
        model = FundReturnsComparison
        fields = ['id', 'instrument', 'summary', 'input_snapshot', 'model_used', 'generated_at']
        read_only_fields = fields


class RebalancingExplanationSerializer(serializers.ModelSerializer):
    class Meta:
        model = RebalancingExplanation
        fields = ['id', 'household', 'as_of_date', 'explanation', 'input_snapshot', 'model_used', 'generated_at']
        read_only_fields = fields
