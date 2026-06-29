import csv
from datetime import date
from decimal import Decimal
from io import StringIO

from django.core.exceptions import ValidationError
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from insurance.models import InsurancePolicy, InsurancePremiumAck, VehicleClaim
from insurance.serializers import InsurancePolicySerializer, VehicleClaimSerializer
from insurance.services import generate_missed_premium_reminders
from ledger.models import Transaction


class InsurancePolicyViewSet(viewsets.ModelViewSet):
    queryset = InsurancePolicy.objects.select_related('household', 'member', 'account', 'vehicle_instrument').prefetch_related('covered_members', 'vehicle_claims').all()
    serializer_class = InsurancePolicySerializer
    filterset_fields = ['household', 'member', 'policy_type', 'is_active', 'is_employer_paid']

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        policy = self.get_object()
        payload = request.data

        try:
            due_date = date.fromisoformat(payload['due_date'])
        except (KeyError, ValueError):
            return Response({'detail': 'due_date (YYYY-MM-DD) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        paid_on = date.fromisoformat(payload['paid_on']) if payload.get('paid_on') else date.today()
        deduct = bool(payload.get('deduct', True))

        if not deduct:
            ack, created = InsurancePremiumAck.objects.get_or_create(
                policy=policy,
                due_date=due_date,
                defaults={'acknowledged_on': paid_on, 'note': payload.get('note', '')},
            )
            return Response(
                {'ack_id': ack.id, 'cleared_due_date': due_date.isoformat(), 'mode': 'ack', 'created': created},
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )

        account_id = payload.get('account_id') or (policy.account_id if policy.account_id else None)
        if not account_id:
            return Response({'detail': 'account_id is required when deduct=true and no account is linked to the policy.'}, status=status.HTTP_400_BAD_REQUEST)
        account_id = int(account_id)
        amount = Decimal(str(payload.get('amount') or policy.premium_amount or 0))

        try:
            tx = Transaction.objects.create(
                household_id=policy.household_id,
                member_id=policy.member_id,
                account_id=account_id,
                tx_date=paid_on,
                amount=amount,
                direction=Transaction.Direction.OUTFLOW,
                transaction_type=Transaction.TransactionType.PREMIUM,
                source=Transaction.SourceType.MANUAL,
                external_reference=f'Insurance premium for policy #{policy.id} due {due_date}',
                idempotency_key=f'insurance-premium-{policy.id}-{due_date.isoformat()}',
                metadata={'insurance_policy_id': policy.id, 'due_date': due_date.isoformat()},
            )
        except ValidationError as e:
            return Response({'detail': e.message_dict if hasattr(e, 'message_dict') else str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {'transaction_id': tx.id, 'cleared_due_date': due_date.isoformat(), 'mode': 'transaction'},
            status=status.HTTP_201_CREATED,
        )


    @action(detail=False, methods=['get'], url_path='export')
    def export_csv(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        policies = (
            InsurancePolicy.objects
            .filter(household_id=int(household_id))
            .select_related('member', 'account')
            .prefetch_related('covered_members')
            .order_by('policy_type', 'policy_name')
        )

        columns = [
            'policy_name', 'policy_type', 'policy_subtype', 'policy_number', 'insurer_name',
            'member_name', 'nominee_name', 'nominee_relation',
            'sum_insured', 'premium_amount', 'premium_frequency',
            'premium_due_day', 'premium_due_month', 'grace_days',
            'start_date', 'maturity_date', 'end_date',
            'is_active', 'is_employer_paid',
            'account_name',
            'is_family_floater', 'covered_members',
            'vehicle_type', 'coverage_type', 'idv_amount', 'ncb_percent', 'add_on_covers',
            'notes',
        ]

        buf = StringIO()
        writer = csv.DictWriter(buf, fieldnames=columns)
        writer.writeheader()

        for p in policies:
            writer.writerow({
                'policy_name': p.policy_name,
                'policy_type': p.policy_type,
                'policy_subtype': p.policy_subtype,
                'policy_number': p.policy_number,
                'insurer_name': p.insurer_name,
                'member_name': p.member.full_name if p.member else '',
                'nominee_name': p.nominee_name,
                'nominee_relation': p.nominee_relation,
                'sum_insured': p.sum_insured or '',
                'premium_amount': p.premium_amount or '',
                'premium_frequency': p.premium_frequency,
                'premium_due_day': p.premium_due_day or '',
                'premium_due_month': p.premium_due_month or '',
                'grace_days': p.grace_days,
                'start_date': p.start_date,
                'maturity_date': p.maturity_date or '',
                'end_date': p.end_date or '',
                'is_active': p.is_active,
                'is_employer_paid': p.is_employer_paid,
                'account_name': p.account.name if p.account else '',
                'is_family_floater': p.is_family_floater,
                'covered_members': ';'.join(m.full_name for m in p.covered_members.all()),
                'vehicle_type': p.vehicle_type,
                'coverage_type': p.coverage_type,
                'idv_amount': p.idv_amount or '',
                'ncb_percent': p.ncb_percent or '',
                'add_on_covers': p.add_on_covers,
                'notes': p.notes,
            })

        response = HttpResponse(buf.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="insurance_policies.csv"'
        return response


class VehicleClaimViewSet(viewsets.ModelViewSet):
    queryset = VehicleClaim.objects.select_related('policy').all()
    serializer_class = VehicleClaimSerializer
    filterset_fields = ['policy', 'status']


class MissedPremiumRemindersView(APIView):
    def get(self, request):
        household_id = request.query_params.get('household_id')
        if not household_id:
            return Response({'detail': 'household_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        as_of_str = request.query_params.get('as_of')
        as_of = date.fromisoformat(as_of_str) if as_of_str else date.today()
        data = generate_missed_premium_reminders(household_id=int(household_id), as_of=as_of)
        return Response({'as_of': as_of, 'missed': data})
