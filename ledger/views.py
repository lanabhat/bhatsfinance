from django.db import transaction as db_transaction
from rest_framework import serializers as drf_serializers, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from ledger.filters import TransactionFilter
from ledger.models import Transaction
from ledger.serializers import TransactionSerializer


MUTABLE_FIELDS = {'tx_date', 'member', 'spend_category', 'description', 'notes', 'classification'}


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.select_related('household', 'account', 'instrument', 'member').all().order_by('-tx_date', '-id')
    serializer_class = TransactionSerializer
    filterset_class = TransactionFilter

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        unknown = set(request.data.keys()) - MUTABLE_FIELDS
        if unknown:
            return Response({'detail': f'Fields not editable in-place: {", ".join(sorted(unknown))}'}, status=400)
        update_kwargs = {}
        if 'tx_date' in request.data:
            update_kwargs['tx_date'] = request.data['tx_date']
        if 'member' in request.data:
            update_kwargs['member_id'] = request.data['member']
        if 'spend_category' in request.data:
            update_kwargs['spend_category'] = request.data['spend_category']
        if 'description' in request.data:
            update_kwargs['description'] = request.data['description']
        if 'notes' in request.data:
            update_kwargs['notes'] = request.data['notes']
        if 'classification' in request.data:
            update_kwargs['classification'] = request.data['classification']
        Transaction.objects.filter(pk=instance.pk).update(**update_kwargs)
        instance.refresh_from_db()
        return Response(TransactionSerializer(instance).data)


class CashWithdrawalView(APIView):
    """Atomically create a bank withdrawal + cash deposit."""

    def post(self, request):
        data = request.data
        required = ['source_account', 'cash_account', 'amount', 'date', 'household']
        for field in required:
            if not data.get(field):
                raise drf_serializers.ValidationError({field: 'This field is required.'})

        from instruments.models import Account
        from core.models import Household
        try:
            household = Household.objects.get(pk=data['household'])
            source = Account.objects.get(pk=data['source_account'])
            cash = Account.objects.get(pk=data['cash_account'])
        except (Household.DoesNotExist, Account.DoesNotExist) as e:
            return Response({'error': str(e)}, status=400)

        import time
        ts = int(time.time() * 1000)
        reason = (data.get('reason') or '').strip()
        withdrawal_reference = f'Cash withdrawal to {cash.name}'
        deposit_reference = f'Cash received from {source.name}'
        if reason:
            withdrawal_reference = f'{withdrawal_reference} ({reason})'
            deposit_reference = f'{deposit_reference} ({reason})'

        with db_transaction.atomic():
            withdrawal = Transaction.objects.create(
                household=household,
                account=source,
                tx_date=data['date'],
                amount=data['amount'],
                direction=Transaction.Direction.OUTFLOW,
                transaction_type=Transaction.TransactionType.WITHDRAWAL,
                currency='INR',
                fees='0.00',
                taxes='0.00',
                external_reference=withdrawal_reference,
                idempotency_key=f'cashwd-out-{ts}',
                metadata={'cash_account_id': cash.pk, 'reason': reason} if reason else {'cash_account_id': cash.pk},
            )
            deposit = Transaction.objects.create(
                household=household,
                account=cash,
                tx_date=data['date'],
                amount=data['amount'],
                direction=Transaction.Direction.INFLOW,
                transaction_type=Transaction.TransactionType.DEPOSIT,
                currency='INR',
                fees='0.00',
                taxes='0.00',
                external_reference=deposit_reference,
                idempotency_key=f'cashwd-in-{ts}',
                metadata={'source_account_id': source.pk, 'reason': reason} if reason else {'source_account_id': source.pk},
            )

        return Response({
            'withdrawal_id': withdrawal.pk,
            'deposit_id': deposit.pk,
            'amount': str(data['amount']),
        }, status=201)
