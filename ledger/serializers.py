from decimal import Decimal

from rest_framework import serializers

from instruments.models import Account
from ledger.models import Tag, Transaction

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


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'household', 'name', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_name(self, value):
        # Tags are displayed with a '#' prefix in the UI but stored without
        # one — strip any leading '#' a client sends so "#groceries" and
        # "groceries" always resolve to the same tag.
        return value.strip().lstrip('#').strip()


class TransactionSerializer(serializers.ModelSerializer):
    account = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.all(),
        required=False,
        allow_null=True,
    )
    for_members = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    tags = serializers.PrimaryKeyRelatedField(many=True, queryset=Tag.objects.all(), required=False)

    class Meta:
        model = Transaction
        fields = [
            'id',
            'household',
            'member',
            'account',
            'instrument',
            'investment',
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
            'affects_balance',
            'spend_category',
            'description',
            'for_members',
            'tags',
            'notes',
            'realized_gain',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'realized_gain', 'created_at', 'updated_at']
        extra_kwargs = {
            'idempotency_key': {'required': False, 'allow_blank': True, 'default': ''},
            'external_reference': {'required': False, 'allow_blank': True, 'default': ''},
        }

    def validate(self, attrs):
        tx_type = attrs.get('transaction_type')
        if tx_type in _DIRECTION_MAP:
            attrs['direction'] = _DIRECTION_MAP[tx_type]

        # realized_gain is computed here, not client-supplied, so it can't
        # drift from the holding's actual state — average cost per unit
        # (net_invested / quantity) as of just before this sale, times units
        # sold, subtracted from sale proceeds. This is a create-only
        # serializer (Transaction is immutable — see Transaction.save()), so
        # "as of tx_date" here always reflects state prior to this row since
        # it doesn't exist in the DB yet.
        if tx_type == Transaction.TransactionType.SELL and attrs.get('instrument') and attrs.get('quantity'):
            from insights.services import compute_holding_cost_basis
            instrument = attrs['instrument']
            investment = attrs.get('investment')
            quantity, net_invested = compute_holding_cost_basis(
                household_id=attrs['household'].id,
                instrument_id=instrument.id,
                investment_id=investment.id if investment else None,
                as_of=attrs['tx_date'],
            )
            if quantity > 0:
                avg_cost_per_unit = net_invested / quantity
                attrs['realized_gain'] = (attrs['amount'] - avg_cost_per_unit * attrs['quantity']).quantize(Decimal('0.01'))

        return attrs
