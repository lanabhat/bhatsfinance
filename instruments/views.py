from datetime import date, timedelta

from django.db.models import Sum
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from instruments.models import Account, AccountOwnership, AssetCategory, FDDetails, Instrument, InstrumentOwnership
from instruments.serializers import (
    AccountOwnershipSerializer,
    AccountSerializer,
    AssetCategorySerializer,
    FDDetailsSerializer,
    InstrumentOwnershipSerializer,
    InstrumentSerializer,
)


class AssetCategoryViewSet(viewsets.ModelViewSet):
    queryset = AssetCategory.objects.prefetch_related('instruments').all()
    serializer_class = AssetCategorySerializer
    filterset_fields = ['household']


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.select_related('household', 'primary_member').all()
    serializer_class = AccountSerializer
    filterset_fields = ['household', 'account_type', 'is_active', 'primary_member']


class AccountOwnershipViewSet(viewsets.ModelViewSet):
    serializer_class = AccountOwnershipSerializer
    filterset_fields = ['account', 'member']

    def get_queryset(self):
        qs = AccountOwnership.objects.select_related('account', 'member').all()
        household_id = self.request.query_params.get('household')
        if household_id:
            qs = qs.filter(account__household_id=household_id)
        account_id = self.request.query_params.get('account')
        if account_id:
            qs = qs.filter(account_id=account_id)
        return qs


class InstrumentViewSet(viewsets.ModelViewSet):
    queryset = Instrument.objects.select_related('household', 'default_account').all()
    serializer_class = InstrumentSerializer
    filterset_fields = ['household', 'instrument_type', 'is_active']


class InstrumentOwnershipViewSet(viewsets.ModelViewSet):
    queryset = InstrumentOwnership.objects.select_related('instrument', 'member').all()
    serializer_class = InstrumentOwnershipSerializer
    filterset_fields = ['instrument', 'member']

class FDDetailsViewSet(viewsets.ModelViewSet):
    queryset = FDDetails.objects.select_related('instrument').all()
    serializer_class = FDDetailsSerializer
    filterset_fields = ['instrument']

class AccountBalanceView(APIView):
    """Compute current balance / credit card outstanding for a single account."""

    def get(self, request, pk):
        try:
            account = Account.objects.get(pk=pk)
        except Account.DoesNotExist:
            return Response({'error': 'Account not found'}, status=404)

        from ledger.models import Transaction
        txs = Transaction.objects.filter(account=account)
        total_inflow = txs.filter(direction=Transaction.Direction.INFLOW).aggregate(s=Sum('amount'))['s'] or 0
        total_outflow = txs.filter(direction=Transaction.Direction.OUTFLOW).aggregate(s=Sum('amount'))['s'] or 0

        opening = float(account.opening_balance)
        current_balance = opening + float(total_inflow) - float(total_outflow)

        data = {
            'account_id': account.pk,
            'account_name': account.name,
            'account_type': account.account_type,
            'opening_balance': opening,
            'total_inflow': float(total_inflow),
            'total_outflow': float(total_outflow),
            'current_balance': current_balance,
        }

        if account.account_type == Account.AccountType.CREDIT_CARD:
            credit_limit = float(account.credit_limit) if account.credit_limit else 0
            outstanding = float(total_outflow) - float(total_inflow)
            available = credit_limit - outstanding if credit_limit else None
            data.update({
                'credit_limit': credit_limit,
                'outstanding': outstanding,
                'available': available,
                'statement_due_day': account.statement_due_day,
            })

        return Response(data)


class MaturingFDsView(APIView):
    """Return FDs/RDs/etc. with maturity_date within the next `days` window."""

    def get(self, request):
        from valuations.services import _compute_fd_value

        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        days = int(request.query_params.get('days', 180))
        today = date.today()
        cutoff = today + timedelta(days=days)

        qs = FDDetails.objects.select_related('instrument').filter(
            instrument__household_id=int(household_id),
            instrument__is_active=True,
            maturity_date__gte=today,
            maturity_date__lte=cutoff,
        ).order_by('maturity_date')

        rows = []
        for fd in qs:
            current_value = _compute_fd_value(fd, today)
            maturity_value = fd.maturity_value if fd.maturity_value is not None else _compute_fd_value(fd, fd.maturity_date)
            total_tenure_days = max((fd.maturity_date - fd.investment_date).days, 1)
            days_remaining = max((fd.maturity_date - today).days, 0)
            elapsed_days = total_tenure_days - days_remaining
            rows.append({
                'instrument_id': fd.instrument_id,
                'instrument_name': fd.instrument.name,
                'instrument_type': fd.instrument.instrument_type,
                'principal': str(fd.principal),
                'annual_rate': str(fd.annual_rate),
                'investment_date': fd.investment_date.isoformat(),
                'maturity_date': fd.maturity_date.isoformat(),
                'days_remaining': days_remaining,
                'total_tenure_days': total_tenure_days,
                'elapsed_days': elapsed_days,
                'current_value': str(current_value),
                'maturity_value': str(maturity_value),
            })

        return Response({'maturing': rows, 'as_of': today.isoformat(), 'window_days': days})
