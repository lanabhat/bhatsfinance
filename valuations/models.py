from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

from core.models import TimeStampedModel


class ValuationSnapshot(TimeStampedModel):
    class SourceType(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        CSV = 'csv', 'CSV'
        API = 'api', 'API'

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='valuations')
    valuation_date = models.DateField()
    account = models.ForeignKey(
        'instruments.Account',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='valuation_snapshots',
    )
    instrument = models.ForeignKey(
        'instruments.Instrument',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='valuation_snapshots',
    )
    unit_price = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    market_value = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    source = models.CharField(max_length=10, choices=SourceType.choices, default=SourceType.MANUAL)
    notes = models.TextField(blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['household', 'valuation_date']),
            models.Index(fields=['instrument', 'valuation_date']),
            models.Index(fields=['account', 'valuation_date']),
        ]
        ordering = ['-valuation_date', '-id']

    def clean(self) -> None:
        if not self.instrument_id and not self.account_id:
            raise ValidationError('Either instrument or account must be set.')
        if self.instrument_id and self.account_id:
            raise ValidationError('Set only one of instrument or account.')

    def __str__(self) -> str:
        return f'{self.household_id} {self.valuation_date}'

class NetWorthSnapshot(TimeStampedModel):
    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='networth_snapshots')
    snapshot_date = models.DateField()
    total_assets = models.DecimalField(max_digits=18, decimal_places=2)
    total_liabilities = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    net_worth = models.DecimalField(max_digits=18, decimal_places=2)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = ('household', 'snapshot_date')
        ordering = ['-snapshot_date']

    def __str__(self) -> str:
        return f'{self.household_id} {self.snapshot_date} ₹{self.net_worth}'

# Create your models here.
