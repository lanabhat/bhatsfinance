from django.core.management.base import BaseCommand

from fund_data.navs import sync_navs


class Command(BaseCommand):
    help = 'Incrementally sync NAV history from mfapi.in for every linked ExternalFund and the BenchmarkFunds.'

    def handle(self, *args, **options):
        result = sync_navs(log=self.stdout.write)
        self.stdout.write(self.style.SUCCESS(
            f"{result['schemes']} schemes, +{result['nav_points_added']} NAV points, {result['failed']} failed"
        ))
