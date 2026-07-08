from django.conf import settings
from django.http import HttpResponseRedirect
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Household
from core.permissions import IsApprovedUser
from gmail_ingestion.models import GoogleCredential, GmailSyncConfig
from gmail_ingestion.services import build_oauth_start_url, exchange_code_for_tokens, run_sync, _fetch_google_email, fetch_preview, fetch_message_fields
import re as _re
from gmail_ingestion.templates import templates_for_api, templates_for_api_full


def _frontend_redirect_url() -> str:
    base = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5173').rstrip('/')
    # Settings page contains the Gmail import UI.
    return f'{base}/#/settings'


def _client_configured() -> bool:
    from core.integration_credentials import get_global_secret
    return bool(
        get_global_secret('google_oauth_client_id')
        or getattr(settings, 'SOCIAL_AUTH_GOOGLE_OAUTH2_KEY', '')
    )


class GmailStatusView(APIView):
    permission_classes = [IsApprovedUser]

    def get(self, request):
        user = request.user
        credentials = GoogleCredential.objects.filter(user=user, refresh_token__gt='')
        connected_accounts = [
            {'id': c.id, 'email': c.email, 'label': c.label or c.email}
            for c in credentials
        ]
        household_id = getattr(getattr(user, 'profile', None), 'household_id', None)
        household = Household.objects.filter(pk=household_id).first() if household_id else None
        config = None
        if household:
            config = GmailSyncConfig.objects.filter(user=user, household=household).first()

        return Response({
            'connected_accounts': connected_accounts,
            'client_configured': _client_configured(),
            'household_id': household.id if household else None,
            'config': {
                'enabled': bool(config.enabled) if config else True,
                'query_override': config.query_override if config else '',
                'account_rules': config.account_rules if config else [],
                'excluded_recipients': config.excluded_recipients if config else [],
                'excluded_senders': config.excluded_senders if config else [],
                'last_synced_at': config.last_synced_at.isoformat() if config and config.last_synced_at else None,
            },
        })


class GmailConnectStartView(APIView):
    permission_classes = [IsApprovedUser]

    def get(self, request):
        url = build_oauth_start_url(request)
        return HttpResponseRedirect(url)


class GmailConnectCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        # Must be logged in (session auth) since we store tokens on a user profile.
        if not request.user or not request.user.is_authenticated:
            return HttpResponseRedirect(_frontend_redirect_url())

        expected = request.session.get('gmail_oauth_state')
        actual = request.query_params.get('state')
        code = request.query_params.get('code')
        if not expected or not actual or expected != actual or not code:
            return HttpResponseRedirect(_frontend_redirect_url())

        token = exchange_code_for_tokens(code)
        refresh_token = token.get('refresh_token', '') or ''
        access_token = token.get('access_token', '') or ''
        scope = token.get('scope', '') or ''
        token_type = token.get('token_type', '') or ''

        # Always create a new credential record for the connected Google account.
        # (Users can connect multiple Google accounts; each gets its own row.)
        cred = GoogleCredential(user=request.user)
        if refresh_token:
            cred.refresh_token = refresh_token
        if access_token:
            cred.access_token = access_token
        cred.scope = scope
        cred.token_type = token_type
        # Fetch the Google account email to identify this credential.
        if access_token:
            email = _fetch_google_email(access_token)
            cred.email = email
            cred.label = email
        cred.save()

        # Default config for the current household (if present)
        profile = getattr(request.user, 'profile', None)
        if profile and profile.household_id:
            household = Household.objects.filter(pk=profile.household_id).first()
            if household:
                GmailSyncConfig.objects.get_or_create(user=request.user, household=household)

        return HttpResponseRedirect(_frontend_redirect_url())


class GmailDisconnectView(APIView):
    permission_classes = [IsApprovedUser]

    def post(self, request):
        credential_id = request.data.get('credential_id')
        if credential_id:
            GoogleCredential.objects.filter(user=request.user, pk=int(credential_id)).delete()
        else:
            GoogleCredential.objects.filter(user=request.user).delete()
        remaining = GoogleCredential.objects.filter(user=request.user, refresh_token__gt='')
        return Response({
            'connected_accounts': [
                {'id': c.id, 'email': c.email, 'label': c.label or c.email}
                for c in remaining
            ],
        })


