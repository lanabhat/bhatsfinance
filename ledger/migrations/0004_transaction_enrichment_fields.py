from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ledger', '0003_alter_transaction_transaction_type'),
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='classification',
            field=models.CharField(
                blank=True,
                choices=[
                    ('spend', 'Spend'),
                    ('income', 'Income'),
                    ('internal_transfer', 'Internal Transfer'),
                    ('tracking', 'Tracking Only'),
                ],
                default='',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='transaction',
            name='spend_category',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
        migrations.AddField(
            model_name='transaction',
            name='description',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='transaction',
            name='for_members',
            field=models.ManyToManyField(
                blank=True,
                related_name='shared_transactions',
                to='core.member',
            ),
        ),
        migrations.AddField(
            model_name='transaction',
            name='notes',
            field=models.TextField(blank=True),
        ),
    ]
