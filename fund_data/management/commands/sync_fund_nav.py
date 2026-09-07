from django.core.management.base import BaseCommand
from django.utils import timezone

from fund_data.mfapi_client import MfApiError, fetch_scheme_nav_history
from fund_data.models import BenchmarkFund, BenchmarkFundNav, ExternalFund, ExternalFundNav


class Command(BaseCommand):
    help = 'Incrementally sync NAV history from mfapi.in for every linked ExternalFund and the BenchmarkFund.'

    def handle(self, *args, **options):
        for fund in ExternalFund.objects.all():
            self._sync_one(
                scheme_code=fund.mfapi_scheme_code,
                label=f'{fund.instrument.name} ({fund.scheme_name})',
                existing_dates_qs=ExternalFundNav.objects.filter(fund=fund).values_list('nav_date', flat=True),
                nav_model=ExternalFundNav,
                fk_field='fund',
                fk_obj=fund,
                mark_synced=lambda: ExternalFund.objects.filter(pk=fund.pk).update(last_synced_at=timezone.now()),
            )

        for benchmark in BenchmarkFund.objects.all():
            self._sync_one(
                scheme_code=benchmark.mfapi_scheme_code,
                label=f'benchmark: {benchmark.name}',
                existing_dates_qs=BenchmarkFundNav.objects.filter(benchmark=benchmark).values_list('nav_date', flat=True),
                nav_model=BenchmarkFundNav,
                fk_field='benchmark',
                fk_obj=benchmark,
                mark_synced=lambda: BenchmarkFund.objects.filter(pk=benchmark.pk).update(last_synced_at=timezone.now()),
            )

    def _sync_one(self, *, scheme_code, label, existing_dates_qs, nav_model, fk_field, fk_obj, mark_synced):
        self.stdout.write(f'Syncing {label} (scheme {scheme_code})...')
        try:
            result = fetch_scheme_nav_history(scheme_code)
        except MfApiError as exc:
            self.stderr.write(self.style.WARNING(f'  skipped: {exc}'))
            return

        existing_dates = set(existing_dates_qs)
        new_rows = [
            nav_model(**{fk_field: fk_obj}, nav_date=row['date'], nav=row['nav'])
            for row in result['history']
            if row['date'] not in existing_dates
        ]
        if new_rows:
            nav_model.objects.bulk_create(new_rows, ignore_conflicts=True)
        mark_synced()
        self.stdout.write(self.style.SUCCESS(f'  +{len(new_rows)} new NAV points ({len(result["history"])} total available)'))