class GmailConfigView(APIView):
    permission_classes = [IsApprovedUser]

    def patch(self, request):
        profile = getattr(request.user, 'profile', None)
        if not profile or not profile.household_id:
            return Response({'error': 'No household selected for user'}, status=400)
        household = Household.objects.get(pk=profile.household_id)
        config, _ = GmailSyncConfig.objects.get_or_create(user=request.user, household=household)

        data = request.data or {}
        if 'enabled' in data:
            config.enabled = bool(data.get('enabled'))
        if 'query_override' in data:
            config.query_override = str(data.get('query_override') or '')
        if 'account_rules' in data:
            rules = data.get('account_rules') or []
            if not isinstance(rules, list):
                return Response({'error': 'account_rules must be a list'}, status=400)
            config.account_rules = rules
        if 'excluded_recipients' in data:
            excl = data.get('excluded_recipients') or []
            if not isinstance(excl, list):
                return Response({'error': 'excluded_recipients must be a list'}, status=400)
            config.excluded_recipients = [str(e).strip().lower() for e in excl if e]
        if 'excluded_senders' in data:
            excl_s = data.get('excluded_senders') or []
            if not isinstance(excl_s, list):
                return Response({'error': 'excluded_senders must be a list'}, status=400)
            config.excluded_senders = [str(e).strip().lower() for e in excl_s if e]
        config.save()
        return Response({
            'enabled': config.enabled,
            'query_override': config.query_override,
            'account_rules': config.account_rules,
            'excluded_recipients': config.excluded_recipients,
            'excluded_senders': config.excluded_senders,
            'last_synced_at': config.last_synced_at.isoformat() if config.last_synced_at else None,
        })


class GmailSyncView(APIView):
    permission_classes = [IsApprovedUser]

    def post(self, request):
        # Guard: only admins can sync/import (writes ledger/valuations)
        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role not in ('admin', 'super_admin'):
            return Response({'error': 'Not allowed'}, status=403)
        if not profile.household_id:
            return Response({'error': 'No household selected for user'}, status=400)

        household = Household.objects.get(pk=profile.household_id)
        config, _ = GmailSyncConfig.objects.get_or_create(user=request.user, household=household)
        if not config.enabled:
            return Response({'error': 'Gmail sync disabled'}, status=400)

        try:
            result = run_sync(user=request.user, household=household, config=config)
            return Response(result)
        except Exception as e:
            # Most common failures are Google API errors (403/429/etc). Don't 500 the app.
            return Response({'error': str(e)}, status=400)


class GmailTemplatesView(APIView):
    permission_classes = [IsApprovedUser]

    def _get_config(self, request):
        profile = getattr(request.user, 'profile', None)
        if not profile or not profile.household_id:
            return None
        return GmailSyncConfig.objects.filter(user=request.user, household_id=profile.household_id).first()

    def get(self, request):
        config = self._get_config(request)
        custom = (config.custom_templates or {}) if config else {}
        return Response(templates_for_api_full(custom))

    def post(self, request):
        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role not in ('admin', 'super_admin'):
            return Response({'error': 'Not allowed'}, status=403)
        if not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        key = str(request.data.get('key') or '').strip()
        if not key or not _re.match(r'^[a-z_]{1,50}$', key):
            return Response({'error': 'Template key must be 1-50 lowercase letters/underscores'}, status=400)

        amount_re = str(request.data.get('amount_re') or '').strip()
        if amount_re:
            try:
                _re.compile(amount_re)
            except _re.error as e:
                return Response({'error': f'Invalid amount_re regex: {e}'}, status=400)

        confidence_signals = request.data.get('confidence_signals') or []
        negative_signals = request.data.get('negative_signals') or []
        if not isinstance(confidence_signals, list) or not isinstance(negative_signals, list):
            return Response({'error': 'confidence_signals and negative_signals must be lists'}, status=400)

        tmpl = {
            'label': str(request.data.get('label') or '').strip(),
            'description': str(request.data.get('description') or '').strip(),
            'direction': request.data.get('direction') or None,
            'tx_type': request.data.get('tx_type') or None,
            'target': request.data.get('target') or 'account',
            'amount_re': amount_re,
            'confidence_signals': [str(s).strip() for s in confidence_signals if str(s).strip()],
            'negative_signals': [str(s).strip() for s in negative_signals if str(s).strip()],
        }

        household = Household.objects.get(pk=profile.household_id)
        config, _ = GmailSyncConfig.objects.get_or_create(user=request.user, household=household)
        custom = dict(config.custom_templates or {})
        custom[key] = tmpl
        config.custom_templates = custom
        config.save(update_fields=['custom_templates', 'updated_at'])

        return Response({'key': key, **tmpl, 'is_builtin': False})


