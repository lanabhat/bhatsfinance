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
        msg, created = SmsMessage.objects.get_or_create(
            household=api_key.household,
            sender=data['sender'],
            received_at=data['timestamp'],
            body=data['body'],
            defaults={
                'api_key': api_key,
                'raw_payload': request.data,
            },
        )

        return Response(
            SmsMessageSerializer(msg).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
