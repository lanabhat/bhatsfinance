from django.db import models

from core.models import TimeStampedModel


class Account(TimeStampedModel):
    class AccountType(models.TextChoices):
        BANK = 'bank', 'Bank'
        BROKER = 'broker', 'Broker'
        PF = 'pf', 'Provident Fund'
        LOAN = 'loan', 'Loan'
        CREDIT_CARD = 'credit_card', 'Credit Card'
        INSURANCE = 'insurance', 'Insurance'
        CASH = 'cash', 'Cash'
        OTHER = 'other', 'Other'

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='accounts')
    name = models.CharField(max_length=150)
    account_type = models.CharField(max_length=30, choices=AccountType.choices)
    institution_name = models.CharField(max_length=150, blank=True)
    primary_member = models.ForeignKey(
        'core.Member',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='primary_accounts',
    )
    opening_balance = models.DecimalField(max_digits=18, decimal_places=2, default=0,
                                          help_text='Starting balance when this account was added')
    credit_limit = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True,
                                       help_text='Credit card spending limit')
    statement_due_day = models.PositiveSmallIntegerField(null=True, blank=True,
                                                         help_text='Day of month when credit card bill is due (1-28)')
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('household', 'name')
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class AccountOwnership(TimeStampedModel):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='ownerships')
    member = models.ForeignKey('core.Member', on_delete=models.CASCADE, related_name='account_ownerships')
    allocation_percent = models.DecimalField(max_digits=5, decimal_places=2, default=100)

    class Meta:
        unique_together = ('account', 'member')


class AssetCategory(TimeStampedModel):
    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='asset_categories')
    name = models.CharField(max_length=80)
    color = models.CharField(max_length=7, default='#94a3b8', help_text='Hex color e.g. #0ea5e9')
    icon_name = models.CharField(max_length=40, blank=True, help_text='Icon key e.g. shield')
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        unique_together = ('household', 'name')
        ordering = ['sort_order', 'name']

    def __str__(self) -> str:
        return f'{self.name} ({self.household.name})'


class Instrument(TimeStampedModel):
    class InstrumentType(models.TextChoices):
        CASH = 'cash', 'Cash'
        EQUITY = 'equity', 'Equity'
        MUTUAL_FUND = 'mutual_fund', 'Mutual Fund'
        SIP = 'sip', 'SIP'
        FD = 'fd', 'Fixed Deposit'
        RD = 'rd', 'Recurring Deposit'
        EPF = 'epf', 'EPF'
        PPF = 'ppf', 'PPF'
        NPS = 'nps', 'NPS'
        REAL_ESTATE = 'real_estate', 'Real Estate'
        GOLD = 'gold', 'Gold'
        VEHICLE = 'vehicle', 'Vehicle'
        LIABILITY = 'liability', 'Liability'
        INSURANCE = 'insurance', 'Insurance'
        LENDING = 'lending', 'Lending (Loan Given)'
        OTHER = 'other', 'Other'

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='instruments')
    asset_category = models.ForeignKey(
        'AssetCategory',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='instruments',
    )
    default_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='default_instruments',
    )
    name = models.CharField(max_length=200)
    instrument_type = models.CharField(max_length=30, choices=InstrumentType.choices)
    symbol = models.CharField(max_length=32, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('household', 'name')
        ordering = ['name']
        constraints = [
            # Prevents the same FD account number from being entered twice
            # under a different instrument name/owner — symbol holds the bank
            # account number for FDs, and the (household, name) uniqueness
            # above doesn't catch this because the two rows can have
            # different names. Scoped to FD only (other instrument types use
            # symbol differently, e.g. ISIN) and to non-blank symbol so
            # multiple manually-added FDs without an account number don't
            # collide with each other.
            models.UniqueConstraint(
                fields=['household', 'symbol'],
                condition=models.Q(instrument_type='fd') & ~models.Q(symbol=''),
                name='unique_fd_account_number_per_household',
            ),
        ]

    def __str__(self) -> str:
        return self.name


class FDDetails(TimeStampedModel):
    """Fixed-income instrument details for auto-computing current value."""

    class Compounding(models.TextChoices):
        SIMPLE = 'simple', 'Simple Interest'
        MONTHLY = 'monthly', 'Monthly'
        QUARTERLY = 'quarterly', 'Quarterly'
        HALF_YEARLY = 'half_yearly', 'Half-Yearly'
        ANNUALLY = 'annually', 'Annually'

    instrument = models.OneToOneField(Instrument, on_delete=models.CASCADE, related_name='fd_details')
    principal = models.DecimalField(max_digits=18, decimal_places=2)
    annual_rate = models.DecimalField(max_digits=6, decimal_places=4, help_text='Annual interest rate as percentage, e.g. 7.5')
    investment_date = models.DateField()
    maturity_date = models.DateField()
    compounding = models.CharField(max_length=20, choices=Compounding.choices, default=Compounding.QUARTERLY)
    maturity_value = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True, help_text='Bank-stated maturity value if known')

    def __str__(self) -> str:
        return f'{self.instrument.name} FD @ {self.annual_rate}%'


class InstrumentOwnership(TimeStampedModel):
    instrument = models.ForeignKey(Instrument, on_delete=models.CASCADE, related_name='ownerships')
    member = models.ForeignKey('core.Member', on_delete=models.CASCADE, related_name='instrument_ownerships')
    allocation_percent = models.DecimalField(max_digits=5, decimal_places=2, default=100)

    class Meta:
        unique_together = ('instrument', 'member')

# Create your models here.