class GmailTemplateDetailView(APIView):
    """DELETE a custom template override, reverting to built-in or removing entirely."""
    permission_classes = [IsApprovedUser]

    def delete(self, request, key):
        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role not in ('admin', 'super_admin'):
            return Response({'error': 'Not allowed'}, status=403)
        if not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        config = GmailSyncConfig.objects.filter(user=request.user, household_id=profile.household_id).first()
        if config and key in (config.custom_templates or {}):
            custom = dict(config.custom_templates)
            del custom[key]
            config.custom_templates = custom
            config.save(update_fields=['custom_templates', 'updated_at'])
        return Response({'deleted': key})


class GmailFetchPreviewView(APIView):
    permission_classes = [IsApprovedUser]

    def post(self, request):
        profile = getattr(request.user, 'profile', None)
        if not profile or not profile.household_id:
            return Response({'error': 'No household selected for user'}, status=400)
        household = Household.objects.get(pk=profile.household_id)

        query = str(request.data.get('query') or 'newer_than:30d').strip()
        max_results = min(int(request.data.get('max_results') or 500), 2000)

        try:
            result = fetch_preview(user=request.user, household=household, query=query, max_results=max_results)
            return Response(result)
        except Exception as e:
            return Response({'error': str(e)}, status=400)


class GmailImportGroupsView(APIView):
    permission_classes = [IsApprovedUser]

    def post(self, request):
        from instruments.models import Account

        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role not in ('admin', 'super_admin'):
            return Response({'error': 'Not allowed'}, status=403)
        if not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        household = Household.objects.get(pk=profile.household_id)
        config, _ = GmailSyncConfig.objects.get_or_create(user=request.user, household=household)

        data = request.data or {}
        groups = data.get('groups') or []
        save_rules = bool(data.get('save_rules', False))

        tx_mapping = {k: k for k in ['tx_date', 'amount', 'direction', 'account', 'transaction_type', 'currency', 'fees', 'taxes', 'external_reference', 'idempotency_key']}

        group_results = []
        new_rules = []

        for group in groups:
            rule = group.get('rule') or {}
            message_ids = group.get('message_ids') or []
            account_id = rule.get('account_id')
            template_key = rule.get('template')

            if not message_ids or not account_id:
                group_results.append({
                    'sender_domain': group.get('sender_domain'),
                    'skipped': True,
                    'reason': 'No account mapped or no messages',
                })
                continue

            try:
                account = Account.objects.get(pk=account_id, household=household)
            except Account.DoesNotExist:
                group_results.append({
                    'sender_domain': group.get('sender_domain'),
                    'error': f'Account {account_id} not found',
                })
                continue

            from gmail_ingestion.models import GmailProcessedMessage
            from gmail_ingestion.models import GoogleCredential as _GC
            from gmail_ingestion.services import get_message, _gmail_headers, refresh_access_token, parse_message_to_rows, compute_suggestions, detect_template
            from gmail_ingestion.templates import get_effective_templates
            import html as _html

            custom_tmpls = config.custom_templates or {}
            creds = list(_GC.objects.filter(user=request.user, refresh_token__gt=''))
            email_log = []
            staged_count = 0
            errors = []

            for cred in creds:
                try:
                    access = refresh_access_token(cred)
                except Exception:
                    continue

                for msg_id in message_ids:
                    if GmailProcessedMessage.objects.filter(user=request.user, household=household, message_id=msg_id).exists():
                        email_log.append({'message_id': msg_id, 'status': 'already_imported'})
                        continue
                    try:
                        msg = get_message(access, msg_id)
                        payload = msg.get('payload') or {}
                        headers = _gmail_headers(payload)
                        subject = headers.get('subject', '')
                        snippet = _html.unescape(msg.get('snippet') or '')
                        internal_ms = int(msg.get('internalDate') or 0)

                        # Use the rule-supplied template_key; also detect for confidence score
                        _tkey, conf, _a, _d = detect_template(subject, snippet, headers.get('from', ''), custom_templates=custom_tmpls)
                        effective_conf = conf if template_key is None else conf

                        tx_row, val_row = parse_message_to_rows(
                            msg, account_id=account_id, account_name=account.name,
                            template_key=template_key, custom_templates=custom_tmpls,
                        )

                        suggestions = compute_suggestions(template_key or _tkey, effective_conf, tx_row, account.account_type)

                        if tx_row:
                            status = GmailProcessedMessage.STATUS_PENDING
                        elif val_row:
                            status = GmailProcessedMessage.STATUS_VALUATION_ONLY
                        else:
                            status = GmailProcessedMessage.STATUS_PENDING

                        raw = {'from': headers.get('from', ''), 'subject': subject, 'snippet': snippet[:200]}
                        if tx_row:
                            raw['parsed_tx'] = tx_row
                        if val_row:
                            raw['parsed_valuation'] = val_row

                        GmailProcessedMessage.objects.create(
                            user=request.user, household=household, message_id=msg_id,
                            thread_id=msg.get('threadId', ''),
                            internal_date_ms=internal_ms,
                            raw=raw,
                            status=status,
                            confidence=effective_conf,
                            template_key=template_key or _tkey or '',
                            suggestions=suggestions,
                        )
                        staged_count += 1

                        email_log.append({
                            'message_id': msg_id,
                            'date': tx_row.get('tx_date') if tx_row else None,
                            'subject': subject[:80],
                            'amount': tx_row.get('amount') if tx_row else None,
                            'status': 'pending',
                            'confidence': effective_conf,
                            'suggestions': suggestions,
                        })
                        break  # message fetched from first working credential — don't try others
                    except Exception as e:
                        email_log.append({'message_id': msg_id, 'status': 'error', 'error': str(e)})

            group_results.append({
                'sender_domain': group.get('sender_domain'),
                'staged_transactions': staged_count,
                'created_transactions': 0,
                'created_valuations': 0,
                'errors': errors,
                'email_log': email_log,
            })

            if save_rules and rule.get('sender'):
                new_rules.append({k: v for k, v in rule.items() if v is not None})

        if save_rules and new_rules:
            existing = config.account_rules or []
            existing_senders = {r.get('sender', '').lower() for r in existing}
            for r in new_rules:
                if r.get('sender', '').lower() not in existing_senders:
                    existing.append(r)
            config.account_rules = existing
            config.save(update_fields=['account_rules', 'updated_at'])

        return Response({'group_results': group_results, 'rules_saved': save_rules})


