from django.db import models

from core.models import TimeStampedModel


class ExternalFund(TimeStampedModel):
    """A mutual fund scheme tracked via mfapi.in's NAV history, linked to an MF
    Instrument the user actually holds. Linking is a deliberate manual step (the
    user picks the matching scheme from a search) — never automatic fuzzy-matching,
    since a wrong match would silently poison every downstream risk metric."""

    instrument = models.OneToOneField('instruments.Instrument', on_delete=models.CASCADE, related_name='external_fund')
    mfapi_scheme_code = models.CharField(max_length=20, unique=True)
    scheme_name = models.CharField(max_length=255, help_text='As returned by mfapi.in, for display/debugging mismatches.')
    fund_house = models.CharField(max_length=120, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f'{self.instrument.name} -> mfapi #{self.mfapi_scheme_code}'


class ExternalFundNav(TimeStampedModel):
    fund = models.ForeignKey(ExternalFund, on_delete=models.CASCADE, related_name='nav_history')
    nav_date = models.DateField()
    nav = models.DecimalField(max_digits=14, decimal_places=4)

    class Meta:
        unique_together = ('fund', 'nav_date')
        indexes = [models.Index(fields=['fund', 'nav_date'])]
        ordering = ['nav_date']

    def __str__(self) -> str:
        return f'{self.fund_id} @ {self.nav_date}: {self.nav}'


class BenchmarkFund(TimeStampedModel):
    """A Nifty-tracking index fund used as the alpha/beta benchmark proxy — there is
    no clean free live API for the raw Nifty 50/500 index itself, so a direct-plan
    index fund's NAV (which tracks the index closely by construction) stands in.
    Stated as such in the UI, never presented as the raw index.

    category_match lets a fund be compared against the index that actually tracks
    its market-cap segment (a mid-cap fund against Nifty Midcap 150, not Nifty 50)
    instead of forcing every fund onto one generic large-cap proxy."""

    class CategoryMatch(models.TextChoices):
        LARGE_CAP = 'large_cap', 'Large Cap'
        MID_CAP = 'mid_cap', 'Mid Cap'
        SMALL_CAP = 'small_cap', 'Small Cap'
        FLEXI_CAP_BROAD_MARKET = 'flexi_cap_broad_market', 'Flexi Cap / Broad Market'

    name = models.CharField(max_length=120, help_text='e.g. "Nifty 50 (via UTI Nifty 50 Index Fund)"')
    mfapi_scheme_code = models.CharField(max_length=20, unique=True)
    category_match = models.CharField(max_length=30, choices=CategoryMatch.choices, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.name


class BenchmarkFundNav(TimeStampedModel):
    benchmark = models.ForeignKey(BenchmarkFund, on_delete=models.CASCADE, related_name='nav_history')
    nav_date = models.DateField()
    nav = models.DecimalField(max_digits=14, decimal_places=4)

    class Meta:
        unique_together = ('benchmark', 'nav_date')
        indexes = [models.Index(fields=['benchmark', 'nav_date'])]
        ordering = ['nav_date']

    def __str__(self) -> str:
        return f'{self.benchmark_id} @ {self.nav_date}: {self.nav}'
