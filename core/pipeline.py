from django.conf import settings
from core.models import Household, UserProfile


def create_user_profile(backend, user, response, *args, **kwargs):
    """PSA pipeline step: create/update UserProfile after Google OAuth."""
    profile, created = UserProfile.objects.get_or_create(user=user)
    email = response.get('email', '') or user.email
    superadmin_emails = getattr(settings, 'SUPERADMIN_EMAILS', [])
    update_fields = []

    if created:
        profile.google_email = email
        profile.google_picture = response.get('picture', '')
        if not profile.household_id:
            profile.household = Household.objects.order_by('id').first()
        update_fields += ['google_email', 'google_picture', 'household']
    elif not profile.google_picture and response.get('picture'):
        profile.google_picture = response.get('picture', '')
        update_fields.append('google_picture')

    # Re-check on every login: an email added to SUPERADMIN_EMAILS after the
    # account already existed should still be promoted, not stuck as pending/viewer.
    if email in superadmin_emails and (profile.role != UserProfile.Role.SUPER_ADMIN or profile.status != UserProfile.Status.APPROVED):
        profile.role = UserProfile.Role.SUPER_ADMIN
        profile.status = UserProfile.Status.APPROVED
        update_fields += ['role', 'status']

    if update_fields:
        profile.save(update_fields=list(dict.fromkeys(update_fields)))
