import hashlib
import html
import json
import re
import secrets
import time
import urllib.parse
import urllib.request
from urllib.error import HTTPError, URLError
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.utils import timezone as dj_timezone

from core.integration_credentials import get_global_secret
from gmail_ingestion.models import GoogleCredential, GmailProcessedMessage, GmailSyncConfig
from gmail_ingestion.templates import detect_template, apply_template_regex, RULE_TEMPLATES, get_effective_templates, extract_fields, extract_fields_multiline, extract_instrument_proposal


GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'


def _json_request(url: str, method: str = 'GET', headers=None, data=None, timeout=20):
    req = urllib.request.Request(url, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    body = None
    if data is not None:
        body = json.dumps(data).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, data=body, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8')
            return json.loads(raw) if raw else {}
    except HTTPError as e:
        # Preserve Google error payload (often JSON with {error:{...}})
        try:
            raw = e.read().decode('utf-8')
        except Exception:
            raw = ''
        raise RuntimeError(f'HTTP {e.code} calling {url}: {raw or e.reason}') from e
    except URLError as e:
        raise RuntimeError(f'Network error calling {url}: {e.reason}') from e


def _form_request(url: str, data: dict, timeout=20):
    encoded = urllib.parse.urlencode(data).encode('utf-8')
    req = urllib.request.Request(url, data=encoded, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode('utf-8')
        return json.loads(raw) if raw else {}


def build_oauth_start_url(request) -> str:
    client_id = get_global_secret('google_oauth_client_id') or getattr(settings, 'SOCIAL_AUTH_GOOGLE_OAUTH2_KEY', '')
    if not client_id:
        raise ValueError('Missing SOCIAL_AUTH_GOOGLE_OAUTH2_KEY')

    state = secrets.token_urlsafe(24)
    request.session['gmail_oauth_state'] = state
    request.session['gmail_oauth_state_ts'] = int(time.time())

    redirect_uri = getattr(settings, 'GMAIL_OAUTH_REDIRECT_URI', 'http://localhost:8000/api/gmail/connect/callback')
    scope = ' '.join([
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
    ])

    params = {
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': scope,
        'access_type': 'offline',
        'prompt': 'consent',
        'include_granted_scopes': 'true',
        'state': state,
    }
    return f'{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}'


def exchange_code_for_tokens(code: str) -> dict:
    client_id = get_global_secret('google_oauth_client_id') or getattr(settings, 'SOCIAL_AUTH_GOOGLE_OAUTH2_KEY', '')
    client_secret = get_global_secret('google_oauth_client_secret') or getattr(settings, 'SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET', '')
    if not client_id or not client_secret:
        raise ValueError('Missing Google OAuth client settings')

    redirect_uri = getattr(settings, 'GMAIL_OAUTH_REDIRECT_URI', 'http://localhost:8000/api/gmail/connect/callback')
    return _form_request(GOOGLE_TOKEN_URL, {
        'code': code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code',
    })


def refresh_access_token(cred: GoogleCredential) -> str:
    client_id = get_global_secret('google_oauth_client_id') or getattr(settings, 'SOCIAL_AUTH_GOOGLE_OAUTH2_KEY', '')
    client_secret = get_global_secret('google_oauth_client_secret') or getattr(settings, 'SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET', '')
    if not client_id or not client_secret:
        raise ValueError('Missing Google OAuth client settings')
    if not cred.refresh_token:
        raise ValueError('No refresh token saved for this user')

    token = _form_request(GOOGLE_TOKEN_URL, {
        'client_id': client_id,
        'client_secret': client_secret,
        'refresh_token': cred.refresh_token,
        'grant_type': 'refresh_token',
    })
    access = token.get('access_token', '')
    expires_in = int(token.get('expires_in') or 0)
    if not access:
        raise ValueError('Failed to refresh access token')

    cred.access_token = access
    cred.token_type = token.get('token_type', '') or cred.token_type
    cred.scope = token.get('scope', '') or cred.scope
    cred.expires_at = dj_timezone.now() + timedelta(seconds=expires_in) if expires_in else None
    cred.save(update_fields=['access_token', 'token_type', 'scope', 'expires_at', 'updated_at'])
    return access


def _gmail_headers(payload: dict) -> dict:
    headers = {}
    for h in (payload.get('headers') or []):
        name = (h.get('name') or '').lower()
        value = h.get('value') or ''
        if name:
            headers[name] = value
    return headers


def list_messages(access_token: str, q: str, max_results: int = 500) -> list[dict]:
    """Fetch up to max_results messages, following Gmail pagination (nextPageToken)."""
    results = []
    page_token = None
    while len(results) < max_results:
        batch = min(500, max_results - len(results))
        params: dict = {'q': q, 'maxResults': batch}
        if page_token:
            params['pageToken'] = page_token
        data = _json_request(
            f'{GMAIL_API_BASE}/users/me/messages?{urllib.parse.urlencode(params)}',
            headers={'Authorization': f'Bearer {access_token}'},
        )
        results.extend(data.get('messages') or [])
        page_token = data.get('nextPageToken')
        if not page_token:
            break
    return results


def get_message(access_token: str, message_id: str) -> dict:
    params = urllib.parse.urlencode({
        'format': 'metadata',
        'metadataHeaders': ['From', 'To', 'Subject', 'Date'],
    }, doseq=True)
    url = f'{GMAIL_API_BASE}/users/me/messages/{urllib.parse.quote(message_id)}?{params}'
    return _json_request(url, headers={'Authorization': f'Bearer {access_token}'})


def get_message_full(access_token: str, message_id: str) -> dict:
    """Fetch full message including body parts (for field extraction in preview)."""
    url = f'{GMAIL_API_BASE}/users/me/messages/{urllib.parse.quote(message_id)}?format=full'
    return _json_request(url, headers={'Authorization': f'Bearer {access_token}'})


def _extract_body_text(payload: dict) -> str:
    """Recursively extract plain text from a MIME payload tree."""
    import base64 as _b64
    mime = payload.get('mimeType', '')
    if mime == 'text/plain':
        data = (payload.get('body') or {}).get('data', '')
        if data:
            try:
                return _b64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace')
            except Exception:
                pass
    if mime == 'text/html':
        data = (payload.get('body') or {}).get('data', '')
        if data:
            try:
                raw = _b64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace')
                # Collapse tags to spaces, preserve newlines from <br>/<p>/<div>
                raw = re.sub(r'<br\s*/?>', '\n', raw, flags=re.IGNORECASE)
                raw = re.sub(r'<(?:p|div|tr|li)[^>]*>', '\n', raw, flags=re.IGNORECASE)
                return re.sub(r'<[^>]+>', ' ', raw)
            except Exception:
                pass
    # Prefer text/plain part among multipart children, then fall back to first non-empty
    parts = payload.get('parts') or []
    plain = next((p for p in parts if p.get('mimeType') == 'text/plain'), None)
    if plain:
        text = _extract_body_text(plain)
        if text.strip():
            return text
    for part in parts:
        text = _extract_body_text(part)
        if text.strip():
            return text
    return ''


def _to_decimal(value: str) -> Decimal | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    s = s.replace(',', '').replace(' ', '')
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


# Common bank alert patterns (V1).
AMOUNT_RE = re.compile(r'(?:INR|Rs\.?|\u20B9)\s*([0-9][0-9,]*\.?[0-9]*)', re.IGNORECASE)
BALANCE_RE = re.compile(r'(?:avail(?:able)?\s*balance)\s*(?:is|:)?\s*(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*\.?[0-9]*)', re.IGNORECASE)


def _fetch_google_email(access_token: str) -> str:
    """Return the email address for the authenticated Google account."""
    try:
        data = _json_request(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {access_token}'},
        )
        return data.get('email') or ''
    except Exception:
        return ''


_CC_TEMPLATES = frozenset({
    'cc_transaction_alert', 'cc_spend_alert', 'bank_debit_cc',
    'cc_bill_payment', 'cc_bill_statement', 'cc_action_required',
})


def match_rule(
    account_rules: list[dict],
    from_header: str,
    text: str = '',
    to_header: str = '',
    extracted_fields: dict | None = None,
    template_key: str | None = None,
    household=None,
) -> int | None:
    """Return account_id for the first rule matching from_header (and optional filters).

    When template_key is a credit-card template, rules that map to a bank-type
    account are skipped so CC transactions are not booked to a savings account.
    A fallback pass runs without the account-type filter so something is always
    returned when no CC account rule exists.
    """
    from_lower = (from_header or '').lower()
    text_lower = (text or '').lower()
    to_lower = (to_header or '').lower()
    fields = extracted_fields or {}
    is_cc_template = template_key in _CC_TEMPLATES

    def _candidates():
        for rule in account_rules:
            sender = str(rule.get('sender') or '').strip().lower()
            account_id = rule.get('account_id')
            if not sender or not account_id:
                continue
            if sender.startswith('@'):
                sender_match = bool(sender[1:]) and (sender[1:] in from_lower)
            else:
                sender_match = sender in from_lower
            if not sender_match:
                continue
            keyword = str(rule.get('keyword') or '').strip().lower()
            if keyword and keyword not in text_lower:
                continue
            recipient = str(rule.get('recipient') or '').strip().lower()
            if recipient and recipient not in to_lower:
                continue
            rule_card_suffix = str(rule.get('card_suffix') or '').strip()
            if rule_card_suffix:
                extracted_card = (fields.get('card_suffix') or {}).get('value', '').strip()
                if not extracted_card:
                    extracted_card = (fields.get('account_suffix') or {}).get('value', '').strip()
                if rule_card_suffix not in extracted_card:
                    continue
            yield int(account_id)

    if not is_cc_template:
        for account_id in _candidates():
            return account_id
        return None

    # CC template: prefer credit_card accounts; fall back to any match
    from instruments.models import Account
    first_fallback = None
    for account_id in _candidates():
        if first_fallback is None:
            first_fallback = account_id
        try:
            acct = Account.objects.only('account_type').get(pk=account_id)
            if acct.account_type == 'credit_card':
                return account_id
        except Account.DoesNotExist:
            pass
    return first_fallback


def parse_message_to_rows(
    message: dict, account_id: int, account_name: str,
    template_key: str | None = None, direction_override: str | None = None,
    tx_type_override: str | None = None,
    custom_templates: dict | None = None,
) -> tuple[dict | None, dict | None]:
    """Returns (tx_row, valuation_row) where each is a dict suitable for universal_importer."""
    internal_ms = int(message.get('internalDate') or 0)
    tx_date = datetime.fromtimestamp(internal_ms / 1000, tz=timezone.utc).date().isoformat() if internal_ms else None

    payload = message.get('payload') or {}
    headers = _gmail_headers(payload)
    from_header = headers.get('from', '')
    subject = headers.get('subject', '')
    snippet = html.unescape(message.get('snippet') or '')
    text = f'{subject}\n{snippet}'

    # Use template-specific regex when available, fall back to generic patterns
    effective_tmpls = get_effective_templates(custom_templates)
    if template_key:
        amount = apply_template_regex(template_key, text, custom_templates=custom_templates)
        direction = direction_override or (effective_tmpls.get(template_key) or {}).get('direction') or 'outflow'
        tx_type = tx_type_override or (effective_tmpls.get(template_key) or {}).get('tx_type') or 'other'
    else:
        amount_match = AMOUNT_RE.search(text)
        amount = _to_decimal(amount_match.group(1)) if amount_match else None
        direction = direction_override or 'outflow'
        tx_type = tx_type_override or 'other'

    # For bank_balance template use its own regex (more precise); fallback to BALANCE_RE
    if template_key == 'bank_balance':
        balance = apply_template_regex('bank_balance', text, custom_templates=custom_templates)
    else:
        balance_match = BALANCE_RE.search(text)
        balance = _to_decimal(balance_match.group(1)) if balance_match else None

    tx_row = None
    # Balance-only templates (bank_balance) don't create transactions
    if direction and tx_date and amount and amount > 0 and template_key != 'bank_balance':
        digest = hashlib.sha1(f'{message.get("id","")}:{account_id}:{amount}'.encode('utf-8')).hexdigest()
        tx_row = {
            'tx_date': tx_date,
            'amount': str(amount),
            'direction': direction,
            'account': str(account_id),
            'transaction_type': tx_type,
            'currency': 'INR',
            'fees': '0',
            'taxes': '0',
            'external_reference': (subject or snippet or '').strip()[:120],
            'idempotency_key': f'gmail:{digest}',
            '_gmail_meta': {
                'gmail': {
                    'message_id': message.get('id', ''),
                    'from': from_header,
                    'to': _gmail_headers(message.get('payload') or {}).get('to', ''),
                    'subject': subject,
                    'snippet': snippet[:300],
                }
            },
        }

    valuation_row = None
    if tx_date and balance is not None:
        valuation_row = {
            'valuation_date': tx_date,
            'instrument_name': '',
            'account_name': account_name,
            'account_id': account_id,
            'balance': str(balance),
            'notes': (subject or '').strip()[:120],
        }

    return tx_row, valuation_row


@dataclass
class SyncResult:
    created_transactions: int = 0
    created_valuations: int = 0
    skipped_duplicates: int = 0
    errors: list[dict] = None

    def to_dict(self):
        return {
            'created_transactions': self.created_transactions,
            'created_valuations': self.created_valuations,
            'skipped_duplicates': self.skipped_duplicates,
            'errors': self.errors or [],
        }


def compute_suggestions(
    template_key: str | None,
    confidence: float | None,
    tx_row: dict | None,
    account_type: str = '',
) -> list[str]:
    """Return human-readable warnings/suggestions for a staged transaction."""
    suggestions = []
    if template_key is None:
        suggestions.append('No template matched — amount extracted by generic pattern')
    elif confidence is not None and confidence < 0.5:
        suggestions.append('Low confidence match — template only partially matched')
    if not tx_row or not tx_row.get('amount'):
        suggestions.append('No transaction amount found in email')
    if template_key == 'bank_balance':
        suggestions.append('Balance-only email — valuation snapshot will be created, no transaction')
    if template_key and template_key in _CC_TEMPLATES and account_type == 'bank':
        suggestions.append('Credit card email mapped to a bank account — verify the account mapping')
    return suggestions


def _sync_one_credential(*, cred: GoogleCredential, user, household, config: GmailSyncConfig, result: 'SyncResult'):
    """Fetch messages and write them to the staging queue (GmailProcessedMessage with status=pending)."""
    from instruments.models import Account

    access = refresh_access_token(cred)
    rules = config.account_rules or []
    custom_tmpls = config.custom_templates or {}
    excluded_senders = [s.lower().strip() for s in (config.excluded_senders or [])]

    now_ts = dj_timezone.now()
    if config.query_override.strip():
        q = config.query_override.strip()
    elif config.last_synced_at:
        q = f'after:{int(config.last_synced_at.timestamp())}'
    else:
        q = 'newer_than:7d'

    msg_refs = list_messages(access, q=q)

    for ref in msg_refs:
        msg_id = ref.get('id')
        if not msg_id:
            continue
        if GmailProcessedMessage.objects.filter(user=user, household=household, message_id=msg_id).exists():
            result.skipped_duplicates += 1
            continue
        try:
            msg = get_message(access, msg_id)
            payload = msg.get('payload') or {}
            headers = _gmail_headers(payload)
            from_header = headers.get('from', '')
            to_header = headers.get('to', '')
            subject = headers.get('subject', '')
            snippet = html.unescape(msg.get('snippet') or '')
            text = f'{subject}\n{snippet}'

            from_lower_sync = from_header.lower()
            if any(exc and exc in from_lower_sync for exc in excluded_senders):
                continue

            f1 = extract_fields(subject, snippet)
            f2 = extract_fields_multiline(snippet)
            email_fields = {**f1, **f2}
            tmpl_key, conf, _amt, _dir = detect_template(subject, snippet, from_header, custom_templates=custom_tmpls)
            account_id = match_rule(rules, from_header, text, to_header=to_header, extracted_fields=email_fields, template_key=tmpl_key, household=household)
            if not account_id:
                result.skipped_duplicates += 1
                continue

            account = Account.objects.get(pk=account_id, household=household)
            tx_row, val_row = parse_message_to_rows(msg, account_id=account_id, account_name=account.name, template_key=tmpl_key, custom_templates=custom_tmpls)

            suggestions = compute_suggestions(tmpl_key, conf, tx_row, account.account_type)

            if tx_row:
                status = GmailProcessedMessage.STATUS_PENDING
            elif val_row:
                status = GmailProcessedMessage.STATUS_VALUATION_ONLY
            else:
                status = GmailProcessedMessage.STATUS_PENDING

            raw = {'from': from_header, 'subject': subject, 'snippet': snippet}
            if tx_row:
                raw['parsed_tx'] = tx_row
            if val_row:
                raw['parsed_valuation'] = val_row

            GmailProcessedMessage.objects.create(
                user=user, household=household, message_id=msg_id,
                thread_id=msg.get('threadId', ''),
                internal_date_ms=int(msg.get('internalDate') or 0),
                raw=raw,
                status=status,
                confidence=conf,
                template_key=tmpl_key or '',
                suggestions=suggestions,
            )
            result.created_transactions += 1  # counts staged items
        except Exception as e:
            result.errors.append({'message_id': msg_id, 'error': str(e)})

    return now_ts


def run_sync(*, user, household, config: GmailSyncConfig) -> dict:
    credentials = list(GoogleCredential.objects.filter(user=user, refresh_token__gt=''))
    if not credentials:
        raise ValueError('No Gmail accounts connected for this user')

    rules = config.account_rules or []
    if not rules:
        return {**SyncResult(errors=[]).to_dict(), 'last_synced_at': config.last_synced_at}

    result = SyncResult(errors=[])
    latest_sync_ts = None

    for cred in credentials:
        try:
            ts = _sync_one_credential(
                cred=cred, user=user, household=household,
                config=config, result=result,
            )
            if latest_sync_ts is None or ts > latest_sync_ts:
                latest_sync_ts = ts
        except Exception as e:
            result.errors.append({'error': f'Credential {cred.email or cred.id}: {e}'})

    if latest_sync_ts:
        config.last_synced_at = latest_sync_ts
        config.save(update_fields=['last_synced_at', 'updated_at'])

    return {**result.to_dict(), 'last_synced_at': config.last_synced_at.isoformat() if config.last_synced_at else None}


# ---------------------------------------------------------------------------
# On-demand single-message field extraction
# ---------------------------------------------------------------------------

def fetch_message_fields(*, user, message_id: str, custom_templates: dict | None = None) -> dict:
    """
    Fetch one message's full body and return extracted structured fields.
    Called when the user expands an email row — not during bulk preview.
    """
    credentials = list(GoogleCredential.objects.filter(user=user, refresh_token__gt=''))
    if not credentials:
        raise ValueError('No Gmail accounts connected')

    for cred in credentials:
        try:
            access = refresh_access_token(cred)
            msg = get_message_full(access, message_id)
            payload = msg.get('payload') or {}
            headers = _gmail_headers(payload)
            from_header = headers.get('from', '')
            subject = headers.get('subject', '')
            body_text = html.unescape(_extract_body_text(payload))
            rich_text = body_text.strip() or html.unescape(msg.get('snippet') or '')

            fields = extract_fields(subject, rich_text)
            ml_fields = extract_fields_multiline(rich_text)
            fields = {**fields, **ml_fields}

            # Also detect template from full body
            tmpl_key, confidence, parsed_amount, direction = detect_template(subject, rich_text, sender=from_header, custom_templates=custom_templates)

            return {
                'fields': fields,
                'body_preview': rich_text[:600],
                'template_matched': tmpl_key,
                'confidence': confidence,
                'parsed_amount': str(parsed_amount) if parsed_amount else None,
            }
        except Exception:
            continue

    raise ValueError('Could not fetch message from any connected account')


# ---------------------------------------------------------------------------
# Preview (no DB writes)
# ---------------------------------------------------------------------------

def _subject_bucket(subject: str) -> str:
    """
    Normalise a subject line into a stable grouping bucket by replacing
    variable parts with placeholders, keeping the structural pattern readable.
    E.g. "INR 1,250.00 spent on Credit Card no. XX4521" -> "INR [amt] spent on Credit Card no. XX[####]"
    """
    import re as _re
    s = subject.strip()
    # Replace currency amounts with placeholder
    s = _re.sub(r'(?:INR|Rs\.?|₹)\s*[0-9][0-9,]*\.?[0-9]*', '[amt]', s, flags=_re.IGNORECASE)
    # Replace card/account last-4 digits (XX1234 or **1234)
    s = _re.sub(r'(?:XX|xx|\*{2,4})[0-9]{4}', 'XX[####]', s)
    # Replace standalone 4+ digit numbers (ref numbers, amounts without currency symbol)
    s = _re.sub(r'\b[0-9]{4,}\b', '[#]', s)
    # Replace dates like 15-05-2026, 15/05/26, May 15 2026
    s = _re.sub(r'\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b', '[date]', s)
    s = _re.sub(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b', '[date]', s, flags=_re.IGNORECASE)
    # Collapse whitespace
    s = _re.sub(r'\s+', ' ', s).strip()
    return s


def _extract_email(header: str) -> str:
    """Extract bare email address from a header like 'Name <email@domain.com>' or 'email@domain.com'."""
    import re as _re
    m = _re.search(r'<([^>]+)>', header)
    if m:
        return m.group(1).strip().lower()
    val = header.strip().lower()
    return val if '@' in val else ''


def _sender_domain(from_header: str) -> str:
    """Extract the domain part from a From header, e.g. 'alerts@axis.bank.in' -> 'axis.bank.in'."""
    import re as _re
    m = _re.search(r'<([^>]+)>', from_header)
    email = m.group(1) if m else from_header
    parts = email.strip().split('@')
    return parts[-1].lower() if len(parts) > 1 else email.lower()


def _sender_display(from_header: str) -> str:
    """Extract display name from From header, e.g. 'Axis Bank Alerts <...>' -> 'Axis Bank Alerts'."""
    import re as _re
    m = _re.match(r'^([^<]+)<', from_header)
    if m:
        return m.group(1).strip().strip('"')
    return from_header.split('@')[0].strip()


def fetch_preview(*, user, household, query: str, max_results: int = 500) -> dict:
    """
    Fetch emails from Gmail and group them by sender domain.
    Returns a structured preview with template detection and confidence scores.
    Does NOT write anything to the database.
    """
    from instruments.models import Account, Instrument

    credentials = list(GoogleCredential.objects.filter(user=user, refresh_token__gt=''))
    if not credentials:
        raise ValueError('No Gmail accounts connected for this user')

    imported_ids = set(
        GmailProcessedMessage.objects.filter(user=user, household=household)
        .values_list('message_id', flat=True)
    )

    # Collect all existing rules, custom templates and exclusion lists
    config = GmailSyncConfig.objects.filter(user=user, household=household).first()
    existing_rules = (config.account_rules or []) if config else []
    custom_tmpls = (config.custom_templates or {}) if config else {}
    excluded_senders = [s.lower().strip() for s in ((config.excluded_senders or []) if config else [])]

    # Build account suffix lookup: last-4-digits -> account_id for auto-mapping
    account_suffix_map: dict[str, int] = {}
    for acct in Account.objects.filter(household=household, is_active=True):
        digits = ''.join(c for c in acct.name if c.isdigit())
        if len(digits) >= 4:
            account_suffix_map[digits[-4:]] = acct.id

    # Track existing instruments by name (normalised) for proposal deduplication
    existing_instrument_names: set[str] = set(
        Instrument.objects.filter(household=household)
        .values_list('name', flat=True)
    )

    # Accumulate instrument proposals keyed by scheme_name
    instrument_proposals: dict[str, dict] = {}

    # key: (domain, to_normalised, subject_bucket) -> group dict
    groups: dict[tuple, dict] = {}
    total_fetched = 0
    all_recipients: dict[str, str] = {}  # normalised_email -> display label
    # Track first message_id per group and the access token used to fetch it
    group_sample_access: dict[tuple, tuple[str, str]] = {}  # group_key -> (message_id, access_token)

    for cred in credentials:
        try:
            access = refresh_access_token(cred)
        except Exception:
            continue

        msg_refs = list_messages(access, q=query, max_results=max_results)
        total_fetched += len(msg_refs)

        for ref in msg_refs:
            msg_id = ref.get('id')
            if not msg_id:
                continue
            try:
                msg = get_message(access, msg_id)
                payload = msg.get('payload') or {}
                headers = _gmail_headers(payload)
                from_header = headers.get('from', '')
                to_header = headers.get('to', '')
                subject = headers.get('subject', '')
                snippet = html.unescape(msg.get('snippet') or '')
                internal_ms = int(msg.get('internalDate') or 0)
                date_str = datetime.fromtimestamp(internal_ms / 1000, tz=timezone.utc).date().isoformat() if internal_ms else ''

                # Skip emails from excluded senders
                from_lower = from_header.lower()
                if any(exc and exc in from_lower for exc in excluded_senders):
                    continue

                domain = _sender_domain(from_header)
                display = _sender_display(from_header)

                tmpl_key, confidence, parsed_amount, direction = detect_template(subject, snippet, sender=from_header, custom_templates=custom_tmpls)

                # Inline field extraction from subject+snippet (fast path)
                fields = extract_fields(subject, snippet)
                ml_fields = extract_fields_multiline(snippet)
                fields = {**fields, **ml_fields}

                # Normalise To header to a canonical email address for grouping
                to_normalised = _extract_email(to_header)
                if to_normalised:
                    all_recipients[to_normalised] = to_header.strip()

                # Find matching existing rule (if any), respecting all filter fields
                existing_rule = None
                text_for_rule = f'{subject}\n{snippet}'
                for rule in existing_rules:
                    matched_id = match_rule(
                        [rule], from_header, text_for_rule,
                        to_header=to_header, extracted_fields=fields,
                        template_key=tmpl_key,
                    )
                    if matched_id:
                        existing_rule = rule
                        break

                # Auto-match account from extracted account_suffix or card_suffix
                auto_account_id: int | None = None
                suffix_field = fields.get('account_suffix')
                if suffix_field:
                    suffix_val = suffix_field['value'].strip()[-4:]
                    auto_account_id = account_suffix_map.get(suffix_val)
                if not auto_account_id:
                    card_field = fields.get('card_suffix')
                    if card_field:
                        card_val = card_field['value'].strip()[-4:]
                        auto_account_id = account_suffix_map.get(card_val)

                # Collect instrument proposal for MF emails
                proposal = extract_instrument_proposal(fields)
                if proposal:
                    scheme = proposal['scheme_name']
                    if scheme not in instrument_proposals:
                        exists_in_db = scheme in existing_instrument_names
                        instrument_proposals[scheme] = {
                            **proposal,
                            'exists': exists_in_db,
                            'message_ids': [],
                        }
                    instrument_proposals[scheme]['message_ids'].append(msg_id)

                email_row = {
                    'message_id': msg_id,
                    'date': date_str,
                    'from': from_header,
                    'to': to_header,
                    'subject': subject,
                    'snippet': snippet[:200],
                    'parsed': {
                        'amount': str(parsed_amount) if parsed_amount else None,
                        'direction': direction,
                        'template_matched': tmpl_key,
                    },
                    'extracted_fields': fields,
                    'auto_account_id': auto_account_id,
                    'existing_rule': existing_rule,
                    'already_imported': msg_id in imported_ids,
                }

                subj_bucket = _subject_bucket(subject)
                group_key = (domain, to_normalised or '', subj_bucket)

                if group_key not in groups:
                    groups[group_key] = {
                        'group_key': f'{domain}|{to_normalised or ""}|{subj_bucket}',
                        'sender_domain': domain,
                        'sender_display': display,
                        'recipient': to_normalised or '',
                        'subject_bucket': subj_bucket,
                        'scheme_name': None,
                        'detected_template': tmpl_key,
                        'confidence': confidence,
                        'suggested_rule': {
                            'sender': f'@{domain}',
                            'account_id': existing_rule.get('account_id') if existing_rule else None,
                            'keyword': existing_rule.get('keyword') if existing_rule else None,
                            'template': existing_rule.get('template') if existing_rule else tmpl_key,
                            'recipient': existing_rule.get('recipient') if existing_rule else (to_normalised or None),
                            'card_suffix': (existing_rule.get('card_suffix') if existing_rule
                                            else (fields.get('card_suffix') or {}).get('value', '').strip()[-4:] or None),
                        },
                        'emails': [],
                        '_conf_sum': confidence,
                        '_conf_count': 1,
                        '_recipients': set(),
                    }
                    # Store sample message for later full-body fetch on instrument groups
                    group_sample_access[group_key] = (msg_id, access)
                else:
                    g = groups[group_key]
                    g['_conf_sum'] += confidence
                    g['_conf_count'] += 1
                    g['confidence'] = round(g['_conf_sum'] / g['_conf_count'], 3)
                    if confidence > g['confidence'] and tmpl_key:
                        g['detected_template'] = tmpl_key
                        if not g['suggested_rule'].get('account_id') and existing_rule:
                            g['suggested_rule']['account_id'] = existing_rule.get('account_id')

                if to_normalised:
                    groups[group_key]['_recipients'].add(to_normalised)
                groups[group_key]['emails'].append(email_row)

            except Exception:
                # Skip individual message errors in preview mode
                continue

    # For instrument-target groups, fetch full email bodies for ALL emails in the group.
    # This extracts fund/scheme names so we can sub-group by instrument (e.g. Jupiter SIPs
    # send one email per fund with the same subject pattern but different fund names in the body).
    instrument_tmpl_keys = {k for k, v in get_effective_templates(custom_tmpls).items() if v.get('target') == 'instrument'}
    groups_to_split: list[tuple] = []  # group_keys that need fund-level splitting

    for group_key, g in list(groups.items()):
        detected = g.get('detected_template')
        if detected not in instrument_tmpl_keys:
            continue
        _, sample_access = group_sample_access.get(group_key, (None, None))
        if not sample_access:
            continue

        # Fetch full body for every email in this group and extract scheme_name
        fund_emails: dict[str, list] = {}   # scheme_name -> [email_row, ...]
        fund_proposals: dict[str, dict] = {}  # scheme_name -> proposal dict
        unclassified_emails: list = []

        for email_row in g['emails']:
            msg_id = email_row['message_id']
            try:
                full_msg = get_message_full(sample_access, msg_id)
                full_payload = full_msg.get('payload') or {}
                full_headers = _gmail_headers(full_payload)
                full_subject = full_headers.get('subject', '')
                full_body = html.unescape(_extract_body_text(full_payload))
                rich = full_body.strip() or html.unescape(full_msg.get('snippet') or '')
                full_fields = extract_fields(full_subject, rich)
                ml_fields = extract_fields_multiline(rich)
                full_fields = {**full_fields, **ml_fields}

                proposal = extract_instrument_proposal(full_fields)
                if proposal:
                    scheme = proposal['scheme_name']
                    fund_emails.setdefault(scheme, []).append(email_row)
                    if scheme not in fund_proposals:
                        fund_proposals[scheme] = proposal
                    # Refine template detection with full body
                    full_tmpl_key, full_conf, _, _ = detect_template(
                        full_subject, rich, sender=full_headers.get('from', ''), custom_templates=custom_tmpls
                    )
                    if full_conf > g.get('confidence', 0) and full_tmpl_key:
                        g['detected_template'] = full_tmpl_key
                        g['confidence'] = full_conf
                        g['suggested_rule']['template'] = full_tmpl_key
                else:
                    unclassified_emails.append(email_row)
            except Exception:
                unclassified_emails.append(email_row)

        # Register instrument proposals
        for scheme, proposal in fund_proposals.items():
            if scheme not in instrument_proposals:
                instrument_proposals[scheme] = {
                    **proposal,
                    'exists': scheme in existing_instrument_names,
                    'message_ids': [e['message_id'] for e in fund_emails[scheme]],
                }
            else:
                instrument_proposals[scheme]['message_ids'].extend(
                    e['message_id'] for e in fund_emails[scheme]
                    if e['message_id'] not in instrument_proposals[scheme]['message_ids']
                )

        if len(fund_emails) <= 1:
            # Only one fund (or none) — keep the group as-is, no split needed
            # Just add scheme_name to the group for display if exactly one fund found
            if len(fund_emails) == 1:
                g['scheme_name'] = next(iter(fund_emails))
            continue

        # Multiple funds detected → split this group into per-fund sub-groups
        groups_to_split.append(group_key)
        base_key_str = g['group_key']
        base_suggested = g['suggested_rule'].copy()
        base_recipients = g.get('_recipients', set())
        base_detected = g.get('detected_template')
        base_confidence = g.get('confidence', 0.0)

        for scheme, emails in fund_emails.items():
            safe_scheme = re.sub(r'[^a-z0-9]', '_', scheme.lower())[:40]
            sub_group_key_tuple = group_key + (safe_scheme,)
            sub_group_key_str = f'{base_key_str}|fund:{safe_scheme}'
            groups[sub_group_key_tuple] = {
                'group_key': sub_group_key_str,
                'sender_domain': g['sender_domain'],
                'sender_display': g['sender_display'],
                'recipient': g['recipient'],
                'subject_bucket': g['subject_bucket'],
                'scheme_name': scheme,
                'detected_template': base_detected,
                'confidence': base_confidence,
                'suggested_rule': base_suggested.copy(),
                'emails': emails,
                '_conf_sum': base_confidence,
                '_conf_count': 1,
                '_recipients': base_recipients.copy(),
            }

        # Add unclassified emails (body fetch failed) back to a catch-all sub-group
        if unclassified_emails:
            catch_key_tuple = group_key + ('_unclassified',)
            groups[catch_key_tuple] = {
                'group_key': f'{base_key_str}|fund:_unclassified',
                'sender_domain': g['sender_domain'],
                'sender_display': g['sender_display'],
                'recipient': g['recipient'],
                'subject_bucket': g['subject_bucket'],
                'scheme_name': None,
                'detected_template': base_detected,
                'confidence': base_confidence,
                'suggested_rule': base_suggested.copy(),
                'emails': unclassified_emails,
                '_conf_sum': base_confidence,
                '_conf_count': 1,
                '_recipients': base_recipients.copy(),
            }

    # Remove original groups that were split into fund sub-groups
    for gk in groups_to_split:
        groups.pop(gk, None)

    # Clean up internal accounting fields and sort
    result_groups = []
    for g in groups.values():
        g.pop('_conf_sum', None)
        g.pop('_conf_count', None)
        recipients_set = g.pop('_recipients', set())
        g['recipients'] = sorted(recipients_set)  # list of normalised To addresses for this group
        g['email_count'] = len(g['emails'])
        g['already_imported_count'] = sum(1 for e in g['emails'] if e['already_imported'])
        g['sample_subjects'] = list({e['subject'] for e in g['emails'] if e['subject']})[:5]
        # Sort emails newest first
        g['emails'].sort(key=lambda e: e['date'], reverse=True)
        result_groups.append(g)

    # Sort groups by email count descending
    result_groups.sort(key=lambda g: g['email_count'], reverse=True)

    unmatched = sum(
        1 for g in result_groups
        if not g.get('detected_template') and g.get('confidence', 0) < 0.3
    )

    # Build recipient list: [{email, label}] sorted by email
    recipients_list = [
        {'email': email, 'label': label}
        for email, label in sorted(all_recipients.items())
    ]

    # Build reverse map: message_id -> to_normalised, from result_groups
    msg_to_recipient: dict[str, str] = {}
    for g in result_groups:
        recip = g.get('recipient', '')
        for email in g.get('emails', []):
            mid = email.get('message_id', '')
            if mid and recip:
                msg_to_recipient[mid] = recip

    # Finalise instrument proposals list (convert message_ids set to count)
    proposals_list = []
    for scheme, p in instrument_proposals.items():
        msg_ids = p.get('message_ids', [])
        proposal_recipients = list({msg_to_recipient[m] for m in msg_ids if m in msg_to_recipient and msg_to_recipient[m]})
        proposals_list.append({
            'scheme_name': p['scheme_name'],
            'folio_no': p.get('folio_no'),
            'instrument_type': p.get('instrument_type', 'mutual_fund'),
            'nav': p.get('nav'),
            'units': p.get('units'),
            'exists': p.get('exists', False),
            'email_count': len(msg_ids),
            'recipients': proposal_recipients,
        })

    # Groups with auto_account_id: promote to suggested_rule if no existing rule
    for g in result_groups:
        for email in g['emails']:
            if email.get('auto_account_id') and not g['suggested_rule'].get('account_id'):
                g['suggested_rule']['account_id'] = email['auto_account_id']
                break

    return {
        'groups': result_groups,
        'total_fetched': total_fetched,
        'unmatched_count': unmatched,
        'recipients': recipients_list,
        'instrument_proposals': proposals_list,
    }
