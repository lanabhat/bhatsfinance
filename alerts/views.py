from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from alerts.models import SIPMandate, SIPPaymentAck
from alerts.serializers import SIPMandateSerializer
from alerts.services import generate_missed_sip_alerts
from ledger.models import Transaction


class SIPMandateViewSet(viewsets.ModelViewSet):
    queryset = SIPMandate.objects.select_related('household', 'member', 'account', 'instrument').all()
    serializer_class = SIPMandateSerializer
    filterset_fields = ['household', 'member', 'account', 'instrument', 'is_active']

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        mandate = self.get_object()
        payload = request.data
        try:
            due_date = date.fromisoformat(payload['due_date'])
        except (KeyError, ValueError):
            return Response({'detail': 'due_date (YYYY-MM-DD) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        paid_on = date.fromisoformat(payload['paid_on']) if payload.get('paid_on') else date.today()
        deduct = bool(payload.get('deduct', True))

        if not deduct:
            ack, created = SIPPaymentAck.objects.get_or_create(
                mandate=mandate,
                due_date=due_date,
                defaults={'acknowledged_on': paid_on, 'note': payload.get('note', '')},
            )
            return Response(
                {'ack_id': ack.id, 'cleared_due_date': due_date.isoformat(), 'mode': 'ack', 'created': created},
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )

        account_id = int(payload.get('account_id') or mandate.account_id)
        amount = Decimal(str(payload.get('amount') or mandate.expected_amount))
        update_holding = bool(payload.get('update_holding', True))
        quantity = (
            Decimal(str(payload['quantity']))
            if update_holding and payload.get('quantity') not in (None, '')
            else None
        )

        try:
            tx = Transaction.objects.create(
                household_id=mandate.household_id,
                member_id=mandate.member_id,
                account_id=account_id,
                instrument_id=mandate.instrument_id,
                tx_date=paid_on,
                amount=amount,
                quantity=quantity,
                direction=Transaction.Direction.OUTFLOW,
                transaction_type=Transaction.TransactionType.BUY,
                source=Transaction.SourceType.MANUAL,
                external_reference=f'SIP payment for mandate #{mandate.id} due {due_date}',
                idempotency_key=f'sip-paid-{mandate.id}-{due_date.isoformat()}',
                metadata={'sip_mandate_id': mandate.id, 'sip_due_date': due_date.isoformat()},
            )
        except ValidationError as e:
            return Response({'detail': e.message_dict if hasattr(e, 'message_dict') else str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {'transaction_id': tx.id, 'cleared_due_date': due_date.isoformat(), 'mode': 'transaction'},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], url_path='mark-all-paid')
    def mark_all_paid(self, request):
        """Bulk-mark a list of missed SIPs as paid. Each item must include
        mandate_id and due_date. Top-level options apply to every item:
        - deduct (bool, default True): when False, records acknowledgements only
          (no transactions, no networth impact).
        - paid_on (YYYY-MM-DD, default today)
        - account_id (optional global override; falls back to each mandate's account)
        - update_holding (bool, default True): when deduct=True, controls whether
          the BUY transaction carries quantity (always null in bulk — quantities
          differ per holding and aren't supplied here).
        Returns per-item results."""
        items = request.data.get('items') or []
        if not isinstance(items, list) or not items:
            return Response({'detail': 'items must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)

        deduct = bool(request.data.get('deduct', True))
        update_holding = bool(request.data.get('update_holding', True))
        paid_on = (
            date.fromisoformat(request.data['paid_on'])
            if request.data.get('paid_on') else date.today()
        )
        global_account_id = request.data.get('account_id')

        results = []
        for item in items:
            try:
                mandate_id = int(item['mandate_id'])
                due_date = date.fromisoformat(item['due_date'])
            except (KeyError, TypeError, ValueError):
                results.append({'item': item, 'ok': False, 'error': 'mandate_id and due_date are required.'})
                continue
            try:
                mandate = SIPMandate.objects.get(pk=mandate_id)
            except SIPMandate.DoesNotExist:
                results.append({'item': item, 'ok': False, 'error': 'mandate not found.'})
                continue

            if not deduct:
                ack, created = SIPPaymentAck.objects.get_or_create(
                    mandate=mandate,
                    due_date=due_date,
                    defaults={'acknowledged_on': paid_on, 'note': item.get('note', '')},
                )
                results.append({
                    'mandate_id': mandate_id, 'due_date': due_date.isoformat(),
                    'ok': True, 'mode': 'ack', 'ack_id': ack.id, 'created': created,
                })
                continue

            account_id = int(item.get('account_id') or global_account_id or mandate.account_id)
            amount = Decimal(str(item.get('amount') or mandate.expected_amount))
            try:
                tx = Transaction.objects.create(
                    household_id=mandate.household_id,
                    member_id=mandate.member_id,
                    account_id=account_id,
                    instrument_id=mandate.instrument_id,
                    tx_date=paid_on,
                    amount=amount,
                    quantity=None,  # bulk: quantity per-row not supported; user can edit individually if needed
                    direction=Transaction.Direction.OUTFLOW,
                    transaction_type=Transaction.TransactionType.BUY,
                    source=Transaction.SourceType.MANUAL,
                    external_reference=f'SIP payment for mandate #{mandate.id} due {due_date}',
                    idempotency_key=f'sip-paid-{mandate.id}-{due_date.isoformat()}',
                    metadata={
                        'sip_mandate_id': mandate.id,
                        'sip_due_date': due_date.isoformat(),
                        'bulk': True,
                        'update_holding': update_holding,
                    },
                )
                results.append({
                    'mandate_id': mandate_id, 'due_date': due_date.isoformat(),
                    'ok': True, 'mode': 'transaction', 'transaction_id': tx.id,
                })
            except ValidationError as e:
                results.append({
                    'mandate_id': mandate_id, 'due_date': due_date.isoformat(),
                    'ok': False, 'error': e.message_dict if hasattr(e, 'message_dict') else str(e),
                })

        ok_count = sum(1 for r in results if r.get('ok'))
        return Response(
            {'processed': len(results), 'succeeded': ok_count, 'results': results},
            status=status.HTTP_200_OK,
        )


class MissedSIPAlertsView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of_str = request.query_params.get('as_of')
        as_of = date.fromisoformat(as_of_str) if as_of_str else date.today()
        data = generate_missed_sip_alerts(household_id=int(household_id), as_of=as_of)
        return Response({'as_of': as_of, 'missed': data})

# Create your views here.
