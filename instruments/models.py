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
        BOND = 'bond', 'Bond'
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

    class SubCategory(models.TextChoices):
        DEBT = 'debt', 'Debt'
        EQUITY = 'equity', 'Equity'
        LIQUID = 'liquid', 'Liquid'
        RETIREMENT = 'retirement', 'Retirement'
        HYBRID = 'hybrid', 'Hybrid'
        GOLD = 'gold', 'Gold'
        REAL_ASSET = 'real_asset', 'Real Asset'
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
    sub_category = models.CharField(
        max_length=20, choices=SubCategory.choices, blank=True,
        help_text='Cross-cutting risk/liquidity classification (e.g. Debt, Equity, Retirement) — '
                  'independent of instrument_type, so holdings of different types can be grouped '
                  'together (e.g. FD + EPF + Debt mutual funds all as "Debt").',
    )
    symbol = models.CharField(max_length=32, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    include_in_rebalancing = models.BooleanField(
        default=True,
        help_text="Uncheck to exclude this holding from allocation targets and rebalancing "
                  "suggestions (e.g. an emergency-fund FD or an heirloom asset you don't want "
                  "to rebalance).",
    )

    class Meta:
        unique_together = ('household', 'name')
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class FDDetails(TimeStampedModel):
    """One fixed-deposit investment under an Instrument — an Instrument (e.g.
    "HDFC Bank FD") can hold several of these (different deposits opened at
    different times/rates), each auto-computing its own current value."""

    class Compounding(models.TextChoices):
        SIMPLE = 'simple', 'Simple Interest'
        MONTHLY = 'monthly', 'Monthly'
        QUARTERLY = 'quarterly', 'Quarterly'
        HALF_YEARLY = 'half_yearly', 'Half-Yearly'
        ANNUALLY = 'annually', 'Annually'

    instrument = models.ForeignKey(Instrument, on_delete=models.CASCADE, related_name='fd_details')
    funding_transaction = models.OneToOneField(
        'ledger.Transaction', on_delete=models.SET_NULL, null=True, blank=True, related_name='fd_details',
        help_text='The buy/deposit Transaction that funded this FD, if recorded through the app.',
    )
    account_number = models.CharField(
        max_length=60, blank=True,
        help_text='Bank FD account/receipt number — used to detect a duplicate import of the same deposit.',
    )
    principal = models.DecimalField(max_digits=18, decimal_places=2)
    annual_rate = models.DecimalField(max_digits=6, decimal_places=4, help_text='Annual interest rate as percentage, e.g. 7.5')
    investment_date = models.DateField()
    maturity_date = models.DateField()
    compounding = models.CharField(max_length=20, choices=Compounding.choices, default=Compounding.QUARTERLY)
    maturity_value = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True, help_text='Bank-stated maturity value if known')

    def __str__(self) -> str:
        return f'{self.instrument.name} FD @ {self.annual_rate}%'


class BondDetails(TimeStampedModel):
    """Fixed-income bond details — coupon schedule and maturity, for computing
    current value and generating coupon-due reminders."""

    class CouponFrequency(models.TextChoices):
        MONTHLY = 'monthly', 'Monthly'
        QUARTERLY = 'quarterly', 'Quarterly'
        HALF_YEARLY = 'half_yearly', 'Half-Yearly'
        ANNUAL = 'annual', 'Annual'
        CUMULATIVE = 'cumulative', 'Cumulative (paid at maturity)'

    class BondType(models.TextChoices):
        GOVERNMENT = 'government', 'Government Bond'
        CORPORATE = 'corporate', 'Corporate Bond'
        TAX_FREE = 'tax_free', 'Tax-Free Bond'
        SGB = 'sgb', 'Sovereign Gold Bond'
        NCD = 'ncd', 'NCD'
        OTHER = 'other', 'Other'

    instrument = models.ForeignKey(Instrument, on_delete=models.CASCADE, related_name='bond_details')
    funding_transaction = models.OneToOneField(
        'ledger.Transaction', on_delete=models.SET_NULL, null=True, blank=True, related_name='bond_details',
        help_text='The buy Transaction that funded this bond investment, if recorded through the app.',
    )
    issuer_name = models.CharField(max_length=200, blank=True)
    bond_type = models.CharField(max_length=20, choices=BondType.choices, default=BondType.OTHER)
    isin = models.CharField(max_length=20, blank=True)
    face_value = models.DecimalField(max_digits=18, decimal_places=2, help_text='Face value per unit, or total invested amount for a single holding')
    quantity = models.PositiveIntegerField(default=1, help_text='Number of units held, if applicable')
    coupon_rate = models.DecimalField(max_digits=6, decimal_places=4, help_text='Annual coupon rate as percentage, e.g. 7.75')
    coupon_frequency = models.CharField(max_length=20, choices=CouponFrequency.choices, default=CouponFrequency.ANNUAL)
    investment_date = models.DateField()
    maturity_date = models.DateField()
    first_coupon_date = models.DateField(
        null=True, blank=True,
        help_text='First coupon due date, if different from one period after investment_date',
    )
    grace_days = models.PositiveSmallIntegerField(default=15)
    maturity_value = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True, help_text='Issuer-stated redemption value if known')
    credit_rating = models.CharField(max_length=20, blank=True, help_text='e.g. AAA, AA+')
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return f'{self.instrument.name} bond @ {self.coupon_rate}%'


class BondCouponAck(TimeStampedModel):
    """Acknowledgement that a bond coupon payment was received/verified outside the ledger.

    Suppresses the coupon-due reminder for the corresponding due date without
    creating a Transaction (e.g. credited to an untracked account, or already
    recorded elsewhere).
    """

    bond = models.ForeignKey(BondDetails, on_delete=models.CASCADE, related_name='coupon_acks')
    due_date = models.DateField()
    acknowledged_on = models.DateField()
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = ('bond', 'due_date')
        ordering = ['-due_date']

    def __str__(self) -> str:
        return f'{self.bond.instrument.name} coupon {self.due_date}'


