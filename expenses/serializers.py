from rest_framework import serializers

from .models import ExpenseCategory


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ['id', 'household', 'key', 'label', 'icon', 'is_builtin']
        read_only_fields = ['id', 'is_builtin']
