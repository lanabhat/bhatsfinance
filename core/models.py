from django.contrib.auth import get_user_model
from django.db import models

from core.fields import EncryptedTextField


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Household(TimeStampedModel):
    name = models.CharField(max_length=120)
    base_currency = models.CharField(max_length=3, default='INR')

    def __str__(self) -> str:
        return self.name


class Member(TimeStampedModel):
    class RelationType(models.TextChoices):
        SELF = 'self', 'Self'
        SPOUSE = 'spouse', 'Spouse'
        CHILD = 'child', 'Child'
        PARENT = 'parent', 'Parent'
        OTHER = 'other', 'Other'

    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='members')
    full_name = models.CharField(max_length=120)
    email = models.EmailField(blank=True)
    relation_type = models.CharField(max_length=20, choices=RelationType.choices, default=RelationType.SELF)
    is_active = models.BooleanField(default=True)
    include_in_networth = models.BooleanField(
        default=True,
        help_text="If false, this member's share of holdings/accounts is excluded from household net worth calculations.",
    )
    photo = models.TextField(
        blank=True,
        help_text='Data URI (base64) of the member photo, e.g. "data:image/jpeg;base64,...".',
    )

    class Meta:
        unique_together = ('household', 'full_name')
        ordering = ['full_name']

    def __str__(self) -> str:
        return f'{self.full_name} ({self.household.name})'


class UserProfile(TimeStampedModel):
    class Role(models.TextChoices):
        SUPER_ADMIN = 'super_admin', 'Super Admin'
        ADMIN = 'admin', 'Admin'
        VIEWER = 'viewer', 'Viewer'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        DENIED = 'denied', 'Denied'

    user = models.OneToOneField(get_user_model(), on_delete=models.CASCADE, related_name='profile')
    household = models.ForeignKey('Household', on_delete=models.SET_NULL, null=True, blank=True, related_name='user_profiles')
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    google_email = models.EmailField(blank=True)
    google_picture = models.URLField(max_length=500, blank=True)
    photo = models.TextField(
        blank=True,
        help_text='Data URI (base64) of the uploaded profile photo; takes precedence over google_picture when set.',
    )

    def __str__(self):
        return f'{self.google_email or self.user.email} ({self.role}/{self.status})'


class IntegrationCredential(TimeStampedModel):
    """
    Encrypted secret storage for integrations (Gmail, etc.).

    Notes:
    - Values are encrypted at rest via EncryptedTextField.
    - "scope" controls whether the secret is global/household/user specific.
    """

    class Scope(models.TextChoices):
        GLOBAL = 'global', 'Global'
        HOUSEHOLD = 'household', 'Household'
        USER = 'user', 'User'

    key = models.CharField(max_length=120)
    scope = models.CharField(max_length=20, choices=Scope.choices, default=Scope.GLOBAL)
    household = models.ForeignKey('Household', on_delete=models.CASCADE, null=True, blank=True, related_name='integration_credentials')
    user = models.ForeignKey(get_user_model(), on_delete=models.CASCADE, null=True, blank=True, related_name='integration_credentials')
    value = EncryptedTextField(blank=True)
    description = models.TextField(blank=True)

    class Meta:
        unique_together = ('key', 'scope', 'household', 'user')
        indexes = [
            models.Index(fields=['key', 'scope']),
        ]

    def __str__(self) -> str:
        return f'{self.key} [{self.scope}]'
