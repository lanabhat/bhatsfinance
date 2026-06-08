from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsApprovedUser(BasePermission):
    """
    Approved users get full read access.
    Write access (POST/PATCH/PUT/DELETE) requires admin or super_admin role.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        profile = getattr(request.user, 'profile', None)
        if not profile or profile.status != 'approved':
            return False
        if request.method in SAFE_METHODS:
            return True
        return profile.role in ('admin', 'super_admin')


class IsSuperAdmin(BasePermission):
    """Only super_admin role can access."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role == 'super_admin' and profile.status == 'approved')
