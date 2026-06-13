from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from ledger.models import Transaction as LedgerTransaction
from .models import ExpenseCategory
from .serializers import ExpenseCategorySerializer


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseCategorySerializer
    filterset_fields = ['household']

    def get_queryset(self):
        hid = self.request.query_params.get('household')
        if hid:
            return ExpenseCategory.objects.filter(household_id=hid)
        # Detail actions (retrieve/update/delete) use pk — return all so get_object() can find by pk
        if self.action in ('retrieve', 'update', 'partial_update', 'destroy'):
            return ExpenseCategory.objects.all()
        return ExpenseCategory.objects.none()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_builtin:
            return Response({'detail': 'Built-in categories cannot be deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        reassign_to = request.data.get('reassign_to')
        if not reassign_to:
            return Response({'detail': 'reassign_to is required.'}, status=status.HTTP_400_BAD_REQUEST)
        target = get_object_or_404(ExpenseCategory, household=instance.household, key=reassign_to)
        if target.pk == instance.pk:
            return Response({'detail': 'reassign_to must be a different category.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            LedgerTransaction.objects.filter(
                household=instance.household,
                classification=LedgerTransaction.Classification.SPEND,
                spend_category=instance.key,
            ).update(spend_category=target.key)
            instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UnmappedExpensesView(APIView):
    def get(self, request):
        hid = request.query_params.get('household_id')
        if not hid:
            return Response({'detail': 'household_id required'}, status=status.HTTP_400_BAD_REQUEST)
        valid_keys = list(ExpenseCategory.objects.filter(household_id=hid).values_list('key', flat=True))
        qs = LedgerTransaction.objects.filter(
            household_id=hid,
            classification=LedgerTransaction.Classification.SPEND,
        ).exclude(spend_category__in=valid_keys)
        items = list(qs.values('id', 'tx_date', 'amount', 'spend_category', 'description'))
        return Response({'count': len(items), 'expenses': items})
