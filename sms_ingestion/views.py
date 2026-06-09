from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsApprovedUser
from sms_ingestion.authentication import SmsApiKeyAuthentication
from sms_ingestion.categorization import CATEGORY_PATTERNS
from sms_ingestion.models import SmsApiKey, SmsMessage
from sms_ingestion.permissions import HasSmsApiKey
from sms_ingestion.serializers import SmsApiKeySerializer, SmsIngestSerializer, SmsMessageSerializer
from sms_ingestion.templates import SMS_TEMPLATES, build_parsed_tx


class SmsApiKeyViewSet(viewsets.ModelViewSet):
    """
    Manage SMS-forwarder device credentials (admin/super_admin write access,
    via IsApprovedUser). The plaintext token is exposed only in the response
    to `create` — every other read returns it masked.
    """
    serializer_class = SmsApiKeySerializer
    permission_classes = [IsApprovedUser]
    filterset_fields = ['household']
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        hid = self.request.query_params.get('household')
        if hid:
            return SmsApiKey.objects.filter(household_id=hid)
        if self.action in ('retrieve', 'update', 'partial_update', 'destroy'):
            return SmsApiKey.objects.all()
        return SmsApiKey.objects.none()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        payload = serializer.data
        payload['token'] = instance.token  # plaintext — shown once, only here
        headers = self.get_success_headers(serializer.data)
        return Response(payload, status=status.HTTP_201_CREATED, headers=headers)


