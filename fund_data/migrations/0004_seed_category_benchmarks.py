from django.db import migrations


def seed_category_benchmarks(apps, schema_editor):
    BenchmarkFund = apps.get_model('fund_data', 'BenchmarkFund')

    BenchmarkFund.objects.filter(mfapi_scheme_code='120716').update(category_match='large_cap')

    BenchmarkFund.objects.get_or_create(
        mfapi_scheme_code='148726',
        defaults={
            'name': 'Nifty Midcap 150 (via Nippon India Nifty Midcap 150 Index Fund - Direct Plan - Growth)',
            'category_match': 'mid_cap',
        },
    )
    BenchmarkFund.objects.get_or_create(
        mfapi_scheme_code='148519',
        defaults={
            'name': 'Nifty Smallcap 250 (via Nippon India Nifty Smallcap 250 Index Fund - Direct Plan - Growth)',
            'category_match': 'small_cap',
        },
    )
    BenchmarkFund.objects.get_or_create(
        mfapi_scheme_code='147625',
        defaults={
            'name': 'Nifty 500 (via Motilal Oswal Nifty 500 Index Fund - Direct Plan - Growth)',
            'category_match': 'flexi_cap_broad_market',
        },
    )


def remove_category_benchmarks(apps, schema_editor):
    BenchmarkFund = apps.get_model('fund_data', 'BenchmarkFund')
    BenchmarkFund.objects.filter(mfapi_scheme_code__in=['148726', '148519', '147625']).delete()
    BenchmarkFund.objects.filter(mfapi_scheme_code='120716').update(category_match='')


class Migration(migrations.Migration):

    dependencies = [
        ('fund_data', '0003_benchmarkfund_category_match'),
    ]

    operations = [
        migrations.RunPython(seed_category_benchmarks, remove_category_benchmarks),
    ]
