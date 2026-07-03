from django.db import models

from core.fields import EncryptedTextField
from core.models import TimeStampedModel


class ImportBatch(TimeStampedModel):
    class SourceType(models.TextChoices):
        CSV = 'csv', 'CSV'
        API = 'api', 'API'
        MANUAL = 'manual', 'Manual'

    class StatusType(models.TextChoices):
        PENDING = 'pending', 'Pending'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='import_batches')
    source = models.CharField(max_length=10, choices=SourceType.choices, default=SourceType.CSV)
    filename = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=StatusType.choices, default=StatusType.PENDING)
    error_message = models.TextField(blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']


class ImportRow(TimeStampedModel):
    class RowStatus(models.TextChoices):
        CREATED = 'created', 'Created'
        DUPLICATE = 'duplicate', 'Duplicate'
        ERROR = 'error', 'Error'

    batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name='rows')
    row_number = models.PositiveIntegerField()
    idempotency_key = models.CharField(max_length=120, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=RowStatus.choices, default=RowStatus.CREATED)
    error_message = models.TextField(blank=True)
    transaction = models.ForeignKey(
        'ledger.Transaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='import_rows',
    )

class SavedPdfPassword(TimeStampedModel):
    """
    Passwords the household has previously used to unlock imported PDFs
    (e.g. bank FD/RD statements), tried automatically on future imports so
    the user doesn't have to retype them.
    """

    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='saved_pdf_passwords')
    label = models.CharField(max_length=100, blank=True)
    password = EncryptedTextField(blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-last_used_at', '-created_at']

    def __str__(self) -> str:
        return f'Saved PDF password ({self.label or self.household_id})'

# Create your models here.
