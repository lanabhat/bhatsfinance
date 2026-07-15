from django.db import transaction as db_transaction
from rest_framework import serializers as drf_serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from ledger.filters import TransactionFilter
from ledger.models import Tag, Transaction
from ledger.serializers import TagSerializer, TransactionSerializer


MUTABLE_FIELDS = {'tx_date', 'member', 'spend_category', 'description', 'notes', 'classification', 'tags'}
# Bulk edits only ever need to touch classification (the primary use case: mass
# reclassifying imported rows as internal_transfer/tracking/etc.) — narrower than
# single-row edits so a bad filter can't accidentally overwrite dates/notes for
# hundreds of rows at once.
BULK_MUTABLE_FIELDS = {'classification', 'spend_category'}
BULK_UPDATE_LIMIT = 500


class TagViewSet(viewsets.ModelViewSet):
    serializer_class = TagSerializer
    filterset_fields = ['household']

    def get_queryset(self):
        hid = self.request.query_params.get('household')
        if hid:
            return Tag.objects.filter(household_id=hid)
        if self.action in ('retrieve', 'update', 'partial_update', 'destroy'):
            return Tag.objects.all()
        return Tag.objects.none()

    @action(detail=False, methods=['post'], url_path='cleanup')
    def cleanup(self, request):
        """
        Delete every currently-unused tag for a household — a manual sweep
        for stale tags that predate the auto-delete-on-unused signals (see
        ledger/signals.py), or any that slipped through some other way.
        """
        household_id = request.data.get('household') or request.query_params.get('household')
        if not household_id:
            return Response({'detail': 'household is required'}, status=400)
        unused = Tag.objects.filter(household_id=household_id, transactions__isnull=True)
        deleted_count, _ = unused.delete()
        return Response({'deleted': deleted_count})


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.select_related('household', 'account', 'instrument', 'member').prefetch_related('tags').all().order_by('-tx_date', '-id')
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
        if update_kwargs:
            Transaction.objects.filter(pk=instance.pk).update(**update_kwargs)
        if 'tags' in request.data:
            instance.tags.set(request.data['tags'])
        instance.refresh_from_db()
        return Response(TransactionSerializer(instance).data)

    @action(detail=False, methods=['post'], url_path='bulk-update')
    def bulk_update(self, request, *args, **kwargs):
        """Apply the same field values to a set of transactions by id.

        Body: {"ids": [1,2,3], "household": 1, "classification": "internal_transfer"}
        `ids` must be explicit (selected client-side from an already-filtered list) —
        this endpoint never re-derives the target set from filter params itself, so
        a stale/wrong filter can't silently expand to unintended rows.
        """
        ids = request.data.get('ids')
        household_id = request.data.get('household')
        if not isinstance(ids, list) or not ids:
            return Response({'detail': 'ids must be a non-empty list.'}, status=400)
        if not household_id:
            return Response({'detail': 'household is required.'}, status=400)
        if len(ids) > BULK_UPDATE_LIMIT:
            return Response({'detail': f'Cannot update more than {BULK_UPDATE_LIMIT} transactions at once.'}, status=400)

        fields = request.data.get('fields')
        if not isinstance(fields, dict) or not fields:
            return Response({'detail': 'fields must be a non-empty object.'}, status=400)
        unknown = set(fields.keys()) - BULK_MUTABLE_FIELDS
        if unknown:
            return Response({'detail': f'Fields not editable in bulk: {", ".join(sorted(unknown))}'}, status=400)

        qs = Transaction.objects.filter(household_id=household_id, pk__in=ids)
        matched_ids = set(qs.values_list('pk', flat=True))
        missing = set(ids) - matched_ids
        if missing:
            return Response({'detail': f'Transactions not found in this household: {sorted(missing)}'}, status=400)

        updated = qs.update(**fields)
        return Response({'updated': updated})


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
