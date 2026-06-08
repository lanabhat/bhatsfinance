from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

from core.models import TimeStampedModel


class Transaction(TimeStampedModel):
    class Direction(models.TextChoices):
        INFLOW = 'inflow', 'Inflow'
        OUTFLOW = 'outflow', 'Outflow'

    class TransactionType(models.TextChoices):
        DEPOSIT = 'deposit', 'Deposit'
        WITHDRAWAL = 'withdrawal', 'Withdrawal'
        BUY = 'buy', 'Buy'
        SELL = 'sell', 'Sell'
        DIVIDEND = 'dividend', 'Dividend'
        INTEREST = 'interest', 'Interest'
        SALARY = 'salary', 'Salary'
        TAX_PAYMENT = 'tax_payment', 'Tax Payment'
        TAX_REFUND = 'tax_refund', 'Tax Refund'
        EMI = 'emi', 'EMI'
        LOAN_DISBURSAL = 'loan_disbursal', 'Loan Disbursal'
        PREMIUM = 'premium', 'Insurance Premium'
        CC_BILL_PAYMENT = 'cc_bill_payment', 'CC Bill Payment'
        OTHER = 'other', 'Other'

    class SourceType(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        CSV = 'csv', 'CSV'
        API = 'api', 'API'

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='transactions')
    member = models.ForeignKey('core.Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    account = models.ForeignKey('instruments.Account', on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    instrument = models.ForeignKey(
        'instruments.Instrument',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions',
    )
    tx_date = models.DateField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    quantity = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    price_per_unit = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    fees = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    taxes = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    currency = models.CharField(max_length=3, default='INR')
    direction = models.CharField(max_length=10, choices=Direction.choices)
    transaction_type = models.CharField(max_length=30, choices=TransactionType.choices)
    source = models.CharField(max_length=10, choices=SourceType.choices, default=SourceType.MANUAL)
    external_reference = models.CharField(max_length=120, blank=True)
    idempotency_key = models.CharField(max_length=120, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Classification(models.TextChoices):
        SPEND = 'spend', 'Spend'
        INCOME = 'income', 'Income'
        INTERNAL_TRANSFER = 'internal_transfer', 'Internal Transfer'
        TRACKING = 'tracking', 'Tracking Only'

    classification = models.CharField(
        max_length=20, choices=Classification.choices, blank=True, default='',
    )
    spend_category = models.CharField(max_length=30, blank=True, default='')
    description = models.CharField(max_length=200, blank=True, default='')
    for_members = models.ManyToManyField(
        'core.Member', blank=True, related_name='shared_transactions',
    )
    notes = models.TextField(blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['household', 'tx_date']),
            models.Index(fields=['account', 'tx_date']),
            models.Index(fields=['instrument', 'tx_date']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['household', 'idempotency_key'],
                condition=~models.Q(idempotency_key=''),
                name='uniq_household_idempotency_nonempty',
            ),
        ]
        ordering = ['tx_date', 'id']

    def clean(self) -> None:
        if self.amount <= 0:
            raise ValidationError('amount must be positive')
        if self.instrument_id is None and self.quantity:
            raise ValidationError('quantity cannot be set without instrument')

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError('Transactions are immutable and cannot be updated.')
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f'{self.tx_date} {self.transaction_type} {self.amount}'

# Create your models here.
