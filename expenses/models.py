from django.db import models

from core.models import TimeStampedModel

BUILTIN_CATEGORIES = [
    ('food', 'Food & Dining', '🍽️'),
    ('transport', 'Transport', '🚗'),
    ('shopping', 'Shopping', '🛍️'),
    ('utilities', 'Utilities', '💡'),
    ('health', 'Health & Medical', '🏥'),
    ('entertainment', 'Entertainment', '🎬'),
    ('education', 'Education', '📚'),
    ('rent', 'Rent', '🏠'),
    ('emi', 'EMI / Loan Payment', '🏦'),
    ('other', 'Other', '📌'),
]


class ExpenseCategory(TimeStampedModel):
    household = models.ForeignKey('core.Household', on_delete=models.CASCADE, related_name='expense_categories')
    key = models.SlugField(max_length=30)
    label = models.CharField(max_length=50)
    icon = models.CharField(max_length=10)
    is_builtin = models.BooleanField(default=False)

    class Meta:
        unique_together = [('household', 'key')]
        ordering = ['label']

    def __str__(self):
        return f'{self.icon} {self.label}'


