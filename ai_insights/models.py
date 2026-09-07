from django.db import models

from core.models import TimeStampedModel


class FundClassification(TimeStampedModel):
    """Cached result of classifying one MF instrument via the Gemini API. Only
    (re)generated when the user clicks Refresh — never on a schedule or page load."""

    class Bucket(models.TextChoices):
        EQUITY = 'equity', 'Equity'
        DEBT = 'debt', 'Debt'
        HYBRID = 'hybrid', 'Hybrid'

    class Rule6040Category(models.TextChoices):
        GROWTH = 'growth', 'Growth (60%)'
        STABILITY = 'stability', 'Stability (40%)'

    instrument = models.OneToOneField('instruments.Instrument', on_delete=models.CASCADE, related_name='ai_classification')
    bucket = models.CharField(max_length=20, choices=Bucket.choices)
    rule_60_40_category = models.CharField(max_length=20, choices=Rule6040Category.choices)
    reasoning = models.TextField(blank=True)
    model_used = models.CharField(max_length=60)
    generated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f'{self.instrument.name} -> {self.bucket}/{self.rule_60_40_category}'


class FundReturnsComparison(TimeStampedModel):
    """Cached plain-English comparison of one fund's returns against similar funds
    in the same household, generated via the Gemini API on manual refresh only."""

    instrument = models.OneToOneField('instruments.Instrument', on_delete=models.CASCADE, related_name='ai_returns_comparison')
    summary = models.TextField()
    input_snapshot = models.JSONField(help_text='The exact XIRR/expense-ratio figures sent to Gemini, for auditability.')
    model_used = models.CharField(max_length=60)
    generated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f'Returns comparison for {self.instrument.name}'


class RebalancingExplanation(TimeStampedModel):
    """Cached plain-English explanation of one household's rebalancing picture
    (from compute_rebalancing()), generated via the Gemini API on manual refresh only."""

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='ai_rebalancing_explanations')
    as_of_date = models.DateField()
    explanation = models.TextField()
    input_snapshot = models.JSONField(help_text='The compute_rebalancing() rows sent to Gemini, for auditability.')
    model_used = models.CharField(max_length=60)
    generated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('household', 'as_of_date')

    def __str__(self) -> str:
        return f'Rebalancing explanation for household {self.household_id} @ {self.as_of_date}'