class GmailMessageFieldsView(APIView):
    permission_classes = [IsApprovedUser]

    def get(self, request):
        message_id = request.query_params.get('message_id', '').strip()
        if not message_id:
            return Response({'error': 'message_id required'}, status=400)
        try:
            profile = getattr(request.user, 'profile', None)
            custom_tmpls = {}
            if profile and profile.household_id:
                from gmail_ingestion.models import GmailSyncConfig
                cfg = GmailSyncConfig.objects.filter(user=request.user, household_id=profile.household_id).first()
                custom_tmpls = (cfg.custom_templates or {}) if cfg else {}
            result = fetch_message_fields(user=request.user, message_id=message_id, custom_templates=custom_tmpls)
            return Response(result)
        except Exception as e:
            return Response({'error': str(e)}, status=400)


class GmailApproveProposalsView(APIView):
    permission_classes = [IsApprovedUser]

    def post(self, request):
        """
        Create a single Instrument record from a proposal.
        Accepts one proposal object:
          { scheme_name, folio_no, instrument_type, member_id, default_account_id }
        Returns: { instrument: { id, name }, created: bool }
        """
        from instruments.models import Account, Instrument, InstrumentOwnership
        from core.models import Member

        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role not in ('admin', 'super_admin'):
            return Response({'error': 'Not allowed'}, status=403)
        if not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        household = Household.objects.get(pk=profile.household_id)
        p = request.data or {}

        scheme_name = str(p.get('scheme_name') or '').strip()
        if not scheme_name:
            return Response({'error': 'scheme_name required'}, status=400)

        folio_no = str(p.get('folio_no') or '').strip()
        inst_type = str(p.get('instrument_type') or 'mutual_fund').lower()
        member_id = p.get('member_id')
        default_account_id = p.get('default_account_id')

        metadata = {}
        if folio_no:
            metadata['folio_no'] = folio_no

        default_account = None
        if default_account_id:
            default_account = Account.objects.filter(pk=default_account_id, household=household).first()

        instrument, was_created = Instrument.objects.get_or_create(
            household=household,
            name=scheme_name,
            defaults={
                'instrument_type': inst_type,
                'metadata': metadata,
                'default_account': default_account,
            },
        )

        # Update fields on existing instrument if not yet set
        save_fields = []
        if folio_no and not instrument.metadata.get('folio_no'):
            instrument.metadata['folio_no'] = folio_no
            save_fields.append('metadata')
        if default_account and not instrument.default_account_id:
            instrument.default_account = default_account
            save_fields.append('default_account')
        if save_fields:
            instrument.save(update_fields=save_fields + ['updated_at'])

        # Create ownership for specified member if not already present
        if member_id:
            member = Member.objects.filter(pk=member_id, household=household).first()
            if member:
                InstrumentOwnership.objects.get_or_create(
                    instrument=instrument,
                    member=member,
                    defaults={'allocation_percent': 100},
                )

        return Response({
            'instrument': {'id': instrument.id, 'name': instrument.name},
            'created': was_created,
        })


