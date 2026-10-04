"""Once-a-day refresh so values stay current without re-uploading statements.

Run from a PythonAnywhere scheduled task (Tasks tab), e.g. daily at 22:00 IST:
    cd ~/<repo> && .venv/bin/python manage.py daily_refresh

Steps: link demat funds by ISIN -> sync mutual fund NAVs -> value linked funds at latest
NAV -> value listed equities at the NSE close -> per household, bulk_snapshot (FD/bond
accrual, carry-forward, net-worth snapshot). A failing data source is logged and skipped,
so the remaining steps still run.
"""
from datetime import date

from django.core.management.base import BaseCommand

from core.models import Household
from fund_data.equity_prices import link_funds_by_isin, write_equity_snapshots
from fund_data.mfapi_client import MfApiError
from fund_data.navs import sync_navs, write_nav_snapshots
from valuations.services import bulk_snapshot


class Command(BaseCommand):
    help = 'Sync NAVs, write NAV-based fund valuations, then snapshot every household.'

    def add_arguments(self, parser):
        parser.add_argument('--skip-nav', action='store_true', help='Skip the network NAV sync (use stored NAVs only).')

    def handle(self, *args, skip_nav=False, **options):
        today = date.today()
        if not skip_nav:
            try:
                linked = link_funds_by_isin()['linked']
                self.stdout.write(f'Linked by ISIN: {len(linked)} fund(s)' + (f" ({', '.join(linked)})" if linked else ''))
            except MfApiError as exc:
                self.stdout.write(f'ISIN linking skipped: {exc}')
            result = sync_navs(log=self.stdout.write)
            self.stdout.write(f"NAV sync: {result['schemes']} schemes, +{result['nav_points_added']} points, {result['failed']} failed")

        result = write_nav_snapshots(as_of=today)
        self.stdout.write(
            f"Fund valuations: {result['written']} written, "
            f"{result['skipped_no_nav']} without NAV, {result['skipped_no_units']} without units, "
            f"{len(result['units_out_of_date'])} with out-of-date units (kept their uploaded value)"
        )
        for name in result['units_out_of_date']:
            self.stdout.write(f'  units out of date: {name}')

        if not skip_nav:
            try:
                result = write_equity_snapshots(as_of=today)
                self.stdout.write(
                    f"Equity prices (NSE close {result['price_date']}): {result['written']} written, "
                    f"{result['skipped_no_units']} without units, {len(result['units_out_of_date'])} with out-of-date units, "
                    f"{len(result['not_priced'])} not listed on NSE"
                )
                for name in result['units_out_of_date']:
                    self.stdout.write(f'  units out of date: {name}')
            except MfApiError as exc:
                self.stdout.write(f'Equity prices skipped: {exc}')

        for household in Household.objects.all():
            summary = bulk_snapshot(household.id, today)
            self.stdout.write(f"{household.name}: net worth {summary['net_worth']:,.2f}")
        self.stdout.write(self.style.SUCCESS('daily_refresh done'))
