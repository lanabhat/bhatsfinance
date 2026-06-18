"""
Upstox OAuth2 helpers and portfolio sync service.

Upstox OAuth2 docs: https://upstox.com/developer/api-documentation/
"""
import json
import secrets
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from django.conf import settings


# ---------------------------------------------------------------------------
# OAuth helpers
# ---------------------------------------------------------------------------

UPSTOX_AUTH_URL = 'https://api.upstox.com/v2/login/authorization/dialog'
UPSTOX_TOKEN_URL = 'https://api.upstox.com/v2/login/authorization/token'
UPSTOX_HOLDINGS_URL = 'https://api.upstox.com/v2/portfolio/long-term-holdings'
UPSTOX_PROFILE_URL = 'https://api.upstox.com/v2/user/get-profile'


def _get_client_id() -> str:
    return getattr(settings, 'UPSTOX_CLIENT_ID', '')


def _get_client_secret() -> str:
    return getattr(settings, 'UPSTOX_CLIENT_SECRET', '')


def _get_redirect_uri() -> str:
    default = getattr(settings, 'BACKEND_BASE_URL', 'http://localhost:8000').rstrip('/')
    return getattr(settings, 'UPSTOX_REDIRECT_URI', f'{default}/api/upstox/callback')


def build_oauth_start_url(request) -> str:
    state = secrets.token_urlsafe(24)
    request.session['upstox_oauth_state'] = state
    params = {
        'client_id': _get_client_id(),
        'redirect_uri': _get_redirect_uri(),
        'state': state,
        'response_type': 'code',
    }
    return f'{UPSTOX_AUTH_URL}?{urllib.parse.urlencode(params)}'


def exchange_code_for_tokens(code: str) -> dict:
    data = urllib.parse.urlencode({
        'code': code,
        'client_id': _get_client_id(),
        'client_secret': _get_client_secret(),
        'redirect_uri': _get_redirect_uri(),
        'grant_type': 'authorization_code',
    }).encode()
    req = urllib.request.Request(
        UPSTOX_TOKEN_URL,
        data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def refresh_access_token(refresh_token: str) -> dict:
    data = urllib.parse.urlencode({
        'refresh_token': refresh_token,
        'client_id': _get_client_id(),
        'client_secret': _get_client_secret(),
        'grant_type': 'refresh_token',
    }).encode()
    req = urllib.request.Request(
        UPSTOX_TOKEN_URL,
        data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def _get_valid_access_token(cred) -> str:
    """Return a valid access token, refreshing if expired."""
    now = datetime.now(timezone.utc)
    if cred.expires_at and cred.expires_at <= now and cred.refresh_token:
        token_data = refresh_access_token(cred.refresh_token)
        cred.access_token = token_data.get('access_token', '')
        if token_data.get('refresh_token'):
            cred.refresh_token = token_data['refresh_token']
        if token_data.get('expires_in'):
            from datetime import timedelta
            cred.expires_at = now + timedelta(seconds=int(token_data['expires_in']))
        cred.save(update_fields=['access_token', 'refresh_token', 'expires_at', 'updated_at'])
    return cred.access_token


def fetch_upstox_profile(access_token: str) -> dict:
    req = urllib.request.Request(
        UPSTOX_PROFILE_URL,
        headers={'Authorization': f'Bearer {access_token}', 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    return data.get('data', data)


def fetch_upstox_holdings(access_token: str) -> list:
    req = urllib.request.Request(
        UPSTOX_HOLDINGS_URL,
        headers={'Authorization': f'Bearer {access_token}', 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    return data.get('data', [])


# ---------------------------------------------------------------------------
# Holdings sync
# ---------------------------------------------------------------------------

def sync_upstox_holdings(cred) -> dict:
    """
    Fetch holdings from Upstox and upsert into the Finance DB.
    Creates Instrument (equity), InstrumentOwnership, ValuationSnapshot,
    and an initial buy Transaction if none exists.
    """
    from datetime import date
    from decimal import Decimal
    from django.db import transaction as db_tx
    from instruments.models import Instrument, InstrumentOwnership
    from valuations.models import ValuationSnapshot
    from ledger.models import Transaction

    access_token = _get_valid_access_token(cred)
    holdings = fetch_upstox_holdings(access_token)

    household = cred.user.profile.household
    member = cred.member
    today = date.today()

    created = 0
    updated = 0
    errors = []

    for h in holdings:
        try:
            with db_tx.atomic():
                isin = h.get('isin', '') or ''
                name = h.get('company_name', '') or isin
                if not name:
                    continue

                quantity = Decimal(str(h.get('quantity', 0) or 0))
                avg_price = Decimal(str(h.get('average_price', 0) or 0))
                last_price = Decimal(str(h.get('last_price', 0) or 0))
                close_price = Decimal(str(h.get('close_price', 0) or last_price))
                market_value = quantity * close_price if close_price else None
                buy_value = quantity * avg_price if avg_price else None

                instrument, inst_created = Instrument.objects.get_or_create(
                    household=household,
                    name=name,
                    defaults={'instrument_type': 'equity', 'symbol': isin},
                )

                if member:
                    InstrumentOwnership.objects.get_or_create(
                        instrument=instrument,
                        member=member,
                        defaults={'allocation_percent': Decimal('100')},
                    )

                ValuationSnapshot.objects.update_or_create(
                    household=household,
                    instrument=instrument,
                    account=None,
                    valuation_date=today,
                    defaults={
                        'unit_price': close_price if close_price else None,
                        'market_value': market_value,
                        'source': 'api',
                    },
                )

                if not Transaction.objects.filter(instrument=instrument, household=household).exists():
                    if buy_value and buy_value > 0:
                        Transaction.objects.create(
                            household=household,
                            instrument=instrument,
                            account=None,
                            member=member,
                            tx_date=today,
                            amount=buy_value,
                            quantity=quantity if quantity > 0 else None,
                            price_per_unit=avg_price if avg_price > 0 else None,
                            direction='inflow',
                            transaction_type='buy',
                            currency='INR',
                            source='api',
                        )

                if inst_created:
                    created += 1
                else:
                    updated += 1
        except Exception as e:
            errors.append({'isin': h.get('isin', ''), 'name': h.get('company_name', ''), 'reason': str(e)})

    return {'holdings_synced': created + updated, 'new_instruments': created, 'errors': errors}
