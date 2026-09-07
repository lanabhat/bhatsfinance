from django.db import migrations


def backfill_mf_details(apps, schema_editor):
    Instrument = apps.get_model('instruments', 'Instrument')
    MutualFundDetails = apps.get_model('instruments', 'MutualFundDetails')

    qs = Instrument.objects.filter(instrument_type__in=['mutual_fund', 'sip'])
    for instrument in qs:
        metadata = instrument.metadata or {}
        folio_no = metadata.get('folio_no', '') or instrument.symbol or ''
        MutualFundDetails.objects.get_or_create(
            instrument=instrument,
            defaults={
                'amc': metadata.get('amc', ''),
                'fund_category': metadata.get('category', ''),
                'fund_sub_category': metadata.get('sub_category', ''),
                'folio_no': folio_no,
            },
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('instruments', '0007_instrument_include_in_rebalancing_mutualfunddetails_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_mf_details, noop_reverse),
    ]
