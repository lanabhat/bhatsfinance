from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from instruments.holdings_parser import HoldingsParseError, parse_holdings_workbook
from instruments.models import (
    Account,
    AccountOwnership,
    AllocationTarget,
    AssetCategory,
    BondCouponAck,
    BondDetails,
    FDDetails,
    FundHolding,
    FundHoldingsSnapshot,
    Instrument,
    InstrumentOwnership,
    MutualFundDetails,
)
from instruments.serializers import (
    AccountOwnershipSerializer,
    AccountSerializer,
    AllocationTargetSerializer,
    AssetCategorySerializer,
    BondDetailsSerializer,
    FDDetailsSerializer,
    FundHoldingsSnapshotSerializer,
    InstrumentOwnershipSerializer,
    InstrumentSerializer,
    MutualFundDetailsSerializer,
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


class BulkDeleteInstrumentsView(APIView):
    """Delete all instruments of specified types for a household. Cascades to transactions and valuations."""

    def delete(self, request):
        from rest_framework import status as http_status
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id is required.'}, status=http_status.HTTP_400_BAD_REQUEST)
        types = request.query_params.getlist('instrument_type')
        qs = Instrument.objects.filter(household_id=int(household_id))
        if types:
            qs = qs.filter(instrument_type__in=types)
        count, _ = qs.delete()
        return Response({'deleted': count})


class BulkUpdateInstrumentCategoryView(APIView):
    """Assign (or clear) asset_category for N instruments in a single call."""

    def patch(self, request):
        from rest_framework import status as http_status
        instrument_ids = request.data.get('instrument_ids')
        if not instrument_ids:
            return Response({'detail': 'instrument_ids is required.'}, status=http_status.HTTP_400_BAD_REQUEST)
        asset_category_id = request.data.get('asset_category')
        count = Instrument.objects.filter(id__in=instrument_ids).update(asset_category_id=asset_category_id)
        return Response({'updated': count})


class InstrumentOwnershipViewSet(viewsets.ModelViewSet):
    queryset = InstrumentOwnership.objects.select_related('instrument', 'member').all()
    serializer_class = InstrumentOwnershipSerializer
    filterset_fields = ['instrument', 'member']

class FDDetailsViewSet(viewsets.ModelViewSet):
    queryset = FDDetails.objects.select_related('instrument').all()
    serializer_class = FDDetailsSerializer
    filterset_fields = ['instrument']


class BondDetailsViewSet(viewsets.ModelViewSet):
    queryset = BondDetails.objects.select_related('instrument').all()
    serializer_class = BondDetailsSerializer
    filterset_fields = ['instrument']

    @action(detail=True, methods=['post'], url_path='mark-coupon-received')
    def mark_coupon_received(self, request, pk=None):
        from ledger.models import Transaction

        bond = self.get_object()
        payload = request.data
        try:
            due_date = date.fromisoformat(payload['due_date'])
        except (KeyError, ValueError):
            return Response({'detail': 'due_date (YYYY-MM-DD) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        received_on = date.fromisoformat(payload['received_on']) if payload.get('received_on') else date.today()
        deduct = bool(payload.get('deduct', True))

        if not deduct:
            ack, created = BondCouponAck.objects.get_or_create(
                bond=bond,
                due_date=due_date,
                defaults={'acknowledged_on': received_on, 'note': payload.get('note', '')},
            )
            return Response(
                {'ack_id': ack.id, 'cleared_due_date': due_date.isoformat(), 'mode': 'ack', 'created': created},
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )

        from instruments.services import coupon_amount

        account_id = payload.get('account_id') or bond.instrument.default_account_id
        if not account_id:
            return Response({'detail': 'account_id is required when recording a transaction.'}, status=status.HTTP_400_BAD_REQUEST)
        amount = Decimal(str(payload.get('amount') or coupon_amount(bond)))

        try:
            tx = Transaction.objects.create(
                household_id=bond.instrument.household_id,
                account_id=int(account_id),
                instrument_id=bond.instrument_id,
                tx_date=received_on,
                amount=amount,
                direction=Transaction.Direction.INFLOW,
                transaction_type=Transaction.TransactionType.INTEREST,
                source=Transaction.SourceType.MANUAL,
                external_reference=f'Bond coupon for {bond.instrument.name} due {due_date}',
                idempotency_key=f'bond-coupon-{bond.id}-{due_date.isoformat()}',
                metadata={'bond_details_id': bond.id, 'coupon_due_date': due_date.isoformat()},
            )
        except DjangoValidationError as e:
            return Response({'detail': e.message_dict if hasattr(e, 'message_dict') else str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {'transaction_id': tx.id, 'cleared_due_date': due_date.isoformat(), 'mode': 'transaction'},
            status=status.HTTP_201_CREATED,
        )


class MutualFundDetailsViewSet(viewsets.ModelViewSet):
    queryset = MutualFundDetails.objects.select_related('instrument').all()
    serializer_class = MutualFundDetailsSerializer
    filterset_fields = ['instrument']


class AllocationTargetViewSet(viewsets.ModelViewSet):
    queryset = AllocationTarget.objects.select_related('asset_category').all()
    serializer_class = AllocationTargetSerializer
    filterset_fields = ['household', 'asset_category']


class FundHoldingsSnapshotViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FundHoldingsSnapshot.objects.prefetch_related('holdings').all()
    serializer_class = FundHoldingsSnapshotSerializer
    filterset_fields = ['instrument']


class UploadFundHoldingsView(APIView):
    """Parse an uploaded AMC monthly portfolio disclosure .xlsx for one instrument
    and store it as a FundHoldingsSnapshot + child FundHolding rows (replacing any
    existing snapshot for the same as_of_date)."""

    parser_classes = [MultiPartParser]

    def post(self, request, pk):
        try:
            instrument = Instrument.objects.get(pk=pk)
        except Instrument.DoesNotExist:
            return Response({'detail': 'Instrument not found.'}, status=status.HTTP_404_NOT_FOUND)

        uploaded_file = request.data.get('file')
        if not uploaded_file:
            return Response({'detail': 'file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        as_of_date = request.data.get('as_of_date') or date.today().isoformat()
        source_url = request.data.get('source_url', '')

        try:
            holdings = parse_holdings_workbook(uploaded_file.read())
        except HoldingsParseError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        FundHoldingsSnapshot.objects.filter(instrument=instrument, as_of_date=as_of_date).delete()
        snapshot = FundHoldingsSnapshot.objects.create(
            instrument=instrument,
            as_of_date=as_of_date,
            source_url=source_url,
            uploaded_file_name=uploaded_file.name,
        )
        FundHolding.objects.bulk_create([
            FundHolding(snapshot=snapshot, **h) for h in holdings
        ])

        return Response(FundHoldingsSnapshotSerializer(snapshot).data, status=status.HTTP_201_CREATED)


class AccountBalanceView(APIView):
    """Compute current balance / credit card outstanding for a single account."""

    def get(self, request, pk):
        from instruments.services import compute_account_balance

        try:
            account = Account.objects.get(pk=pk)
        except Account.DoesNotExist:
            return Response({'error': 'Account not found'}, status=404)

        balance = compute_account_balance(account)

        data = {
            'account_id': account.pk,
            'account_name': account.name,
            'account_type': account.account_type,
            'opening_balance': float(account.opening_balance),
            'anchor_balance': balance['anchor_balance_float'],
            'anchor_date': balance['anchor_date'].isoformat() if balance['anchor_date'] else None,
            'total_inflow': balance['total_inflow_float'],
            'total_outflow': balance['total_outflow_float'],
            'current_balance': balance['current_balance_float'],
        }

        if account.account_type == Account.AccountType.CREDIT_CARD:
            credit_limit = float(account.credit_limit) if account.credit_limit else 0
            outstanding = balance['total_outflow_float'] - balance['total_inflow_float']
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

        qs = FDDetails.objects.select_related('instrument').prefetch_related('instrument__ownerships__member').filter(
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
            owners = [
                {'member_id': o.member_id, 'member_name': o.member.full_name, 'allocation_percent': str(o.allocation_percent)}
                for o in fd.instrument.ownerships.all()
            ]
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
                'owners': owners,
            })

        return Response({'maturing': rows, 'as_of': today.isoformat(), 'window_days': days})


class MaturingBondsView(APIView):
    """Return bonds with maturity_date within the next `days` window."""

    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        days = int(request.query_params.get('days', 180))
        today = date.today()
        cutoff = today + timedelta(days=days)

        qs = BondDetails.objects.select_related('instrument').prefetch_related('instrument__ownerships__member').filter(
            instrument__household_id=int(household_id),
            instrument__is_active=True,
            maturity_date__gte=today,
            maturity_date__lte=cutoff,
        ).order_by('maturity_date')

        rows = []
        for bond in qs:
            days_remaining = max((bond.maturity_date - today).days, 0)
            total_tenure_days = max((bond.maturity_date - bond.investment_date).days, 1)
            elapsed_days = total_tenure_days - days_remaining
            owners = [
                {'member_id': o.member_id, 'member_name': o.member.full_name, 'allocation_percent': str(o.allocation_percent)}
                for o in bond.instrument.ownerships.all()
            ]
            rows.append({
                'instrument_id': bond.instrument_id,
                'instrument_name': bond.instrument.name,
                'instrument_type': bond.instrument.instrument_type,
                'issuer_name': bond.issuer_name,
                'face_value': str(bond.face_value),
                'quantity': bond.quantity,
                'coupon_rate': str(bond.coupon_rate),
                'investment_date': bond.investment_date.isoformat(),
                'maturity_date': bond.maturity_date.isoformat(),
                'days_remaining': days_remaining,
                'total_tenure_days': total_tenure_days,
                'elapsed_days': elapsed_days,
                'maturity_value': str(bond.maturity_value) if bond.maturity_value is not None else str(bond.face_value * bond.quantity),
                'owners': owners,
            })

        return Response({'maturing': rows, 'as_of': today.isoformat(), 'window_days': days})