class InstrumentOwnership(TimeStampedModel):
    instrument = models.ForeignKey(Instrument, on_delete=models.CASCADE, related_name='ownerships')
    member = models.ForeignKey('core.Member', on_delete=models.CASCADE, related_name='instrument_ownerships')
    allocation_percent = models.DecimalField(max_digits=5, decimal_places=2, default=100)

    class Meta:
        unique_together = ('instrument', 'member')


class Investment(TimeStampedModel):
    """One specific holding under a shared type-level Instrument shell — e.g.
    "TCS" or "Parag Parikh Flexi Cap (folio 123)" under the household's single
    "Equity" or "Mutual Fund" Instrument. Exists so the same shell instrument
    can hold many distinct stocks/funds, each with its own owner, without
    needing a separate Instrument row per stock/fund (which made "who owns
    this" and "which broker" instrument-level facts instead of per-holding
    facts). Household is reached via instrument.household, not duplicated
    here. No cached quantity/value — those stay derived from Transaction/
    ValuationSnapshot rows exactly as they are for Instrument-level holdings.
    """

    instrument = models.ForeignKey(Instrument, on_delete=models.CASCADE, related_name='investments')
    member = models.ForeignKey(
        'core.Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='investments',
        help_text='Who owns this specific holding — the per-holding equivalent of InstrumentOwnership.',
    )
    name = models.CharField(max_length=200, help_text='e.g. company/ticker name for equity, scheme name for a fund')
    symbol = models.CharField(max_length=32, blank=True, help_text='Ticker (equity) or AMFI code (mutual fund)')
    isin = models.CharField(max_length=20, blank=True)
    folio_no = models.CharField(max_length=60, blank=True, help_text='Mutual fund folio number')
    is_active = models.BooleanField(default=True)

    class Meta:
        # member is part of identity, not just a label — two members can
        # each hold the same-named stock (no natural folio to disambiguate
        # equity the way MF folios do), and NULL member values (the
        # genuinely-ambiguous multi-owner case 0015's MF migration leaves
        # unset) are treated as distinct by the DB, so this doesn't collide
        # with existing member=None rows.
        unique_together = ('instrument', 'name', 'folio_no', 'member')
        ordering = ['name']

    def __str__(self) -> str:
        return f'{self.name} ({self.instrument.name})'


class MutualFundDetails(TimeStampedModel):
    """Structured mutual-fund detail fields, promoted out of Instrument.metadata JSON.

    Keyed to Investment (one specific scheme/folio), not Instrument — the
    household's mutual funds all share one "Mutual Fund" Instrument shell, so
    AMC/category/expense-ratio are per-Investment facts, not per-Instrument."""

    investment = models.OneToOneField('Investment', on_delete=models.CASCADE, related_name='mf_details')
    amc = models.CharField(max_length=120, blank=True)
    fund_category = models.CharField(max_length=80, blank=True, help_text='e.g. Equity, Debt, Hybrid')
    fund_sub_category = models.CharField(max_length=80, blank=True, help_text='e.g. Large Cap, Flexi Cap')
    expense_ratio = models.DecimalField(
        max_digits=5, decimal_places=3, null=True, blank=True,
        help_text='Total expense ratio (TER) as a percentage, e.g. 0.450. From the fund factsheet.',
    )

    def __str__(self) -> str:
        return f'{self.investment.name} ({self.amc})'


class AllocationTarget(TimeStampedModel):
    """User-defined target allocation percentage per AssetCategory, used for rebalancing."""

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='allocation_targets')
    asset_category = models.ForeignKey(AssetCategory, on_delete=models.CASCADE, related_name='allocation_targets')
    target_percent = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        unique_together = ('household', 'asset_category')
        ordering = ['asset_category__sort_order']

    def __str__(self) -> str:
        return f'{self.asset_category.name} target {self.target_percent}%'


class FundHoldingsSnapshot(TimeStampedModel):
    """One monthly portfolio-disclosure upload for an MF/equity holding, giving its
    stock-level composition as of a specific date — used for overlap/diversification analysis.

    Keyed to Investment (one specific fund), not Instrument — the shared
    "Mutual Fund"/"Equity" shell can't distinguish whose portfolio disclosure this is."""

    investment = models.ForeignKey('Investment', on_delete=models.CASCADE, related_name='holdings_snapshots', null=True, blank=True)
    as_of_date = models.DateField()
    source_url = models.URLField(blank=True, max_length=500, help_text='Where you downloaded this from, for next time.')
    uploaded_file_name = models.CharField(max_length=255, blank=True)

    class Meta:
        unique_together = ('investment', 'as_of_date')
        ordering = ['-as_of_date']

    def __str__(self) -> str:
        return f'{self.investment.name} holdings @ {self.as_of_date}'


class FundHolding(TimeStampedModel):
    """One stock position within a FundHoldingsSnapshot, parsed from the AMC's monthly
    portfolio disclosure (ISIN, instrument name, industry, % to Net Assets)."""

    snapshot = models.ForeignKey(FundHoldingsSnapshot, on_delete=models.CASCADE, related_name='holdings')
    isin = models.CharField(max_length=20, blank=True)
    instrument_name = models.CharField(max_length=200)
    industry = models.CharField(max_length=120, blank=True)
    weight_percent = models.DecimalField(max_digits=7, decimal_places=4)

    class Meta:
        ordering = ['-weight_percent']

    def __str__(self) -> str:
        return f'{self.instrument_name} ({self.weight_percent}%)'

# Create your models here.