class SmsMessageViewSet(viewsets.ModelViewSet):
    """
    Browse staged SMS messages — search, filter by sender/status/date range,
    and filter by auto-detected category (see sms_ingestion.categorization).

    Read-only by design except for delete: messages are staged for review by
    the ingest pipeline, not edited by hand — but stale/junk messages can be
    individually or bulk-removed (see `bulk_delete`).
    """
    serializer_class = SmsMessageSerializer
    permission_classes = [IsApprovedUser]
    http_method_names = ['get', 'delete', 'post', 'head', 'options']

    def filtered_queryset(self):
        hid = self.request.query_params.get('household')
        if not hid:
            return SmsMessage.objects.none()
        qs = SmsMessage.objects.filter(household_id=hid)

        msg_status = self.request.query_params.get('status')
        if msg_status and msg_status != 'all':
            qs = qs.filter(status=msg_status)

        sender = self.request.query_params.get('sender')
        if sender:
            qs = qs.filter(sender__icontains=sender)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(body__icontains=search) | Q(sender__icontains=search))

        received_after = self.request.query_params.get('received_after')
        if received_after:
            qs = qs.filter(received_at__gte=received_after)
        received_before = self.request.query_params.get('received_before')
        if received_before:
            qs = qs.filter(received_at__lte=received_before)

        category = self.request.query_params.get('category')
        if category and category in CATEGORY_PATTERNS:
            qs = qs.filter(body__iregex=CATEGORY_PATTERNS[category])

        return qs

    def get_queryset(self):
        # Detail actions (retrieve/destroy) don't send ?household= — fall back to
        # the user's active household so get_object() can find the record.
        if self.action in ('retrieve', 'destroy', 'update', 'partial_update'):
            profile = getattr(self.request.user, 'profile', None)
            hid = profile.household_id if profile else None
            if hid:
                return SmsMessage.objects.filter(household_id=hid)
            return SmsMessage.objects.none()
        qs = self.filtered_queryset()
        ordering = self.request.query_params.get('ordering', '-received_at')
        if ordering.lstrip('-') in ('received_at', 'sender', 'created_at'):
            qs = qs.order_by(ordering)
        return qs

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        """
        Delete many messages at once.

        Body: either `{"ids": [1, 2, 3]}` to delete specific messages, or
        `{"all_matching_filters": true, ...same query params as the list view...}`
        to delete every message matching the current filter set (used for
        "delete all rejected", "delete all in this search", etc).
        """
        ids = request.data.get('ids')
        if ids:
            if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
                return Response({'detail': '"ids" must be a list of integers.'}, status=status.HTTP_400_BAD_REQUEST)
            hid = request.query_params.get('household') or request.data.get('household')
            qs = SmsMessage.objects.filter(id__in=ids)
            if hid:
                qs = qs.filter(household_id=hid)
        elif request.data.get('all_matching_filters'):
            qs = self.filtered_queryset()
        else:
            return Response(
                {'detail': 'Provide either "ids" (list of message ids) or "all_matching_filters": true.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted_count, _ = qs.delete()
        return Response({'deleted': deleted_count})


class SmsIngestView(APIView):
    """
    Receives a single forwarded SMS from an Android device.

    POST /api/sms/ingest
    Authorization: Bearer <device token>
    Body: { "sender": "...", "timestamp": <epoch millis | ISO-8601>, "body": "..." }

    Stages the message for later review/approval — does not create a
    Transaction directly, since the owning household member can't be
    determined from the phone/sender alone.
    """
    authentication_classes = [SmsApiKeyAuthentication]
    permission_classes = [HasSmsApiKey]

    def post(self, request):
        serializer = SmsIngestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        api_key = request.auth
        detected = build_parsed_tx(data['body'], data['sender'], data['timestamp'])
        raw_payload = dict(request.data)
        raw_payload['parsed_tx'] = detected['parsed_tx']
        msg, created = SmsMessage.objects.get_or_create(
            household=api_key.household,
            sender=data['sender'],
            received_at=data['timestamp'],
            body=data['body'],
            defaults={
                'api_key': api_key,
                'raw_payload': raw_payload,
                'template_key': detected['template_key'],
                'confidence': detected['confidence'],
            },
        )

        return Response(
            SmsMessageSerializer(msg).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Staged-message review / approval
# ---------------------------------------------------------------------------

def _require_household_admin(request):
    """Returns (profile, household) or a Response describing why access is denied."""
    profile = getattr(request.user, 'profile', None)
    if not profile or profile.role not in ('admin', 'super_admin'):
        return None, Response({'error': 'Not allowed'}, status=status.HTTP_403_FORBIDDEN)
    if not profile.household_id:
        return None, Response({'error': 'No household selected'}, status=status.HTTP_400_BAD_REQUEST)
    from core.models import Household
    return (profile, Household.objects.get(pk=profile.household_id)), None


class SmsStagedUpdateView(APIView):
    """Edit the parsed_tx suggestion of a staged SMS message before approving."""
    permission_classes = [IsApprovedUser]

    def patch(self, request, pk):
        ctx, denied = _require_household_admin(request)
        if denied:
            return denied
        _profile, household = ctx
        try:
            msg = SmsMessage.objects.get(pk=pk, household=household)
        except SmsMessage.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if msg.status not in (SmsMessage.STATUS_PENDING, SmsMessage.STATUS_REJECTED):
            return Response({'error': 'Only pending or rejected items can be edited'}, status=status.HTTP_400_BAD_REQUEST)

        data = request.data or {}
        allowed = {
            'account', 'member', 'direction', 'amount', 'transaction_type', 'tx_date',
            'currency', 'fees', 'taxes', 'external_reference', 'classification', 'spend_category',
        }
        parsed_tx = dict(msg.raw_payload.get('parsed_tx') or {})
        for field in allowed:
            if field in data:
                parsed_tx[field] = data[field]

        raw_payload = dict(msg.raw_payload)
        raw_payload['parsed_tx'] = parsed_tx
        msg.raw_payload = raw_payload
        msg.status = SmsMessage.STATUS_PENDING
        msg.save(update_fields=['raw_payload', 'status'])
        return Response(SmsMessageSerializer(msg).data)


class SmsStagedActionView(APIView):
    """
    Approve or reject a staged SMS message.

    Approving creates the corresponding ledger Transaction (the only
    destination wired up so far — account-balance/investment/FD/tax targets
    can be added to this dispatcher later without changing the staging model
    or the frontend contract).
    """
    permission_classes = [IsApprovedUser]

    def post(self, request, pk, action):
        from decimal import Decimal, InvalidOperation
        from core.models import Member
        from instruments.models import Account
        from ledger.models import Transaction as _Tx

        ctx, denied = _require_household_admin(request)
        if denied:
            return denied
        _profile, household = ctx
        try:
            msg = SmsMessage.objects.get(pk=pk, household=household)
        except SmsMessage.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if action == 'reject':
            msg.status = SmsMessage.STATUS_REJECTED
            msg.save(update_fields=['status'])
            return Response(SmsMessageSerializer(msg).data)

        if action != 'approve':
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)

        if msg.status == SmsMessage.STATUS_APPROVED:
            return Response({'error': 'Already approved'}, status=status.HTTP_400_BAD_REQUEST)

        overrides = request.data or {}
        tx_row = dict(msg.raw_payload.get('parsed_tx') or {})
        for field in ('account', 'member', 'direction', 'amount', 'transaction_type', 'tx_date', 'currency',
                      'fees', 'taxes', 'external_reference', 'classification', 'spend_category'):
            if field in overrides:
                tx_row[field] = overrides[field]

        if not (tx_row.get('amount') and tx_row.get('direction') and tx_row.get('tx_date') and tx_row.get('account')):
            return Response({'error': 'account, amount, direction and tx_date are required to approve'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            acc = Account.objects.get(pk=int(tx_row['account']), household=household)
        except (Account.DoesNotExist, ValueError, TypeError):
            return Response({'error': 'Invalid account'}, status=status.HTTP_400_BAD_REQUEST)

        member = None
        if tx_row.get('member'):
            try:
                member = Member.objects.get(pk=int(tx_row['member']), household=household)
            except (Member.DoesNotExist, ValueError, TypeError):
                return Response({'error': 'Invalid member'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            member = msg.owner

        template = SMS_TEMPLATES.get(msg.template_key or '', {})
        classification = tx_row.get('classification') or template.get('classification', '')
        spend_category = tx_row.get('spend_category') or (
            template.get('default_spend_category', '') if classification == 'spend' else ''
        )

        try:
            created = _Tx.objects.create(
                household=household,
                member=member,
                account=acc,
                tx_date=tx_row['tx_date'],
                amount=Decimal(tx_row['amount']),
                direction=tx_row['direction'],
                transaction_type=tx_row.get('transaction_type', 'other'),
                currency=tx_row.get('currency', 'INR'),
                fees=Decimal(tx_row.get('fees') or '0'),
                taxes=Decimal(tx_row.get('taxes') or '0'),
                external_reference=tx_row.get('external_reference', ''),
                description=tx_row.get('merchant', '') or '',
                source='api',
                metadata={'sms_message_id': msg.pk, 'sms_sender': msg.sender},
                classification=classification,
                spend_category=spend_category,
            )
        except (InvalidOperation, KeyError, Exception) as ex:
            return Response({'error': f'Failed to create transaction: {ex}'}, status=status.HTTP_400_BAD_REQUEST)

        msg.status = SmsMessage.STATUS_APPROVED
        msg.imported_transaction_id = created.pk
        if member is not None and msg.owner_id != member.pk:
            msg.owner = member
            msg.save(update_fields=['status', 'imported_transaction_id', 'owner'])
        else:
            msg.save(update_fields=['status', 'imported_transaction_id'])

        return Response({**SmsMessageSerializer(msg).data, 'transaction_id': created.pk})
