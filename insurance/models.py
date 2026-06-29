from django.db import models

from core.models import TimeStampedModel


class InsurancePolicy(TimeStampedModel):
    class PolicyType(models.TextChoices):
        LIFE = 'life', 'Life'
        HEALTH = 'health', 'Health'
        VEHICLE = 'vehicle', 'Vehicle'
        GOVT_SCHEME = 'govt_scheme', 'Government Scheme'
        OTHER = 'other', 'Other'

    class PremiumFrequency(models.TextChoices):
        ANNUAL = 'annual', 'Annual'
        HALF_YEARLY = 'half_yearly', 'Half-Yearly'
        QUARTERLY = 'quarterly', 'Quarterly'
        MONTHLY = 'monthly', 'Monthly'
        SINGLE = 'single', 'Single Premium'
        NA = 'na', 'N/A'

    class VehicleType(models.TextChoices):
        CAR = 'car', 'Car'
        TWO_WHEELER = 'two_wheeler', 'Two-Wheeler'
        OTHER = 'other', 'Other'

    class CoverageType(models.TextChoices):
        COMPREHENSIVE = 'comprehensive', 'Comprehensive'
        THIRD_PARTY = 'third_party', 'Third Party'
        OWN_DAMAGE = 'own_damage', 'Own Damage'

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='insurance_policies')
    member = models.ForeignKey('core.Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='insurance_policies')
    nominee_name = models.CharField(max_length=100, blank=True)
    nominee_relation = models.CharField(max_length=50, blank=True)

    policy_type = models.CharField(max_length=20, choices=PolicyType.choices)
    policy_subtype = models.CharField(max_length=50, blank=True)
    policy_name = models.CharField(max_length=200)
    policy_number = models.CharField(max_length=100, blank=True)
    insurer_name = models.CharField(max_length=200, blank=True)

    sum_insured = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    premium_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    premium_frequency = models.CharField(max_length=20, choices=PremiumFrequency.choices, default=PremiumFrequency.ANNUAL)
    premium_due_day = models.PositiveSmallIntegerField(null=True, blank=True)
    premium_due_month = models.PositiveSmallIntegerField(null=True, blank=True)

    start_date = models.DateField()
    maturity_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    grace_days = models.PositiveSmallIntegerField(default=30)
    is_active = models.BooleanField(default=True)
    is_employer_paid = models.BooleanField(default=False)

    account = models.ForeignKey('instruments.Account', on_delete=models.SET_NULL, null=True, blank=True, related_name='insurance_policies')
    notes = models.TextField(blank=True)

    # Health-specific
    is_family_floater = models.BooleanField(default=False)
    covered_members = models.ManyToManyField('core.Member', blank=True, related_name='covered_by_policies')

    # Vehicle-specific
    vehicle_instrument = models.ForeignKey('instruments.Instrument', on_delete=models.SET_NULL, null=True, blank=True, related_name='vehicle_insurance_policies')
    vehicle_type = models.CharField(max_length=20, choices=VehicleType.choices, blank=True)
    coverage_type = models.CharField(max_length=20, choices=CoverageType.choices, blank=True)
    idv_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    ncb_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    add_on_covers = models.TextField(blank=True)

    class Meta:
        ordering = ['policy_type', 'policy_name']

    def __str__(self):
        return f'{self.policy_name} ({self.get_policy_type_display()})'


class VehicleClaim(TimeStampedModel):
    class Status(models.TextChoices):
        FILED = 'filed', 'Filed'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        SETTLED = 'settled', 'Settled'

    policy = models.ForeignKey(InsurancePolicy, on_delete=models.CASCADE, related_name='vehicle_claims')
    claim_date = models.DateField()
    description = models.CharField(max_length=200)
    claim_amount = models.DecimalField(max_digits=18, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.FILED)
    settled_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-claim_date']


class InsurancePremiumAck(TimeStampedModel):
    """Acknowledgement that a premium due-date was paid outside the ledger.

    Suppresses missed-premium alerts for the corresponding due date without
    creating a Transaction (e.g. paid from an untracked account).
    """

    policy = models.ForeignKey(InsurancePolicy, on_delete=models.CASCADE, related_name='premium_acks')
    due_date = models.DateField()
    acknowledged_on = models.DateField()
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = ('policy', 'due_date')
        ordering = ['-due_date']
