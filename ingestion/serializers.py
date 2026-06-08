from rest_framework import serializers


class CSVImportRequestSerializer(serializers.Serializer):
    household_id = serializers.IntegerField()
    filename = serializers.CharField(required=False, allow_blank=True)
    csv_content = serializers.CharField(required=False)
    rows = serializers.ListField(child=serializers.DictField(), required=False)

    def validate(self, attrs):
        if not attrs.get('csv_content') and not attrs.get('rows'):
            raise serializers.ValidationError('Provide either csv_content or rows.')
        return attrs
