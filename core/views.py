from django.contrib.auth import logout as auth_logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Household, IntegrationCredential, Member, UserProfile
from core.permissions import IsApprovedUser, IsSuperAdmin
from core.serializers import HouseholdSerializer, IntegrationCredentialSerializer, MemberSerializer, UserProfileSerializer


class HouseholdViewSet(viewsets.ModelViewSet):
    queryset = Household.objects.all()
    serializer_class = HouseholdSerializer


class MemberViewSet(viewsets.ModelViewSet):
    queryset = Member.objects.select_related('household').all()
    serializer_class = MemberSerializer
    filterset_fields = ['household', 'relation_type', 'is_active']


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'detail': 'CSRF cookie set'})


class MeView(APIView):
    """Returns current user info. Any authenticated user can call this (even pending)."""
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user or not request.user.is_authenticated:
            return Response({'authenticated': False}, status=401)
        profile = getattr(request.user, 'profile', None)
        return Response(_me_payload(request.user, profile=profile))


def _me_payload(user, *, profile=None) -> dict:
    profile = profile if profile is not None else getattr(user, 'profile', None)
    return {
        'authenticated': True,
        'id': user.id,
        'email': user.email,
        'name': user.get_full_name() or (profile.google_email if profile else ''),
        'picture': profile.google_picture if profile else '',
        'role': profile.role if profile else 'viewer',
        'status': profile.status if profile else 'pending',
        'household_id': profile.household_id if profile else None,
    }


class LogoutView(APIView):
    """Log out the current user."""
    permission_classes = [AllowAny]

    def post(self, request):
        auth_logout(request)
        return Response({'detail': 'Logged out'})


class SelectHouseholdView(APIView):
    """
    Persist the user's currently selected household (session auth).

    Guardrail: only admin/super_admin can switch households from the UI.
    """
    permission_classes = [IsApprovedUser]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.role not in (UserProfile.Role.ADMIN, UserProfile.Role.SUPER_ADMIN):
            return Response({'error': 'Not allowed'}, status=403)

        household_id = (request.data or {}).get('household_id')
        try:
            household_id = int(household_id)
        except Exception:
            return Response({'error': 'household_id is required'}, status=400)

        household = Household.objects.filter(pk=household_id).first()
        if not household:
            return Response({'error': 'Household not found'}, status=400)

        profile.household = household
        profile.save(update_fields=['household', 'updated_at'])

        return Response(_me_payload(request.user, profile=profile))


class UserAdminViewSet(viewsets.ModelViewSet):
    """User management — super_admin only."""
    permission_classes = [IsSuperAdmin]
    serializer_class = UserProfileSerializer
    queryset = UserProfile.objects.select_related('user', 'household').order_by('created_at')
    http_method_names = ['get', 'patch', 'head', 'options']


class IntegrationCredentialViewSet(viewsets.ModelViewSet):
    """
    Encrypted integration secrets management (super_admin only).

    Note: the secret value is write-only and never returned decrypted.
    """
    permission_classes = [IsSuperAdmin]
    serializer_class = IntegrationCredentialSerializer
    queryset = IntegrationCredential.objects.select_related('household', 'user').order_by('key', 'scope', 'id')
    filterset_fields = ['key', 'scope', 'household', 'user']
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']