class GmailResetImportHistoryView(APIView):
    permission_classes = [IsApprovedUser]

    def post(self, request):
        from gmail_ingestion.models import GmailProcessedMessage
        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role not in ('admin', 'super_admin'):
            return Response({'error': 'Not allowed'}, status=403)
        if not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        household = Household.objects.get(pk=profile.household_id)
        deleted, _ = GmailProcessedMessage.objects.filter(
            user=request.user, household=household
        ).delete()

        reset_sync_time = bool(request.data.get('reset_sync_time', True))
        if reset_sync_time:
            config, _ = GmailSyncConfig.objects.get_or_create(user=request.user, household=household)
            config.last_synced_at = None
            config.save(update_fields=['last_synced_at', 'updated_at'])

        return Response({'deleted': deleted, 'sync_time_reset': reset_sync_time})


# ---------------------------------------------------------------------------
# Staged transaction review — list, approve, edit, reject
# ---------------------------------------------------------------------------

def _serialize_staged(msg) -> dict:
    from gmail_ingestion.templates import RULE_TEMPLATES
    template = RULE_TEMPLATES.get(msg.template_key or '', {})
    return {
        'id': msg.id,
        'message_id': msg.message_id,
        'status': msg.status,
        'confidence': msg.confidence,
        'template_key': msg.template_key,
        'template_classification': template.get('classification', ''),
        'template_default_spend_category': template.get('default_spend_category', ''),
        'suggestions': msg.suggestions or [],
        'raw': msg.raw,
        'imported_transaction_id': msg.imported_transaction_id,
        'imported_valuation_id': msg.imported_valuation_id,
        'created_at': msg.created_at.isoformat() if msg.created_at else None,
    }


class GmailStagedView(APIView):
    """List staged (pending/rejected) transactions for review."""
    permission_classes = [IsApprovedUser]

    def get(self, request):
        from gmail_ingestion.models import GmailProcessedMessage
        profile = getattr(request.user, 'profile', None)
        if not profile or not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        household = Household.objects.get(pk=profile.household_id)
        status_filter = request.query_params.get('status', 'pending')
        allowed = {'pending', 'approved', 'rejected', 'valuation_only', 'all'}
        if status_filter not in allowed:
            status_filter = 'pending'

        qs = GmailProcessedMessage.objects.filter(user=request.user, household=household)
        if status_filter != 'all':
            qs = qs.filter(status=status_filter)
        qs = qs.order_by('-internal_date_ms')[:200]
        return Response({'results': [_serialize_staged(m) for m in qs]})


