"""Give each household's "Equity" shell a category, so stocks stop showing as
uncategorised without waiting for a price refresh to run.

Holdings take their category from the shell they sit under. Reuses the household's
"Equities" / "Equity" / "Stocks" category, else creates "Equities". Shells that already
have a category are left alone. The live equivalent for later households is
fund_data.market_cap.ensure_equities_category.
"""
from django.db import migrations


def forwards(apps, schema_editor):
    AssetCategory = apps.get_model('instruments', 'AssetCategory')
    Instrument = apps.get_model('instruments', 'Instrument')

    for shell in Instrument.objects.filter(instrument_type='equity', name='Equity', asset_category__isnull=True):
        category = None
        for name in ('Equities', 'Equity', 'Stocks'):
            category = AssetCategory.objects.filter(household_id=shell.household_id, name__iexact=name).first()
            if category:
                break
        if category is None:
            category = AssetCategory.objects.create(household_id=shell.household_id, name='Equities', color='#16a34a')
        shell.asset_category = category
        shell.save(update_fields=['asset_category'])


class Migration(migrations.Migration):

    dependencies = [
        ('instruments', '0020_investment_market_cap'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
