from django.db import migrations

BUILTINS = [
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


def seed_builtin_categories(apps, schema_editor):
    Household = apps.get_model('core', 'Household')
    ExpenseCategory = apps.get_model('expenses', 'ExpenseCategory')
    for household in Household.objects.all():
        for key, label, icon in BUILTINS:
            ExpenseCategory.objects.get_or_create(
                household=household,
                key=key,
                defaults={'label': label, 'icon': icon, 'is_builtin': True},
            )


def unseed_builtin_categories(apps, schema_editor):
    ExpenseCategory = apps.get_model('expenses', 'ExpenseCategory')
    ExpenseCategory.objects.filter(is_builtin=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0002_expensecategory'),
    ]

    operations = [
        migrations.RunPython(seed_builtin_categories, reverse_code=unseed_builtin_categories),
    ]
