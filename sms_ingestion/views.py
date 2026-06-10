from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsApprovedUser
from sms_ingestion.authentication import SmsApiKeyAuthentication
from sms_ingestion.categorization import CATEGORY_PATTERNS
from sms_ingestion.models import SmsApiKey, SmsMessage, SmsRule, SmsRuleSuggestion
from sms_ingestion.permissions import HasSmsApiKey
from sms_ingestion.rule_engine import apply_rule, find_matching_rule, test_rule_extractions
from sms_ingestion.serializers import SmsApiKeySerializer, SmsIngestSerializer, SmsMessageSerializer, SmsRuleSerializer, SmsRuleSuggestionSerializer
from sms_ingestion.suggestions import record_observation


def _enrich_parsed_tx(parsed_tx: dict, body: str, sender: str, received_at) -> dict:
    """
    Always populate the raw fields that come directly from the SMS itself —
    tx_date (extracted from body, falling back to received_at) and sender.
    These do not depend on any rule matching.
    """
    from sms_ingestion.templates import extract_date
    from datetime import date

    if not parsed_tx.get('tx_date'):
        if received_at is not None:
            fallback = received_at.date() if hasattr(received_at, 'date') else received_at
        else:
            fallback = date.today()
        parsed_tx['tx_date'] = extract_date(body, fallback).isoformat()

    if not parsed_tx.get('currency'):
        parsed_tx['currency'] = 'INR'

    if not parsed_tx.get('sender'):
        parsed_tx['sender'] = sender

    return parsed_tx


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

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """
        Export SMS messages as a JSON download.

        GET /api/sms-messages/export/?household=N          — all messages
        GET /api/sms-messages/export/?household=N&ids=1,2  — specific ids
        Also honours the same filter params as the list view (status, sender, etc.)
        """
        import json
        from django.http import HttpResponse

        profile = getattr(request.user, 'profile', None)
        hid = request.query_params.get('household') or (profile.household_id if profile else None)
        if not hid:
            return Response({'detail': 'No household.'}, status=status.HTTP_400_BAD_REQUEST)

        ids_param = request.query_params.get('ids', '')
        if ids_param:
            ids = [int(i) for i in ids_param.split(',') if i.strip().isdigit()]
            qs = SmsMessage.objects.filter(household_id=hid, id__in=ids)
        else:
            # Honour the same filters as the list view
            qs = SmsMessage.objects.filter(household_id=hid)
            msg_status = request.query_params.get('status')
            if msg_status and msg_status != 'all':
                qs = qs.filter(status=msg_status)
            sender = request.query_params.get('sender')
            if sender:
                qs = qs.filter(sender__icontains=sender)
            search = request.query_params.get('search')
            if search:
                from django.db.models import Q
                qs = qs.filter(Q(body__icontains=search) | Q(sender__icontains=search))
            received_after = request.query_params.get('received_after')
            if received_after:
                qs = qs.filter(received_at__gte=received_after)
            received_before = request.query_params.get('received_before')
            if received_before:
                qs = qs.filter(received_at__lte=received_before)

        rows = list(qs.order_by('-received_at').values(
            'id', 'sender', 'body', 'received_at', 'status',
            'raw_payload', 'imported_transaction_id', 'created_at',
        ))
        # Make datetimes JSON-serialisable
        for row in rows:
            row['received_at'] = row['received_at'].isoformat() if row['received_at'] else None
            row['created_at'] = row['created_at'].isoformat() if row['created_at'] else None

        payload = json.dumps({'sms_messages': rows}, ensure_ascii=False, indent=2)
        resp = HttpResponse(payload, content_type='application/json')
        resp['Content-Disposition'] = 'attachment; filename="sms_messages.json"'
        return resp

    @action(detail=False, methods=['post'], url_path='import')
    def import_messages(self, request):
        """
        Bulk-import SMS messages from a JSON payload.

        Body: { "messages": [ {"sender": "...", "body": "...", "timestamp": "..."}, ... ] }
        Each item is run through the same ingest pipeline (dedup + rule matching).
        Returns: { "created": N, "skipped": N, "errors": [...] }
        """
        from sms_ingestion.serializers import SmsIngestSerializer

        profile = getattr(request.user, 'profile', None)
        hid = profile.household_id if profile else None
        if not hid:
            return Response({'detail': 'No household.'}, status=status.HTTP_400_BAD_REQUEST)

        messages = request.data.get('messages')
        if not isinstance(messages, list) or not messages:
            return Response({'detail': '"messages" must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)

        from core.models import Household
        try:
            household = Household.objects.get(pk=hid)
        except Household.DoesNotExist:
            return Response({'detail': 'Household not found.'}, status=status.HTTP_400_BAD_REQUEST)

        rules = list(SmsRule.objects.filter(household=household, is_active=True))
        created_count = 0
        skipped_count = 0
        errors = []

        for i, item in enumerate(messages):
            ser = SmsIngestSerializer(data={
                'sender': item.get('sender', ''),
                'body': item.get('body', ''),
                'timestamp': str(item.get('timestamp', item.get('received_at', ''))),
            })
            if not ser.is_valid():
                errors.append({'index': i, 'detail': ser.errors})
                continue

            data = ser.validated_data
            raw_payload = {'sender': data['sender'], 'body': data['body'], 'parsed_tx': {}}
            matched_rule = find_matching_rule(rules, data['sender'], data['body'])
            if matched_rule:
                raw_payload['parsed_tx'] = apply_rule(matched_rule, {}, data['body'], data['timestamp'])
                raw_payload['matched_rule_id'] = matched_rule.id
                raw_payload['matched_rule_name'] = matched_rule.name
            _enrich_parsed_tx(raw_payload['parsed_tx'], data['body'], data['sender'], data['timestamp'])

            _, was_created = SmsMessage.objects.get_or_create(
                household=household,
                sender=data['sender'],
                received_at=data['timestamp'],
                body=data['body'],
                defaults={
                    'raw_payload': raw_payload,
                    'template_key': '',
                    'confidence': None,
                },
            )
            if was_created:
                created_count += 1
            else:
                skipped_count += 1

        return Response({'created': created_count, 'skipped': skipped_count, 'errors': errors})

    @action(detail=False, methods=['post'], url_path='reapply-rules')
    def reapply_rules(self, request):
        """
        Re-run the rules pipeline on a list of staged messages and update their
        raw_payload / parsed_tx in place.  Only updates messages belonging to
        the requesting user's household.  Does NOT change approved messages.

        Body: { "ids": [1, 2, 3] }
        Returns: { "updated": N, "results": [ {id, matched_rule_name, parsed_tx}, ... ] }
        """
        ids = request.data.get('ids')
        if not ids or not isinstance(ids, list):
            return Response({'detail': '"ids" must be a non-empty list of integers.'}, status=status.HTTP_400_BAD_REQUEST)

        profile = getattr(request.user, 'profile', None)
        hid = profile.household_id if profile else None
        if not hid:
            return Response({'detail': 'No household.'}, status=status.HTTP_400_BAD_REQUEST)

        messages = SmsMessage.objects.filter(id__in=ids, household_id=hid).exclude(status=SmsMessage.STATUS_APPROVED)
        rules = list(SmsRule.objects.filter(household_id=hid, is_active=True))

        results = []
        for msg in messages:
            matched_rule = find_matching_rule(rules, msg.sender, msg.body)
            raw_payload = dict(msg.raw_payload or {})
            if matched_rule:
                raw_payload['parsed_tx'] = apply_rule(matched_rule, {}, msg.body, msg.received_at)
                raw_payload['matched_rule_id'] = matched_rule.id
                raw_payload['matched_rule_name'] = matched_rule.name
            else:
                raw_payload['parsed_tx'] = {}
                raw_payload.pop('matched_rule_id', None)
                raw_payload.pop('matched_rule_name', None)
            _enrich_parsed_tx(raw_payload['parsed_tx'], msg.body, msg.sender, msg.received_at)
            msg.raw_payload = raw_payload
            msg.template_key = ''
            msg.confidence = None
            results.append({
                'id': msg.id,
                'matched_rule_name': matched_rule.name if matched_rule else None,
                'parsed_tx': raw_payload['parsed_tx'],
            })

        SmsMessage.objects.bulk_update(messages, ['raw_payload', 'template_key', 'confidence'])
        return Response({'updated': len(results), 'results': results})


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
        raw_payload = dict(request.data)
        raw_payload['parsed_tx'] = {}

        # Apply user-defined rules — rules map the SMS to ledger fields
        rules = list(SmsRule.objects.filter(household=api_key.household, is_active=True))
        matched_rule = find_matching_rule(rules, data['sender'], data['body'])
        if matched_rule:
            raw_payload['parsed_tx'] = apply_rule(matched_rule, {}, data['body'], data['timestamp'])
            raw_payload['matched_rule_id'] = matched_rule.id
            raw_payload['matched_rule_name'] = matched_rule.name

        # Always set date/currency/sender from raw SMS fields regardless of rule match
        _enrich_parsed_tx(raw_payload['parsed_tx'], data['body'], data['sender'], data['timestamp'])

        msg, created = SmsMessage.objects.get_or_create(
            household=api_key.household,
            sender=data['sender'],
            received_at=data['timestamp'],
            body=data['body'],
            defaults={
                'api_key': api_key,
                'raw_payload': raw_payload,
                'template_key': '',
                'confidence': None,
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

        classification = tx_row.get('classification', '')
        spend_category = tx_row.get('spend_category', '') if classification == 'spend' else ''

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

        # Record this approval as an observation for the auto-suggestion engine
        try:
            record_observation(
                household_id=household.pk,
                sender=msg.sender,
                account_id=created.account_id,
                member_id=created.member_id,
                direction=created.direction,
                classification=created.classification,
                spend_category=created.spend_category,
                transaction_type=created.transaction_type,
                body_sample=msg.body,
            )
        except Exception:
            pass  # never let suggestion recording break approval

        return Response({**SmsMessageSerializer(msg).data, 'transaction_id': created.pk})


# ---------------------------------------------------------------------------
# SMS Rules CRUD + test
# ---------------------------------------------------------------------------

class SmsRuleViewSet(viewsets.ModelViewSet):
    """CRUD for user-defined SMS mapping rules."""
    serializer_class = SmsRuleSerializer
    permission_classes = [IsApprovedUser]

    def get_queryset(self):
        profile = getattr(self.request.user, 'profile', None)
        hid = self.request.query_params.get('household') or (profile.household_id if profile else None)
        if not hid:
            return SmsRule.objects.none()
        return SmsRule.objects.filter(household_id=hid)

    @action(detail=True, methods=['post'], url_path='test')
    def test(self, request, pk=None):
        """Test a saved rule against a sample sender + body."""
        rule = self.get_object()
        sender = request.data.get('sender', '')
        body = request.data.get('body', '')
        from sms_ingestion.rule_engine import match_rule, _extract
        matched = match_rule(rule, sender, body)
        extractions = {
            'amount': _extract(rule.amount_regex, body),
            'merchant': _extract(rule.merchant_regex, body),
            'reference': _extract(rule.reference_regex, body),
            'notes': _extract(rule.notes_regex, body),
        }
        return Response({
            'matched': matched,
            'extractions': {k: v for k, v in extractions.items() if v},
        })

    @action(detail=False, methods=['post'], url_path='test-new')
    def test_new(self, request):
        """Test an unsaved rule definition against a sample sender + body."""
        rule_data = request.data.get('rule') or {}
        sender = request.data.get('sender', '')
        body = request.data.get('body', '')
        result = test_rule_extractions(rule_data, sender, body)
        return Response(result)

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """
        Export all household rules as a portable JSON file (no ids, no household).

        GET /api/sms-rules/export/?household=N
        """
        import json
        from django.http import HttpResponse

        profile = getattr(request.user, 'profile', None)
        hid = request.query_params.get('household') or (profile.household_id if profile else None)
        if not hid:
            return Response({'detail': 'No household.'}, status=status.HTTP_400_BAD_REQUEST)

        rules = SmsRule.objects.filter(household_id=hid).order_by('priority', 'created_at')
        export_fields = [
            'name', 'is_active', 'priority', 'conditions',
            'direction', 'transaction_type', 'classification', 'spend_category',
            'amount_regex', 'merchant_regex', 'reference_regex', 'notes_regex',
        ]
        rows = []
        for rule in rules:
            row = {f: getattr(rule, f) for f in export_fields}
            # Resolve FK names so the file is portable across households
            row['account_name'] = rule.account.name if rule.account_id else ''
            row['member_name'] = rule.member.full_name if rule.member_id else ''
            rows.append(row)

        payload = json.dumps({'sms_rules': rows, 'exported_count': len(rows)}, ensure_ascii=False, indent=2)
        resp = HttpResponse(payload, content_type='application/json')
        resp['Content-Disposition'] = 'attachment; filename="sms_rules.json"'
        return resp

    @action(detail=False, methods=['post'], url_path='import')
    def import_rules(self, request):
        """
        Import rules from a JSON payload.  Each rule is created fresh — existing
        rules are not modified.  Account/member are resolved by name (best-effort;
        left blank if not found).

        Body: { "rules": [ {...rule fields...}, ... ] }
        Returns: { "created": N, "errors": [...] }
        """
        profile = getattr(request.user, 'profile', None)
        hid = profile.household_id if profile else None
        if not hid:
            return Response({'detail': 'No household.'}, status=status.HTTP_400_BAD_REQUEST)

        rules_data = request.data.get('rules')
        if not isinstance(rules_data, list) or not rules_data:
            return Response({'detail': '"rules" must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)

        from instruments.models import Account
        from core.models import Member

        accounts_by_name = {a.name.lower(): a for a in Account.objects.filter(household_id=hid)}
        members_by_name = {m.full_name.lower(): m for m in Member.objects.filter(household_id=hid)}

        created_count = 0
        errors = []

        for i, item in enumerate(rules_data):
            if not item.get('name', '').strip():
                errors.append({'index': i, 'detail': 'name is required'})
                continue

            account_name = (item.get('account_name') or '').strip().lower()
            member_name = (item.get('member_name') or '').strip().lower()

            try:
                SmsRule.objects.create(
                    household_id=hid,
                    name=item['name'].strip(),
                    is_active=bool(item.get('is_active', True)),
                    priority=int(item.get('priority', 0)),
                    conditions=item.get('conditions') or {'op': 'and', 'conditions': []},
                    account=accounts_by_name.get(account_name),
                    member=members_by_name.get(member_name),
                    direction=item.get('direction', ''),
                    transaction_type=item.get('transaction_type', ''),
                    classification=item.get('classification', ''),
                    spend_category=item.get('spend_category', ''),
                    amount_regex=item.get('amount_regex', ''),
                    merchant_regex=item.get('merchant_regex', ''),
                    reference_regex=item.get('reference_regex', ''),
                    notes_regex=item.get('notes_regex', ''),
                )
                created_count += 1
            except Exception as ex:
                errors.append({'index': i, 'name': item.get('name', ''), 'detail': str(ex)})

        return Response({'created': created_count, 'errors': errors})

    @action(detail=False, methods=['post'], url_path='detect')
    def detect(self, request):
        """
        Run all active household rules against a sample sender + body
        without saving anything.  Returns the first matching rule and the
        resulting parsed_tx fields.

        POST /api/sms-rules/detect/
        Body: { "sender": "...", "body": "..." }
        Returns: {
          "matched_rule": { id, name } | null,
          "parsed_tx": { ... },
          "all_rules": [ { id, name, matched: bool }, ... ]
        }
        """
        from sms_ingestion.rule_engine import match_rule

        profile = getattr(request.user, 'profile', None)
        hid = request.query_params.get('household') or (profile.household_id if profile else None)
        if not hid:
            return Response({'detail': 'No household.'}, status=status.HTTP_400_BAD_REQUEST)

        sender = request.data.get('sender', '')
        body = request.data.get('body', '')

        rules = list(SmsRule.objects.filter(household_id=hid, is_active=True))
        matched_rule = find_matching_rule(rules, sender, body)
        from django.utils import timezone
        parsed_tx = apply_rule(matched_rule, {}, body, timezone.now()) if matched_rule else {}

        return Response({
            'matched_rule': {'id': matched_rule.id, 'name': matched_rule.name} if matched_rule else None,
            'parsed_tx': parsed_tx,
            'all_rules': [
                {'id': r.id, 'name': r.name, 'matched': match_rule(r, sender, body)}
                for r in rules
            ],
        })


# ---------------------------------------------------------------------------
# Rule suggestions
# ---------------------------------------------------------------------------

class SmsRuleSuggestionViewSet(viewsets.GenericViewSet):
    """
    Read and act on auto-generated rule suggestions.

    GET  /api/sms-rule-suggestions/?household=N  — list pending suggestions
    POST /api/sms-rule-suggestions/<pk>/dismiss/  — mark dismissed
    POST /api/sms-rule-suggestions/<pk>/accept/   — mark accepted + return
                                                    pre-filled rule data for
                                                    the frontend editor to open
    """
    serializer_class = SmsRuleSuggestionSerializer
    permission_classes = [IsApprovedUser]

    def get_queryset(self):
        profile = getattr(self.request.user, 'profile', None)
        hid = self.request.query_params.get('household') or (profile.household_id if profile else None)
        if not hid:
            return SmsRuleSuggestion.objects.none()
        return SmsRuleSuggestion.objects.filter(
            household_id=hid,
            status=SmsRuleSuggestion.STATUS_PENDING,
        )

    def list(self, request):
        qs = self.get_queryset()
        return Response(SmsRuleSuggestionSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'], url_path='dismiss')
    def dismiss(self, request, pk=None):
        profile = getattr(request.user, 'profile', None)
        hid = profile.household_id if profile else None
        try:
            suggestion = SmsRuleSuggestion.objects.get(pk=pk, household_id=hid)
        except SmsRuleSuggestion.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        suggestion.status = SmsRuleSuggestion.STATUS_DISMISSED
        suggestion.save(update_fields=['status'])
        return Response({'status': 'dismissed'})

    @action(detail=True, methods=['post'], url_path='accept')
    def accept(self, request, pk=None):
        """
        Return pre-filled SmsRuleFormData for the frontend editor.
        Does NOT mark the suggestion as accepted yet — that happens when the
        user actually saves the rule (via confirm_accepted).  This way
        cancelling the editor leaves the suggestion intact.
        Regexes are inferred from existing household rules that share
        non-empty patterns, favouring rules whose sender condition overlaps.
        """
        profile = getattr(request.user, 'profile', None)
        hid = profile.household_id if profile else None
        try:
            suggestion = SmsRuleSuggestion.objects.get(pk=pk, household_id=hid)
        except SmsRuleSuggestion.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Infer regexes from existing rules — prefer rules whose sender
        # condition contains the suggestion sender string, then fall back
        # to any rule that has a non-empty regex.
        amount_regex = ''
        merchant_regex = ''
        reference_regex = ''
        notes_regex = ''

        existing_rules = list(SmsRule.objects.filter(household_id=hid))
        sender_lower = suggestion.sender.lower()

        def _sender_match_score(rule):
            """Higher score = sender condition more relevant to this suggestion."""
            conds = rule.conditions or {}
            for c in (conds.get('conditions') or []):
                if isinstance(c, dict) and c.get('field') == 'sender':
                    val = (c.get('value') or '').lower()
                    if val and (val in sender_lower or sender_lower in val):
                        return 2
                    return 1
            return 0

        scored = sorted(existing_rules, key=_sender_match_score, reverse=True)

        for rule in scored:
            if not amount_regex and rule.amount_regex:
                amount_regex = rule.amount_regex
            if not merchant_regex and rule.merchant_regex:
                merchant_regex = rule.merchant_regex
            if not reference_regex and rule.reference_regex:
                reference_regex = rule.reference_regex
            if not notes_regex and rule.notes_regex:
                notes_regex = rule.notes_regex
            if amount_regex and merchant_regex and reference_regex and notes_regex:
                break

        prefill = {
            'household': hid,
            'name': f'{suggestion.sender} — auto',
            'is_active': True,
            'priority': 0,
            'conditions': {
                'op': 'and',
                'conditions': [
                    {'field': 'sender', 'op': 'contains', 'value': suggestion.sender},
                ],
            },
            'account': suggestion.account_id,
            'member': suggestion.member_id,
            'direction': suggestion.direction,
            'transaction_type': suggestion.transaction_type,
            'classification': suggestion.classification,
            'spend_category': suggestion.spend_category,
            'amount_regex': amount_regex,
            'merchant_regex': merchant_regex,
            'reference_regex': reference_regex,
            'notes_regex': notes_regex,
        }
        return Response({
            'suggestion': SmsRuleSuggestionSerializer(suggestion).data,
            'prefill': prefill,
        })

    @action(detail=True, methods=['post'], url_path='confirm-accepted')
    def confirm_accepted(self, request, pk=None):
        """Mark suggestion accepted after the rule has actually been saved."""
        profile = getattr(request.user, 'profile', None)
        hid = profile.household_id if profile else None
        try:
            suggestion = SmsRuleSuggestion.objects.get(pk=pk, household_id=hid)
        except SmsRuleSuggestion.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        suggestion.status = SmsRuleSuggestion.STATUS_ACCEPTED
        suggestion.save(update_fields=['status'])
        return Response({'status': 'accepted'})

    @action(detail=True, methods=['delete'], url_path='delete')
    def delete_suggestion(self, request, pk=None):
        """Permanently delete a suggestion (harder than dismiss — won't resurface)."""
        profile = getattr(request.user, 'profile', None)
        hid = profile.household_id if profile else None
        try:
            suggestion = SmsRuleSuggestion.objects.get(pk=pk, household_id=hid)
        except SmsRuleSuggestion.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        suggestion.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