class GmailStagedEditView(APIView):
    """PATCH or DELETE a staged transaction."""
    permission_classes = [IsApprovedUser]

    def delete(self, request, pk):
        from gmail_ingestion.models import GmailProcessedMessage
        profile = getattr(request.user, 'profile', None)
        if not profile or not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        household = Household.objects.get(pk=profile.household_id)
        try:
            msg = GmailProcessedMessage.objects.get(pk=pk, user=request.user, household=household)
        except GmailProcessedMessage.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        msg.delete()
        return Response({'deleted': pk})

    def patch(self, request, pk):
        from gmail_ingestion.models import GmailProcessedMessage
        profile = getattr(request.user, 'profile', None)
        if not profile or not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        household = Household.objects.get(pk=profile.household_id)
        try:
            msg = GmailProcessedMessage.objects.get(pk=pk, user=request.user, household=household)
        except GmailProcessedMessage.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        if msg.status not in (GmailProcessedMessage.STATUS_PENDING, GmailProcessedMessage.STATUS_REJECTED):
            return Response({'error': 'Only pending or rejected items can be edited'}, status=400)

        data = request.data or {}
        allowed_fields = {'account', 'direction', 'amount', 'transaction_type', 'tx_date', 'currency', 'fees', 'taxes', 'external_reference'}
        parsed_tx = dict(msg.raw.get('parsed_tx') or {})
        for field in allowed_fields:
            if field in data:
                parsed_tx[field] = data[field]

        raw = dict(msg.raw)
        raw['parsed_tx'] = parsed_tx
        msg.raw = raw
        msg.status = GmailProcessedMessage.STATUS_PENDING  # re-open if was rejected
        msg.save(update_fields=['raw', 'status'])
        return Response(_serialize_staged(msg))


class GmailStagedActionView(APIView):
    """Approve or reject a single staged transaction."""
    permission_classes = [IsApprovedUser]

    def post(self, request, pk, action):
        from gmail_ingestion.models import GmailProcessedMessage
        from instruments.models import Account
        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role not in ('admin', 'super_admin'):
            return Response({'error': 'Not allowed'}, status=403)
        if not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        household = Household.objects.get(pk=profile.household_id)
        try:
            msg = GmailProcessedMessage.objects.get(pk=pk, user=request.user, household=household)
        except GmailProcessedMessage.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        if action == 'reject':
            msg.status = GmailProcessedMessage.STATUS_REJECTED
            msg.save(update_fields=['status'])
            return Response(_serialize_staged(msg))

        if action != 'approve':
            return Response({'error': 'Invalid action'}, status=400)

        if msg.status == GmailProcessedMessage.STATUS_APPROVED:
            return Response({'error': 'Already approved'}, status=400)

        # Allow caller to override parsed_tx fields before approving
        overrides = request.data or {}
        tx_row = dict(msg.raw.get('parsed_tx') or {})
        for field in ('account', 'direction', 'amount', 'transaction_type', 'tx_date', 'currency', 'fees', 'taxes',
                      'external_reference', 'classification', 'spend_category', 'affects_balance'):
            if field in overrides:
                tx_row[field] = overrides[field]

        val_row = msg.raw.get('parsed_valuation')
        tx_id = val_id = None

        # Create transaction
        if tx_row and tx_row.get('amount') and tx_row.get('direction') and tx_row.get('tx_date'):
            from ledger.models import Transaction as _Tx
            from decimal import Decimal, InvalidOperation
            try:
                ikey = tx_row.get('idempotency_key', '')
                if ikey and _Tx.objects.filter(household=household, idempotency_key=ikey).exists():
                    # Already in ledger — just mark approved
                    existing = _Tx.objects.filter(household=household, idempotency_key=ikey).first()
                    tx_id = existing.pk if existing else None
                else:
                    acc_pk = int(tx_row.get('account', 0))
                    acc = Account.objects.get(pk=acc_pk, household=household)
                    from gmail_ingestion.templates import RULE_TEMPLATES
                    template = RULE_TEMPLATES.get(msg.template_key or '', {})
                    classification = tx_row.get('classification') or template.get('classification', '')
                    spend_category = tx_row.get('spend_category') or (
                        template.get('default_spend_category', '') if classification == 'spend' else ''
                    )
                    created = _Tx.objects.create(
                        household=household,
                        account=acc,
                        tx_date=tx_row['tx_date'],
                        amount=Decimal(tx_row['amount']),
                        direction=tx_row['direction'],
                        transaction_type=tx_row.get('transaction_type', 'other'),
                        currency=tx_row.get('currency', 'INR'),
                        fees=Decimal(tx_row.get('fees', '0')),
                        taxes=Decimal(tx_row.get('taxes', '0')),
                        external_reference=tx_row.get('external_reference', ''),
                        idempotency_key=ikey,
                        source='api',
                        metadata=tx_row.get('_gmail_meta', {}),
                        classification=classification,
                        spend_category=spend_category,
                        affects_balance=bool(tx_row.get('affects_balance', True)),
                    )
                    tx_id = created.pk
            except (Account.DoesNotExist, InvalidOperation, Exception) as ex:
                return Response({'error': f'Failed to create transaction: {ex}'}, status=400)

        # Create valuation snapshot (for balance-type emails)
        if val_row:
            from valuations.models import ValuationSnapshot as _VS
            from decimal import Decimal as _D
            try:
                acc_pk = int(val_row.get('account_id', tx_row.get('account', 0)))
                acc = Account.objects.get(pk=acc_pk, household=household)
                vs, _ = _VS.objects.update_or_create(
                    household=household,
                    instrument=None,
                    account=acc,
                    valuation_date=val_row['valuation_date'],
                    defaults={
                        'balance': _D(val_row.get('balance', '0')),
                        'notes': val_row.get('notes', ''),
                        'source': 'api',
                    },
                )
                val_id = vs.pk
            except Exception as ex:
                return Response({'error': f'Failed to create valuation: {ex}'}, status=400)

        msg.status = GmailProcessedMessage.STATUS_APPROVED
        msg.imported_transaction_id = tx_id
        msg.imported_valuation_id = val_id
        msg.save(update_fields=['status', 'imported_transaction_id', 'imported_valuation_id'])
        return Response({**_serialize_staged(msg), 'transaction_id': tx_id, 'valuation_id': val_id})


