from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0004_backfill_transaction_classification'),
        ('instruments', '0001_initial'),
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.DeleteModel(
            name='Expense',
        ),
    ]
