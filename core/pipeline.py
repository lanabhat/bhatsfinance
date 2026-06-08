from django.conf import settings
from core.models import Household, UserProfile


def create_user_profile(backend, user, response, *args, **kwargs):
    """PSA pipeline step: create/update UserProfile after Google OAuth."""
    profile, created = UserProfile.objects.get_or_create(user=user)
    if created:
        email = response.get('email', '') or user.email
        profile.google_email = email
        profile.google_picture = response.get('picture', '')
        if not profile.household_id:
            profile.household = Household.objects.order_by('id').first()
        superadmin_emails = getattr(settings, 'SUPERADMIN_EMAILS', [])
        if email in superadmin_emails:
            profile.role = UserProfile.Role.SUPER_ADMIN
            profile.status = UserProfile.Status.APPROVED
        profile.save()
    elif not profile.google_picture and response.get('picture'):
        # Update picture on subsequent logins
        profile.google_picture = response.get('picture', '')
        profile.save(update_fields=['google_picture'])