class GmailStagedBulkApproveView(APIView):
    """Approve multiple staged transactions in one request."""
    permission_classes = [IsApprovedUser]

    def post(self, request):
        from gmail_ingestion.models import GmailProcessedMessage
        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role not in ('admin', 'super_admin'):
            return Response({'error': 'Not allowed'}, status=403)
        if not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        ids = request.data.get('ids') or []
        if not ids:
            return Response({'error': 'ids required'}, status=400)

        household = Household.objects.get(pk=profile.household_id)
        results = []
        for pk in ids:
            # Re-use the single-approve logic by delegating via a synthetic request
            try:
                msg = GmailProcessedMessage.objects.get(pk=pk, user=request.user, household=household)
            except GmailProcessedMessage.DoesNotExist:
                results.append({'id': pk, 'error': 'Not found'})
                continue
            if msg.status == GmailProcessedMessage.STATUS_APPROVED:
                results.append({'id': pk, 'status': 'already_approved'})
                continue

            view = GmailStagedActionView()
            view.request = request
            resp = view.post(request, pk=pk, action='approve')
            if resp.status_code == 200:
                results.append({'id': pk, 'status': 'approved', 'transaction_id': resp.data.get('transaction_id')})
            else:
                results.append({'id': pk, 'error': resp.data.get('error', 'Unknown error')})

        return Response({'results': results})


class GmailStagedBulkDeleteView(APIView):
    """Delete all staged transactions for the household, optionally filtered by status."""
    permission_classes = [IsApprovedUser]

    def post(self, request):
        from gmail_ingestion.models import GmailProcessedMessage
        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role not in ('admin', 'super_admin'):
            return Response({'error': 'Not allowed'}, status=403)
        if not profile.household_id:
            return Response({'error': 'No household selected'}, status=400)

        status_filter = request.data.get('status')  # optional: 'pending'|'approved'|'rejected'
        qs = GmailProcessedMessage.objects.filter(household_id=profile.household_id)
        if status_filter and status_filter in ('pending', 'approved', 'rejected'):
            qs = qs.filter(status=status_filter)
        deleted_count, _ = qs.delete()
        return Response({'deleted': deleted_count})

