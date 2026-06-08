from django.db.models import Q
from rest_framework import status, viewsets
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


class SmsMessageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Browse staged SMS messages — search, filter by sender/status/date range,
    and filter by auto-detected category (see sms_ingestion.categorization).
    """
    serializer_class = SmsMessageSerializer
    permission_classes = [IsApprovedUser]

    def get_queryset(self):
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

        ordering = self.request.query_params.get('ordering', '-received_at')
        if ordering.lstrip('-') in ('received_at', 'sender', 'created_at'):
            qs = qs.order_by(ordering)

        return qs


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
