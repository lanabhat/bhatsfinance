"""Keep NAV history current and turn it into holding valuations.

sync_navs() pulls NAV history once per scheme (several folios can share one) —
from mfapi.in, or AMFI's SIF file for SIFs (see nav_sources).
write_nav_snapshots() values each linked fund at its latest NAV, so fund values
update without the user re-uploading statements.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from django.utils import timezone

from fund_data.mfapi_client import MfApiError
from fund_data.nav_sources import fetch_scheme_nav_history, source_label
from fund_data.models import BenchmarkFund, BenchmarkFundNav, ExternalFund, ExternalFundNav


def sync_navs(household_id: int | None = None, include_benchmarks: bool = True, log=print) -> dict:
    """Fetch new NAV points for linked funds (optionally one household's) and benchmarks."""
    funds = ExternalFund.objects.filter(investment__isnull=False).select_related('investment')
    if household_id is not None:
        funds = funds.filter(investment__instrument__household_id=household_id)

    by_scheme: dict[str, list[ExternalFund]] = defaultdict(list)
    for fund in funds:
        by_scheme[fund.mfapi_scheme_code].append(fund)

    added = failed = 0
    for scheme_code, scheme_funds in by_scheme.items():
        try:
            history = fetch_scheme_nav_history(scheme_code)['history']
        except MfApiError as exc:
            log(f'  skipped scheme {scheme_code}: {exc}')
            failed += 1
            continue
        for fund in scheme_funds:
            existing = set(ExternalFundNav.objects.filter(fund=fund).values_list('nav_date', flat=True))
            new_rows = [ExternalFundNav(fund=fund, nav_date=r['date'], nav=r['nav']) for r in history if r['date'] not in existing]
            if new_rows:
                ExternalFundNav.objects.bulk_create(new_rows, ignore_conflicts=True)
                added += len(new_rows)
        ExternalFund.objects.filter(pk__in=[f.pk for f in scheme_funds]).update(last_synced_at=timezone.now())

    if include_benchmarks:
        for benchmark in BenchmarkFund.objects.all():
            try:
                history = fetch_scheme_nav_history(benchmark.mfapi_scheme_code)['history']
            except MfApiError as exc:
                log(f'  skipped benchmark {benchmark.name}: {exc}')
                failed += 1
                continue
            existing = set(BenchmarkFundNav.objects.filter(benchmark=benchmark).values_list('nav_date', flat=True))
            BenchmarkFundNav.objects.bulk_create(
                [BenchmarkFundNav(benchmark=benchmark, nav_date=r['date'], nav=r['nav']) for r in history if r['date'] not in existing],
                ignore_conflicts=True,
            )
            BenchmarkFund.objects.filter(pk=benchmark.pk).update(last_synced_at=timezone.now())

    return {'schemes': len(by_scheme), 'nav_points_added': added, 'failed': failed}


# If recorded units x NAV disagrees with the user's latest uploaded/entered value by
# more than this, the ledger's unit count is out of date (e.g. SIP units bought since
# the import were never recorded) and NAV valuation would understate the fund.
UNITS_MISMATCH_TOLERANCE = 0.05


def ledger_units_as_of(as_of: date, investment=None, instrument=None):
    """Units the ledger says were held on as_of, for an Investment (or a standalone Instrument)."""
    from insights.services import _signed_quantity
    from ledger.models import Transaction

    txs = Transaction.objects.filter(tx_date__lte=as_of)
    txs = txs.filter(investment=investment) if investment is not None else txs.filter(instrument=instrument, investment__isnull=True)
    return sum((_signed_quantity(tx) for tx in txs), start=0)


def _units_out_of_date(fund, inv) -> bool:
    """True when the units recorded as of the user's latest uploaded/entered valuation
    can't explain that valuation at that day's NAV."""
    from valuations.models import ValuationSnapshot

    reference = (
        ValuationSnapshot.objects
        .filter(investment=inv, market_value__gt=0)
        .exclude(source=ValuationSnapshot.SourceType.API)
        .order_by('-valuation_date', '-id')
        .first()
    )
    if reference is None:
        return False
    nav_then = ExternalFundNav.objects.filter(fund=fund, nav_date__lte=reference.valuation_date).order_by('-nav_date').first()
    if nav_then is None:
        return False
    units_then = ledger_units_as_of(reference.valuation_date, investment=inv)
    if not units_then:
        return False
    implied = units_then * nav_then.nav
    return abs(float(implied / reference.market_value) - 1) > UNITS_MISMATCH_TOLERANCE


def write_nav_snapshots(household_id: int | None = None, as_of: date | None = None) -> dict:
    """Value every linked fund at its latest NAV on or before as_of.

    The snapshot is dated on the NAV's own date. A user-entered value for that same
    date is left alone (see _upsert_auto_snapshot). Skipped, keeping their existing
    value: funds with no units (units x NAV would zero them), and funds whose recorded
    units don't match their latest uploaded value (units x NAV would understate them).
    """
    from insights.services import compute_holdings
    from valuations.models import ValuationSnapshot
    from valuations.services import _upsert_auto_snapshot

    as_of = as_of or date.today()
    funds = ExternalFund.objects.filter(investment__isnull=False).select_related('investment__instrument')
    if household_id is not None:
        funds = funds.filter(investment__instrument__household_id=household_id)

    units_by_household: dict[int, dict[int, object]] = {}
    written = skipped_no_nav = skipped_no_units = 0
    units_out_of_date: list[str] = []
    for fund in funds:
        inv = fund.investment
        hh = inv.instrument.household_id
        if hh not in units_by_household:
            units_by_household[hh] = {
                h['investment_id']: h['quantity'] for h in compute_holdings(hh, as_of) if h['investment_id']
            }
        units = units_by_household[hh].get(inv.id)
        if not units:
            skipped_no_units += 1
            continue
        latest = ExternalFundNav.objects.filter(fund=fund, nav_date__lte=as_of).order_by('-nav_date').first()
        if latest is None:
            skipped_no_nav += 1
            continue
        if _units_out_of_date(fund, inv):
            units_out_of_date.append(inv.name)
            continue
        if _upsert_auto_snapshot(
            {'household_id': hh, 'instrument': inv.instrument, 'investment': inv, 'valuation_date': latest.nav_date},
            {'unit_price': latest.nav, 'market_value': None, 'source': ValuationSnapshot.SourceType.API,
             'notes': f'NAV from {source_label(fund.mfapi_scheme_code)} (scheme {fund.mfapi_scheme_code})'},
        ):
            written += 1
    return {
        'written': written,
        'skipped_no_nav': skipped_no_nav,
        'skipped_no_units': skipped_no_units,
        'units_out_of_date': units_out_of_date,
    }
