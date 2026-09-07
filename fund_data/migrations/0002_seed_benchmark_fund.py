from django.db import migrations


def seed_benchmark(apps, schema_editor):
    BenchmarkFund = apps.get_model('fund_data', 'BenchmarkFund')
    BenchmarkFund.objects.get_or_create(
        mfapi_scheme_code='120716',
        defaults={'name': 'Nifty 50 (via UTI Nifty 50 Index Fund - Direct Plan - Growth)'},
    )


def remove_benchmark(apps, schema_editor):
    BenchmarkFund = apps.get_model('fund_data', 'BenchmarkFund')
    BenchmarkFund.objects.filter(mfapi_scheme_code='120716').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('fund_data', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_benchmark, remove_benchmark),
    ]
