# Finalizes the MF/SIP -> Investment collapse: now that 0015's data
# migration has populated MutualFundDetails.investment /
# FundHoldingsSnapshot.investment for every row and deleted the old
# per-scheme Instruments (along with their `instrument`-keyed FKs), the
# stale `instrument`/`folio_no` columns on these two models can be dropped,
# and MutualFundDetails.investment tightened back to required (matching
# every other *Details model's non-nullable link to its parent).
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('instruments', '0015_migrate_mf_to_investment'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='fundholdingssnapshot',
            unique_together={('investment', 'as_of_date')},
        ),
        migrations.RemoveField(
            model_name='mutualfunddetails',
            name='instrument',
        ),
        migrations.RemoveField(
            model_name='mutualfunddetails',
            name='folio_no',
        ),
        migrations.RemoveField(
            model_name='fundholdingssnapshot',
            name='instrument',
        ),
        migrations.AlterField(
            model_name='mutualfunddetails',
            name='investment',
            field=models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='mf_details', to='instruments.investment'),
        ),
    ]
