from rest_framework import serializers

from instruments.models import Account
from ledger.models import Transaction

_DIRECTION_MAP = {
    Transaction.TransactionType.BUY: Transaction.Direction.OUTFLOW,
    Transaction.TransactionType.WITHDRAWAL: Transaction.Direction.OUTFLOW,
    Transaction.TransactionType.EMI: Transaction.Direction.OUTFLOW,
    Transaction.TransactionType.TAX_PAYMENT: Transaction.Direction.OUTFLOW,
    Transaction.TransactionType.PREMIUM: Transaction.Direction.OUTFLOW,
    Transaction.TransactionType.SELL: Transaction.Direction.INFLOW,
    Transaction.TransactionType.DEPOSIT: Transaction.Direction.INFLOW,
    Transaction.TransactionType.DIVIDEND: Transaction.Direction.INFLOW,
    Transaction.TransactionType.INTEREST: Transaction.Direction.INFLOW,
    Transaction.TransactionType.SALARY: Transaction.Direction.INFLOW,
    Transaction.TransactionType.TAX_REFUND: Transaction.Direction.INFLOW,
    Transaction.TransactionType.LOAN_DISBURSAL: Transaction.Direction.INFLOW,
}


class TransactionSerializer(serializers.ModelSerializer):
    account = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.all(),
        required=False,
        allow_null=True,
    )
    for_members = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id',
            'household',
            'member',
            'account',
            'instrument',
            'tx_date',
            'amount',
            'quantity',
            'price_per_unit',
            'fees',
            'taxes',
            'currency',
            'direction',
            'transaction_type',
            'source',
            'external_reference',
            'idempotency_key',
            'metadata',
            'classification',
            'spend_category',
            'description',
            'for_members',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'idempotency_key': {'required': False, 'allow_blank': True},
            'external_reference': {'required': False, 'allow_blank': True},
        }

    def validate(self, attrs):
        tx_type = attrs.get('transaction_type')
        if tx_type in _DIRECTION_MAP:
            attrs['direction'] = _DIRECTION_MAP[tx_type]
        return attrs
