from decimal import Decimal

from django.db import models

from core.models import TimeStampedModel


class TaxRecord(TimeStampedModel):
    class RecordType(models.TextChoices):
        PAID = 'paid', 'Tax Paid'
        TDS = 'tds', 'TDS'
        REFUND = 'refund', 'Refund'

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='tax_records')
    member = models.ForeignKey('core.Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='tax_records')
    transaction_date = models.DateField()
    financial_year = models.CharField(max_length=9, help_text='Example: 2025-26')
    record_type = models.CharField(max_length=20, choices=RecordType.choices)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-transaction_date']


class TaxProjection(TimeStampedModel):
    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='tax_projections')
    member = models.ForeignKey('core.Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='tax_projections')
    financial_year = models.CharField(max_length=9)
    projected_total_income = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    declared_deductions = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    projected_tax = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = ('household', 'member', 'financial_year')

# Create your models here.
