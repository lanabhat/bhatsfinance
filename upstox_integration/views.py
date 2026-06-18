from datetime import datetime, timedelta, timezone

from django.conf import settings
from django.http import HttpResponseRedirect
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsApprovedUser
from upstox_integration.models import UpstoxCredential
from upstox_integration.services import (
    build_oauth_start_url,
    exchange_code_for_tokens,
    fetch_upstox_profile,
    sync_upstox_holdings,
)


def _frontend_redirect_url(error: str = '') -> str:
    base = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5173').rstrip('/')
    suffix = f'?upstox_error={error}' if error else ''
    return f'{base}/#/settings{suffix}'


def _client_configured() -> bool:
    return bool(getattr(settings, 'UPSTOX_CLIENT_ID', ''))


class UpstoxStatusView(APIView):
    permission_classes = [IsApprovedUser]

    def get(self, request):
        creds = UpstoxCredential.objects.filter(user=request.user).select_related('member')
        return Response({
            'client_configured': _client_configured(),
            'connected_accounts': [
                {
                    'id': c.id,
                    'label': c.label or c.email or c.upstox_user_id,
                    'email': c.email,
                    'member_id': c.member_id,
                    'member_name': c.member.full_name if c.member else None,
                }
                for c in creds
            ],
        })


class UpstoxConnectStartView(APIView):
    permission_classes = [IsApprovedUser]

    def get(self, request):
        if not _client_configured():
            return Response({'error': 'Upstox client not configured — add UPSTOX_CLIENT_ID to .env'}, status=400)
        # Optionally store member_id in session to associate after callback
        member_id = request.query_params.get('member_id')
        if member_id:
            request.session['upstox_member_id'] = int(member_id)
        url = build_oauth_start_url(request)
        return HttpResponseRedirect(url)


class UpstoxCallbackView(APIView):
    # AllowAny because Upstox redirects here; session auth still validates the user
    permission_classes = []

    def get(self, request):
        if not request.user or not request.user.is_authenticated:
            return HttpResponseRedirect(_frontend_redirect_url('not_authenticated'))

        expected = request.session.get('upstox_oauth_state')
        actual = request.query_params.get('state')
        code = request.query_params.get('code')

        if not expected or not actual or expected != actual or not code:
            return HttpResponseRedirect(_frontend_redirect_url('invalid_state'))

        try:
            token_data = exchange_code_for_tokens(code)
        except Exception:
            return HttpResponseRedirect(_frontend_redirect_url('token_exchange_failed'))

        access_token = token_data.get('access_token', '')
        refresh_token = token_data.get('refresh_token', '')
        expires_in = token_data.get('expires_in')

        expires_at = None
        if expires_in:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

        # Fetch Upstox profile to get user ID and email
        upstox_user_id = ''
        email = ''
        if access_token:
            try:
                profile = fetch_upstox_profile(access_token)
                upstox_user_id = profile.get('user_id', '') or profile.get('upstox_user_id', '')
                email = profile.get('email', '')
            except Exception:
                pass

        # Find member from session (set by connect start)
        member = None
        member_id = request.session.pop('upstox_member_id', None)
        if member_id:
            from core.models import Member
            profile_obj = getattr(request.user, 'profile', None)
            if profile_obj and profile_obj.household_id:
                member = Member.objects.filter(pk=member_id, household_id=profile_obj.household_id).first()

        # Update existing credential for this upstox_user_id, or create new
        cred, _ = UpstoxCredential.objects.update_or_create(
            user=request.user,
            upstox_user_id=upstox_user_id or email or 'unknown',
            defaults={
                'email': email,
                'label': email,
                'access_token': access_token,
                'refresh_token': refresh_token,
                'expires_at': expires_at,
                'member': member,
            },
        )

        return HttpResponseRedirect(_frontend_redirect_url())


class UpstoxDisconnectView(APIView):
    permission_classes = [IsApprovedUser]

    def post(self, request):
        credential_id = request.data.get('credential_id')
        if credential_id:
            UpstoxCredential.objects.filter(user=request.user, pk=int(credential_id)).delete()
        return Response({'status': 'disconnected'})


class UpstoxSyncView(APIView):
    permission_classes = [IsApprovedUser]

    def post(self, request):
        credential_id = request.data.get('credential_id')
        if credential_id:
            creds = UpstoxCredential.objects.filter(user=request.user, pk=int(credential_id))
        else:
            creds = UpstoxCredential.objects.filter(user=request.user)

        if not creds.exists():
            return Response({'error': 'No Upstox account connected'}, status=400)

        all_results = []
        for cred in creds:
            try:
                result = sync_upstox_holdings(cred)
                result['label'] = cred.label or cred.email
                all_results.append(result)
            except Exception as e:
                all_results.append({'label': cred.label or cred.email, 'error': str(e)})

        return Response(all_results)


class UpstoxUpdateMemberView(APIView):
    """Allow updating which household member a credential belongs to."""
    permission_classes = [IsApprovedUser]

    def patch(self, request, pk):
        try:
            cred = UpstoxCredential.objects.get(pk=pk, user=request.user)
        except UpstoxCredential.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        member_id = request.data.get('member_id')
        if member_id:
            from core.models import Member
            profile_obj = getattr(request.user, 'profile', None)
            if profile_obj and profile_obj.household_id:
                member = Member.objects.filter(pk=member_id, household_id=profile_obj.household_id).first()
                cred.member = member
                cred.save(update_fields=['member', 'updated_at'])

        return Response({'id': cred.id, 'member_id': cred.member_id})
