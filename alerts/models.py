from datetime import date

from django.db import models

from core.models import TimeStampedModel


class SIPMandate(TimeStampedModel):
    class Frequency(models.TextChoices):
        MONTHLY = 'monthly', 'Monthly'
        QUARTERLY = 'quarterly', 'Quarterly'

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='sip_mandates')
    member = models.ForeignKey('core.Member', on_delete=models.SET_NULL, null=True, blank=True, related_name='sip_mandates')
    account = models.ForeignKey('instruments.Account', on_delete=models.CASCADE, related_name='sip_mandates')
    instrument = models.ForeignKey('instruments.Instrument', on_delete=models.CASCADE, related_name='sip_mandates')
    expected_amount = models.DecimalField(max_digits=18, decimal_places=2)
    frequency = models.CharField(max_length=20, choices=Frequency.choices, default=Frequency.MONTHLY)
    due_day = models.PositiveSmallIntegerField(default=5)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    grace_days = models.PositiveSmallIntegerField(default=5)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-start_date']

    def effective_end_date(self, as_of: date) -> date:
        if self.end_date and self.end_date < as_of:
            return self.end_date
        return as_of


class SIPPaymentAck(TimeStampedModel):
    """Acknowledgement that a SIP due-date was paid outside the ledger.

    Used when the user marks a SIP as paid without deducting cash from a tracked
    account (e.g. paid from an external account, or already recorded elsewhere).
    Suppresses missed-SIP alerts for the corresponding due date.
    """

    mandate = models.ForeignKey(SIPMandate, on_delete=models.CASCADE, related_name='payment_acks')
    due_date = models.DateField()
    acknowledged_on = models.DateField()
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = ('mandate', 'due_date')
        ordering = ['-due_date']

