from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase

from core.models import Household
from fund_data.models import BenchmarkFund, BenchmarkFundNav, ExternalFund, ExternalFundNav
from fund_data.services import MIN_DATA_POINTS, UNDERPERFORMANCE_THRESHOLD_PERCENT, compute_benchmark_comparison, compute_fund_risk_metrics, match_benchmark_for_fund
from instruments.models import Investment, MutualFundDetails
from instruments.services import get_or_create_mf_shell


def _build_nav_series(start_nav: Decimal, daily_returns: list[float]) -> list[Decimal]:
    navs = [start_nav]
    for r in daily_returns:
        navs.append((navs[-1] * Decimal(str(1 + r))).quantize(Decimal('0.0001')))
    return navs


class ComputeFundRiskMetricsTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Menon Family', risk_free_rate_percent=Decimal('0.00'))
        self.shell = get_or_create_mf_shell(self.household)
        self.investment = Investment.objects.create(instrument=self.shell, name='Test Index Fund')
        # BenchmarkFund rows are already seeded by data migrations (Nifty 50 /
        # Midcap 150 / Smallcap 250 / Nifty 500 proxies). This investment has no
        # MutualFundDetails, so match_benchmark_for_fund() finds no category
        # match and compute_fund_risk_metrics() falls back to the large-cap
        # (Nifty 50) row — reuse that same row here rather than creating a new one.
        self.benchmark = BenchmarkFund.objects.get(category_match='large_cap')

        # 60 days of alternating +1%/-0.5% benchmark returns — arbitrary but deterministic.
        self.daily_returns = [0.01 if i % 2 == 0 else -0.005 for i in range(60)]
        today = date.today()
        self.dates = [today - timedelta(days=(60 - i)) for i in range(61)]

    def _seed_benchmark(self, returns):
        navs = _build_nav_series(Decimal('100'), returns)
        BenchmarkFundNav.objects.bulk_create([
            BenchmarkFundNav(benchmark=self.benchmark, nav_date=d, nav=n) for d, n in zip(self.dates, navs)
        ])

    def _seed_fund(self, returns):
        navs = _build_nav_series(Decimal('50'), returns)
        fund = ExternalFund.objects.create(investment=self.investment, mfapi_scheme_code='888888', scheme_name='Test Fund')
        ExternalFundNav.objects.bulk_create([
            ExternalFundNav(fund=fund, nav_date=d, nav=n) for d, n in zip(self.dates, navs)
        ])
        return fund

    def test_not_linked_returns_unavailable(self):
        result = compute_fund_risk_metrics(self.investment.id, self.household.id)
        self.assertFalse(result['available'])
        self.assertIn('Not linked', result['reason'])

    def test_insufficient_history_returns_unavailable(self):
        self._seed_benchmark(self.daily_returns)
        fund = ExternalFund.objects.create(investment=self.investment, mfapi_scheme_code='888888', scheme_name='Test Fund')
        # only a handful of NAV points — below MIN_DATA_POINTS
        for i, d in enumerate(self.dates[:5]):
            ExternalFundNav.objects.create(fund=fund, nav_date=d, nav=Decimal('50') + i)
        result = compute_fund_risk_metrics(self.investment.id, self.household.id)
        self.assertFalse(result['available'])
        self.assertIn('Not enough', result['reason'])

    def test_fund_identical_to_benchmark_has_beta_near_one_alpha_near_zero(self):
        self._seed_benchmark(self.daily_returns)
        self._seed_fund(self.daily_returns)  # exact same daily returns as benchmark

        result = compute_fund_risk_metrics(self.investment.id, self.household.id)
        self.assertTrue(result['available'])
        self.assertAlmostEqual(result['beta'], 1.0, delta=0.01)
        self.assertAlmostEqual(result['alpha_percent'], 0.0, delta=0.5)
        self.assertEqual(result['data_points'], len(self.dates))

    def test_fund_double_leveraged_has_beta_near_two(self):
        self._seed_benchmark(self.daily_returns)
        leveraged_returns = [r * 2 for r in self.daily_returns]
        self._seed_fund(leveraged_returns)

        result = compute_fund_risk_metrics(self.investment.id, self.household.id)
        self.assertTrue(result['available'])
        self.assertAlmostEqual(result['beta'], 2.0, delta=0.05)

    def test_reports_date_range_and_data_points(self):
        self._seed_benchmark(self.daily_returns)
        self._seed_fund(self.daily_returns)
        result = compute_fund_risk_metrics(self.investment.id, self.household.id)
        self.assertEqual(result['date_range']['start'], self.dates[0].isoformat())
        self.assertEqual(result['date_range']['end'], self.dates[-1].isoformat())
        self.assertGreaterEqual(result['data_points'], MIN_DATA_POINTS)


class MatchBenchmarkForFundTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Kapoor Family')
        self.shell = get_or_create_mf_shell(self.household)

    def _make_investment(self, fund_sub_category):
        investment = Investment.objects.create(instrument=self.shell, name=f'Test Fund {fund_sub_category}')
        if fund_sub_category is not None:
            MutualFundDetails.objects.create(investment=investment, fund_category='Equity', fund_sub_category=fund_sub_category)
        return investment

    def test_mid_cap_fund_matches_midcap_150(self):
        investment = self._make_investment('Mid Cap')
        benchmark = match_benchmark_for_fund(investment)
        self.assertIsNotNone(benchmark)
        self.assertEqual(benchmark.category_match, 'mid_cap')

    def test_small_cap_fund_matches_smallcap_250(self):
        investment = self._make_investment('Small Cap')
        benchmark = match_benchmark_for_fund(investment)
        self.assertIsNotNone(benchmark)
        self.assertEqual(benchmark.category_match, 'small_cap')

    def test_large_cap_fund_matches_nifty_50(self):
        investment = self._make_investment('Large Cap')
        benchmark = match_benchmark_for_fund(investment)
        self.assertIsNotNone(benchmark)
        self.assertEqual(benchmark.category_match, 'large_cap')

    def test_flexi_cap_fund_matches_nifty_500(self):
        investment = self._make_investment('Flexi Cap')
        benchmark = match_benchmark_for_fund(investment)
        self.assertIsNotNone(benchmark)
        self.assertEqual(benchmark.category_match, 'flexi_cap_broad_market')

    def test_debt_fund_matches_nothing(self):
        investment = self._make_investment('Corporate Bond')
        benchmark = match_benchmark_for_fund(investment)
        self.assertIsNone(benchmark)

    def test_no_mf_details_matches_nothing(self):
        investment = self._make_investment(None)
        benchmark = match_benchmark_for_fund(investment)
        self.assertIsNone(benchmark)


class ComputeBenchmarkComparisonTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Nair Family')
        self.shell = get_or_create_mf_shell(self.household)
        self.investment = Investment.objects.create(instrument=self.shell, name='Test Midcap Fund')
        MutualFundDetails.objects.create(investment=self.investment, fund_category='Equity', fund_sub_category='Mid Cap')
        self.midcap_benchmark = BenchmarkFund.objects.get(category_match='mid_cap')

    def _seed_nav(self, nav_model, fk_field, fk_obj, start_nav, growth_rate, years=4):
        today = date.today()
        rows = []
        for months_ago in range(years * 12, -1, -3):
            d = today - timedelta(days=months_ago * 30)
            elapsed_years = (years * 12 - months_ago) / 12
            nav = Decimal(str(start_nav)) * Decimal(str((1 + growth_rate) ** elapsed_years))
            rows.append(nav_model(**{fk_field: fk_obj}, nav_date=d, nav=nav.quantize(Decimal('0.0001'))))
        nav_model.objects.bulk_create(rows)

    def test_not_linked_returns_unavailable(self):
        result = compute_benchmark_comparison(self.investment.id)
        self.assertFalse(result['available'])
        self.assertIn('Not linked', result['reason'])

    def test_debt_fund_has_no_matching_benchmark(self):
        debt_investment = Investment.objects.create(instrument=self.shell, name='Test Debt Fund')
        MutualFundDetails.objects.create(investment=debt_investment, fund_category='Debt', fund_sub_category='Corporate Bond')
        ExternalFund.objects.create(investment=debt_investment, mfapi_scheme_code='999999', scheme_name='Test Debt Fund')

        result = compute_benchmark_comparison(debt_investment.id)
        self.assertFalse(result['available'])
        self.assertIn('No matching benchmark', result['reason'])

    def test_outperforming_fund_is_not_flagged(self):
        fund = ExternalFund.objects.create(investment=self.investment, mfapi_scheme_code='888777', scheme_name='Test Midcap Fund')
        self._seed_nav(ExternalFundNav, 'fund', fund, 100, 0.20)
        self._seed_nav(BenchmarkFundNav, 'benchmark', self.midcap_benchmark, 100, 0.12)

        result = compute_benchmark_comparison(self.investment.id)
        self.assertTrue(result['available'])
        self.assertEqual(result['benchmark_category_match'], 'mid_cap')
        self.assertFalse(result['underperforming'])
        self.assertGreater(result['periods']['3Y']['gap_percent'], 0)

    def test_underperforming_fund_beyond_threshold_is_flagged(self):
        fund = ExternalFund.objects.create(investment=self.investment, mfapi_scheme_code='888777', scheme_name='Test Midcap Fund')
        self._seed_nav(ExternalFundNav, 'fund', fund, 100, 0.05)
        self._seed_nav(BenchmarkFundNav, 'benchmark', self.midcap_benchmark, 100, 0.15)

        result = compute_benchmark_comparison(self.investment.id)
        self.assertTrue(result['available'])
        self.assertTrue(result['underperforming'])
        self.assertLess(result['periods']['3Y']['gap_percent'], -UNDERPERFORMANCE_THRESHOLD_PERCENT)


_AXIS_RESULTS = [
    {'schemeCode': 149936, 'schemeName': 'Axis Nifty Midcap 50 Index Fund - Direct Plan - Growth Option'},
    {'schemeCode': 120505, 'schemeName': 'Axis Midcap Fund - Direct Plan - Growth Option'},
    {'schemeCode': 120504, 'schemeName': 'Axis Midcap Fund - Direct Plan - IDCW Option'},
    {'schemeCode': 114564, 'schemeName': 'Axis Midcap Fund - Regular Plan - Growth Option'},
]


class SuggestSchemeTests(TestCase):
    def test_picks_matching_plan_and_option(self):
        from fund_data.matching import suggest_scheme
        result = suggest_scheme('Axis Midcap Direct Plan Growth', search=lambda q: _AXIS_RESULTS)
        self.assertEqual(result['best']['scheme_code'], '120505')
        self.assertEqual(result['confidence'], 'high')

    def test_regular_and_idcw_are_not_confused(self):
        from fund_data.matching import suggest_scheme
        self.assertEqual(suggest_scheme('Axis Midcap Regular Growth', search=lambda q: _AXIS_RESULTS)['best']['scheme_code'], '114564')
        self.assertEqual(suggest_scheme('Axis Midcap Direct IDCW', search=lambda q: _AXIS_RESULTS)['best']['scheme_code'], '120504')

    def test_partial_name_match_is_never_high_confidence(self):
        # Real case: "Short Term" vs "Ultra Short Term" are different schemes.
        from fund_data.matching import suggest_scheme
        results = [{'schemeCode': 1, 'schemeName': 'Nippon India Ultra Short Term Fund - Direct Plan - Growth Option'}]
        result = suggest_scheme('Nippon India Short Term Fund Direct Growth', search=lambda q: results)
        self.assertEqual(result['confidence'], 'low')

    def test_no_results_means_no_suggestion(self):
        from fund_data.matching import suggest_scheme
        self.assertEqual(suggest_scheme('Unknown Fund Direct Growth', search=lambda q: [])['confidence'], 'none')


class WriteNavSnapshotsTests(TestCase):
    def setUp(self):
        from ledger.models import Transaction
        self.household = Household.objects.create(name='Iyer Family')
        self.shell = get_or_create_mf_shell(self.household)
        self.inv = Investment.objects.create(instrument=self.shell, name='Axis Midcap Direct Plan Growth')
        Transaction.objects.create(
            household=self.household, instrument=self.shell, investment=self.inv, tx_date=date(2026, 1, 5),
            amount=Decimal('1000'), quantity=Decimal('10'), direction='outflow', transaction_type='buy',
        )
        self.fund = ExternalFund.objects.create(investment=self.inv, mfapi_scheme_code='120505', scheme_name='Axis Midcap')
        ExternalFundNav.objects.create(fund=self.fund, nav_date=date(2026, 9, 30), nav=Decimal('123.45'))

    def test_values_fund_at_latest_nav(self):
        from fund_data.navs import write_nav_snapshots
        from insights.services import compute_holdings
        result = write_nav_snapshots(self.household.id, as_of=date(2026, 10, 1))
        self.assertEqual(result['written'], 1)
        holding = next(h for h in compute_holdings(self.household.id, date(2026, 10, 1)) if h['investment_id'] == self.inv.id)
        self.assertEqual(holding['market_value'], Decimal('1234.50'))

    def test_fund_without_units_is_skipped(self):
        from fund_data.navs import write_nav_snapshots
        from ledger.models import Transaction
        Transaction.objects.filter(investment=self.inv).delete()
        result = write_nav_snapshots(self.household.id, as_of=date(2026, 10, 1))
        self.assertEqual((result['written'], result['skipped_no_units']), (0, 1))

    def test_same_scheme_in_two_folios_can_both_link(self):
        other = Investment.objects.create(instrument=self.shell, name='Axis Midcap Direct Plan Growth', folio_no='999')
        ExternalFund.objects.create(investment=other, mfapi_scheme_code='120505', scheme_name='Axis Midcap')
        self.assertEqual(ExternalFund.objects.filter(mfapi_scheme_code='120505').count(), 2)

    def test_sync_fetches_each_scheme_once(self):
        from unittest.mock import patch
        from fund_data.navs import sync_navs
        other = Investment.objects.create(instrument=self.shell, name='Axis Midcap Direct Plan Growth', folio_no='999')
        ExternalFund.objects.create(investment=other, mfapi_scheme_code='120505', scheme_name='Axis Midcap')
        history = {'meta': {}, 'history': [{'date': date(2026, 10, 1), 'nav': Decimal('125')}]}
        with patch('fund_data.navs.fetch_scheme_nav_history', return_value=history) as fetch:
            sync_navs(self.household.id, include_benchmarks=False, log=lambda *_: None)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(ExternalFundNav.objects.filter(nav_date=date(2026, 10, 1)).count(), 2)

    def test_fund_with_out_of_date_units_keeps_uploaded_value(self):
        # Real case: SIP units bought after the import weren't recorded, so the
        # uploaded value implies ~3x the ledger's units. NAV x units would understate it.
        from fund_data.navs import write_nav_snapshots
        from valuations.models import ValuationSnapshot
        ExternalFundNav.objects.create(fund=self.fund, nav_date=date(2026, 9, 20), nav=Decimal('120'))
        ValuationSnapshot.objects.create(
            household=self.household, instrument=self.shell, investment=self.inv,
            valuation_date=date(2026, 9, 20), market_value=Decimal('3600'), source='csv',
        )
        result = write_nav_snapshots(self.household.id, as_of=date(2026, 10, 1))
        self.assertEqual(result['written'], 0)
        self.assertEqual(result['units_out_of_date'], [self.inv.name])

    def test_consistent_units_are_valued_from_nav(self):
        from fund_data.navs import write_nav_snapshots
        from valuations.models import ValuationSnapshot
        ExternalFundNav.objects.create(fund=self.fund, nav_date=date(2026, 9, 20), nav=Decimal('120'))
        ValuationSnapshot.objects.create(
            household=self.household, instrument=self.shell, investment=self.inv,
            valuation_date=date(2026, 9, 20), market_value=Decimal('1201'), source='csv',
        )
        result = write_nav_snapshots(self.household.id, as_of=date(2026, 10, 1))
        self.assertEqual((result['written'], result['units_out_of_date']), (1, []))


_SIF_FILE = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date
 
Open Ended Schemes(Equity Oriented Investment Strategies - Equity Ex-Top 100 Long-Short Fund)
 
qsif SIF
SIF-23;INF966L30159;-;qsif Equity Ex-Top 100 Long-Short Fund;Direct Plan;Growth Option;11.3619;01-Oct-2026
SIF-24;INF966L30167;INF966L30175;qsif Equity Ex-Top 100 Long-Short Fund;Direct Plan;IDCW Option;11.3619;01-Oct-2026
SIF-25;INF966L30183;-;qsif Equity Ex-Top 100 Long-Short Fund;Regular Plan;Growth Option;11.2218;01-Oct-2026
SIF-1;INF966L30019;-;qsif Equity Long-Short Fund;Direct Plan;Growth Option;10.9722;01-Oct-2026
SIF-33;INF109K30042;-;iSIF Equity Ex-Top 100 Long-Short Fund;;;10.10;01-Oct-2026
SIF-99;INF000000000;-;Broken Fund;Direct Plan;Growth;N.A.;01-Oct-2026
"""


class SifNavSourceTests(TestCase):
    def setUp(self):
        from unittest.mock import patch
        from fund_data import amfi_sif_client
        records = amfi_sif_client.parse_sif_nav_file(_SIF_FILE)
        patcher = patch.object(amfi_sif_client, '_load', return_value=records)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_parses_scheme_rows_only(self):
        from fund_data.amfi_sif_client import parse_sif_nav_file
        records = parse_sif_nav_file(_SIF_FILE)
        self.assertEqual(sorted(records), ['SIF-1', 'SIF-23', 'SIF-24', 'SIF-25', 'SIF-33'])
        self.assertEqual(records['SIF-23']['scheme_name'], 'qsif Equity Ex-Top 100 Long-Short Fund - Direct Plan - Growth Option')
        self.assertEqual(records['SIF-23']['nav'], Decimal('11.3619'))
        self.assertEqual(records['SIF-23']['date'], date(2026, 10, 1))
        self.assertEqual(records['SIF-33']['scheme_name'], 'iSIF Equity Ex-Top 100 Long-Short Fund')

    def test_search_and_fetch_route_sif_codes(self):
        from unittest.mock import patch
        from fund_data import nav_sources
        with patch('fund_data.mfapi_client.search_schemes', return_value=[]):
            codes = [r['schemeCode'] for r in nav_sources.search_schemes('qsif long short')]
        self.assertIn('SIF-1', codes)
        history = nav_sources.fetch_scheme_nav_history('SIF-1')['history']
        self.assertEqual(history, [{'date': date(2026, 10, 1), 'nav': Decimal('10.9722')}])

    def test_sif_search_survives_mfapi_failure(self):
        from unittest.mock import patch
        from fund_data import nav_sources
        from fund_data.mfapi_client import MfApiError
        with patch('fund_data.mfapi_client.search_schemes', side_effect=MfApiError('down')):
            self.assertTrue(nav_sources.search_schemes('qsif'))

    def test_suggests_sif_with_high_confidence(self):
        from unittest.mock import patch
        from fund_data.matching import suggest_scheme
        from fund_data.nav_sources import search_schemes
        with patch('fund_data.mfapi_client.search_schemes', return_value=[]):
            result = suggest_scheme('qsif Equity Ex Top 100 Long Short Fund Direct Plan Growth', search=search_schemes)
        self.assertEqual(result['best']['scheme_code'], 'SIF-23')
        self.assertEqual(result['confidence'], 'high')

    def test_linked_sif_is_synced_and_valued(self):
        from fund_data.navs import sync_navs, write_nav_snapshots
        from ledger.models import Transaction
        from valuations.models import ValuationSnapshot
        household = Household.objects.create(name='Rao Family')
        shell = get_or_create_mf_shell(household)
        inv = Investment.objects.create(instrument=shell, name='qsif Equity Long Short Fund Direct Growth')
        Transaction.objects.create(
            household=household, instrument=shell, investment=inv, tx_date=date(2026, 9, 1),
            amount=Decimal('1000'), quantity=Decimal('100'), direction='outflow', transaction_type='buy',
        )
        ExternalFund.objects.create(investment=inv, mfapi_scheme_code='SIF-1', scheme_name='qsif Equity Long-Short Fund')

        sync_navs(household.id, include_benchmarks=False, log=lambda *_: None)
        result = write_nav_snapshots(household.id, as_of=date(2026, 10, 2))

        self.assertEqual(result['written'], 1)
        snap = ValuationSnapshot.objects.get(investment=inv, valuation_date=date(2026, 10, 1))
        self.assertEqual(snap.unit_price, Decimal('10.9722'))
        self.assertIn('AMFI SIF', snap.notes)


_BHAV_CSV = """TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,FinInstrmNm,ClsPric
2026-10-01,2026-10-01,CM,NSE,STK,1660,INE154A01025,ITC,BL,ITC LIMITED,255.00
2026-10-01,2026-10-01,CM,NSE,STK,1660,INE154A01025,ITC,EQ,ITC LIMITED,257.00
2026-10-01,2026-10-01,CM,NSE,STK,2475,INE213A01029,ONGC,EQ,OIL AND NATURAL GAS CORP,222.70
2026-10-01,2026-10-01,CM,NSE,STK,9999,INE000000000,BAD,EQ,BROKEN,-
"""


def _zipped(text):
    import io
    import zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as zf:
        zf.writestr('bhav.csv', text)
    return buf.getvalue()


class NseClientTests(TestCase):
    def setUp(self):
        from fund_data import nse_client
        nse_client._cache.clear()

    def test_parses_and_prefers_eq_series(self):
        from fund_data.nse_client import parse_bhavcopy
        prices = parse_bhavcopy(_BHAV_CSV)
        self.assertEqual(sorted(prices), ['INE154A01025', 'INE213A01029'])
        self.assertEqual((prices['INE154A01025']['close'], prices['INE154A01025']['symbol']), (Decimal('257.00'), 'ITC'))

    def test_walks_back_past_non_trading_days(self):
        from unittest.mock import MagicMock, patch
        from fund_data.nse_client import fetch_close_prices
        missing = MagicMock(status_code=404, ok=False)
        found = MagicMock(status_code=200, ok=True, content=_zipped(_BHAV_CSV))
        with patch('fund_data.nse_client.requests.get', side_effect=[missing, missing, found]) as get:
            result = fetch_close_prices(date(2026, 10, 3))
        self.assertEqual(result['date'], date(2026, 10, 1))
        self.assertIn('20261001', get.call_args.args[0])


class EquityPriceTests(TestCase):
    def setUp(self):
        from unittest.mock import patch
        from instruments.models import Instrument
        from instruments.services import get_or_create_equity_shell
        from ledger.models import Transaction
        from fund_data.nse_client import parse_bhavcopy
        self.household = Household.objects.create(name='Nair Family')
        self.shell = get_or_create_equity_shell(self.household)
        self.itc = Investment.objects.create(instrument=self.shell, name='ITC LTD', symbol='INE154A01025')
        self.ongc = Instrument.objects.create(household=self.household, name='ONGC', instrument_type='equity', symbol='INE213A01029')
        self.unlisted = Investment.objects.create(instrument=self.shell, name='TRIDENT LIMITED')
        for instrument, inv, units in ((self.shell, self.itc, '10'), (self.ongc, None, '20'), (self.shell, self.unlisted, '5')):
            Transaction.objects.create(
                household=self.household, instrument=instrument, investment=inv, tx_date=date(2026, 9, 1),
                amount=Decimal('1000'), quantity=Decimal(units), direction='outflow', transaction_type='buy',
            )
        prices = {'date': date(2026, 10, 1), 'prices': parse_bhavcopy(_BHAV_CSV)}
        patcher = patch('fund_data.equity_prices.fetch_close_prices', return_value=prices)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _value(self, instrument_id, investment_id):
        from insights.services import compute_holdings
        return next(h['market_value'] for h in compute_holdings(self.household.id, date(2026, 10, 2))
                    if (h['instrument_id'], h['investment_id']) == (instrument_id, investment_id))

    def test_values_shell_and_standalone_holdings_at_close(self):
        from fund_data.equity_prices import write_equity_snapshots
        result = write_equity_snapshots(self.household.id, as_of=date(2026, 10, 2))
        self.assertEqual((result['written'], result['not_priced']), (2, ['TRIDENT LIMITED']))
        self.assertEqual(self._value(self.shell.id, self.itc.id), Decimal('2570.00'))
        self.assertEqual(self._value(self.ongc.id, None), Decimal('4454.00'))

    def test_out_of_date_units_keep_uploaded_value(self):
        # A bonus issue doubled the units after the import: the statement value implies 20, the ledger has 10.
        from fund_data.equity_prices import write_equity_snapshots
        from valuations.models import ValuationSnapshot
        ValuationSnapshot.objects.create(
            household=self.household, instrument=self.shell, investment=self.itc, valuation_date=date(2026, 9, 20),
            unit_price=Decimal('130'), market_value=Decimal('2600'), source='csv',
        )
        result = write_equity_snapshots(self.household.id, as_of=date(2026, 10, 2))
        self.assertEqual(result['units_out_of_date'], ['ITC LTD'])

    def test_user_value_on_same_day_is_kept(self):
        from fund_data.equity_prices import write_equity_snapshots
        from valuations.models import ValuationSnapshot
        ValuationSnapshot.objects.create(
            household=self.household, instrument=self.ongc, valuation_date=date(2026, 10, 1),
            unit_price=Decimal('200'), market_value=Decimal('4000'), source='manual',
        )
        write_equity_snapshots(self.household.id, as_of=date(2026, 10, 2))
        self.assertEqual(self._value(self.ongc.id, None), Decimal('4000.00'))


class LinkFundsByIsinTests(TestCase):
    def test_links_demat_fund_and_skips_linked(self):
        from unittest.mock import patch
        from fund_data.equity_prices import link_funds_by_isin
        household = Household.objects.create(name='Kurup Family')
        shell = get_or_create_mf_shell(household)
        demat = Investment.objects.create(instrument=shell, name='KOTAK MTCF D-GROW', isin='INF174KA1HV3')
        linked = Investment.objects.create(instrument=shell, name='Axis Midcap', isin='INF846K01EH3')
        ExternalFund.objects.create(investment=linked, mfapi_scheme_code='120505', scheme_name='Axis Midcap')
        schemes = {'INF174KA1HV3': {'scheme_code': '149185', 'scheme_name': 'Kotak Multi Cap Fund - Direct Plan - Growth'}}
        with patch('fund_data.equity_prices.fetch_schemes_by_isin', return_value=schemes) as fetch:
            result = link_funds_by_isin(household.id)
        self.assertEqual(result['linked'], ['KOTAK MTCF D-GROW'])
        self.assertEqual(ExternalFund.objects.get(investment=demat).mfapi_scheme_code, '149185')
        self.assertEqual(fetch.call_count, 1)

    def test_no_isin_funds_skip_the_download(self):
        from unittest.mock import patch
        from fund_data.equity_prices import link_funds_by_isin
        household = Household.objects.create(name='Menon Family 2')
        Investment.objects.create(instrument=get_or_create_mf_shell(household), name='Some Fund', symbol='12345678')
        with patch('fund_data.equity_prices.fetch_schemes_by_isin') as fetch:
            self.assertEqual(link_funds_by_isin(household.id)['linked'], [])
        fetch.assert_not_called()


class SifMirrorFallbackTests(TestCase):
    def setUp(self):
        from fund_data import amfi_sif_client
        amfi_sif_client._cache.update({'at': 0.0, 'records': None})
        self.addCleanup(amfi_sif_client._cache.update, {'at': 0.0, 'records': None})

    def test_blocked_amfi_falls_back_to_github_copy(self):
        from unittest.mock import MagicMock, patch
        from fund_data import amfi_sif_client
        blocked = MagicMock(ok=True, status_code=200, text='<html>Access denied by proxy</html>')
        mirror = MagicMock(ok=True, status_code=200, text=_SIF_FILE)
        with patch('fund_data.amfi_sif_client.requests.get', side_effect=[blocked, mirror]) as get:
            codes = [r['schemeCode'] for r in amfi_sif_client.search_sifs('qsif ex top 100')]
        self.assertIn('SIF-23', codes)
        self.assertEqual(get.call_args_list[1].args[0], amfi_sif_client.SIF_NAV_MIRROR_URL)

    def test_both_sources_failing_raises(self):
        from unittest.mock import MagicMock, patch
        from fund_data import amfi_sif_client
        from fund_data.mfapi_client import MfApiError
        with patch('fund_data.amfi_sif_client.requests.get', return_value=MagicMock(ok=False, status_code=403, text='')):
            with self.assertRaises(MfApiError):
                amfi_sif_client.search_sifs('qsif')


_NIFTY100_CSV = 'Company Name,Industry,Symbol,Series,ISIN Code\nITC Ltd.,FMCG,ITC,EQ,INE154A01025\n'
_MIDCAP150_CSV = 'Company Name,Industry,Symbol,Series,ISIN Code\nPolycab India Ltd.,Capital Goods,POLYCAB,EQ,INE455K01017\n'


class MarketCapTests(TestCase):
    def setUp(self):
        from unittest.mock import MagicMock, patch
        from fund_data import market_cap
        market_cap._cache.update({'at': 0.0, 'caps': None})
        self.addCleanup(market_cap._cache.update, {'at': 0.0, 'caps': None})
        responses = {
            market_cap.LIST_URLS[market_cap.LARGE]: _NIFTY100_CSV,
            market_cap.LIST_URLS[market_cap.MID]: _MIDCAP150_CSV,
        }
        patcher = patch('fund_data.market_cap.requests.get',
                        side_effect=lambda url, **kw: MagicMock(ok=True, status_code=200, content=responses[url].encode()))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_stock_caps_follow_sebi_bands(self):
        from fund_data.market_cap import cap_for_stock, fetch_cap_lists
        lists = fetch_cap_lists()
        self.assertEqual(cap_for_stock('INE154A01025', 'ITC', lists), 'large_cap')
        self.assertEqual(cap_for_stock('INE455K01017', 'POLYCAB', lists), 'mid_cap')
        self.assertEqual(cap_for_stock('INE039O01029', 'JASH ENGINEERING', lists), 'small_cap')
        self.assertEqual(cap_for_stock('INE658F08565', 'KIIFB 9.30 2032', lists), '')  # bond
        self.assertEqual(cap_for_stock('INF109KC1NS5', 'ICICI NIFTY NXT50ETF', lists), 'large_cap')
        self.assertEqual(cap_for_stock('INF204KB1V68', 'NIP IND ETF MIDCAP 150', lists), 'mid_cap')
        self.assertEqual(cap_for_stock('INF0R8F01042', 'ZERODHA GLD ETF D-GR', lists), '')
        self.assertEqual(cap_for_stock('INF732E01037', 'NIP ETNF1D RTLIQBEES', lists), '')

    def test_fund_caps(self):
        from fund_data.market_cap import cap_for_fund
        self.assertEqual(cap_for_fund('Large Cap', 'Equity'), 'large_cap')
        self.assertEqual(cap_for_fund('Nifty 50 Index', 'Equity'), 'large_cap')
        self.assertEqual(cap_for_fund('Mid Cap', 'Equity'), 'mid_cap')
        self.assertEqual(cap_for_fund('Large & Mid Cap', 'Equity'), 'multi')
        self.assertEqual(cap_for_fund('Flexi Cap', 'Equity'), 'multi')
        self.assertIsNone(cap_for_fund('Short Duration', 'Debt'))
        self.assertIsNone(cap_for_fund('Gold', 'Commodities'))
        self.assertEqual(cap_for_fund('', ''), '')

    def test_update_keeps_manual_caps_and_sets_category(self):
        from instruments.models import AssetCategory
        from instruments.services import get_or_create_equity_shell
        from fund_data.market_cap import ensure_equities_category, update_stock_caps
        household = Household.objects.create(name='Kini Family')
        shell = get_or_create_equity_shell(household)
        auto = Investment.objects.create(instrument=shell, name='ITC LTD', symbol='INE154A01025')
        manual = Investment.objects.create(instrument=shell, name='JASH ENGINEERING', symbol='INE039O01029',
                                           market_cap='mid_cap', market_cap_auto=False)
        counts = update_stock_caps(household.id)
        auto.refresh_from_db()
        manual.refresh_from_db()
        self.assertEqual((auto.market_cap, manual.market_cap), ('large_cap', 'mid_cap'))
        self.assertEqual(counts['large_cap'], 1)

        existing = AssetCategory.objects.create(household=household, name='Equities')
        self.assertTrue(ensure_equities_category(household))
        shell.refresh_from_db()
        self.assertEqual(shell.asset_category_id, existing.id)
        self.assertFalse(ensure_equities_category(household))  # already set


class CapCategoryTests(TestCase):
    def setUp(self):
        from instruments.models import AllocationTarget, AssetCategory, MutualFundDetails
        from instruments.services import get_or_create_equity_shell
        from ledger.models import Transaction
        self.household = Household.objects.create(name='Bhandary Family')
        self.equities = AssetCategory.objects.create(household=self.household, name='Equities')
        self.mf_category = AssetCategory.objects.create(household=self.household, name='Mutual Fund')
        self.gold = AssetCategory.objects.create(household=self.household, name='Gold')
        self.eq_shell = get_or_create_equity_shell(self.household)
        self.eq_shell.asset_category = self.equities
        self.eq_shell.save()
        self.mf_shell = get_or_create_mf_shell(self.household)
        self.mf_shell.asset_category = self.mf_category
        self.mf_shell.save()
        AllocationTarget.objects.create(household=self.household, asset_category=self.equities, target_percent=Decimal('20'))
        AllocationTarget.objects.create(household=self.household, asset_category=self.mf_category, target_percent=Decimal('40'))

        def holding(shell, name, amount, cap='', fund=None, **extra):
            inv = Investment.objects.create(instrument=shell, name=name, market_cap=cap, **extra)
            if fund:
                MutualFundDetails.objects.create(investment=inv, fund_category=fund[0], fund_sub_category=fund[1])
            Transaction.objects.create(household=self.household, instrument=shell, investment=inv, tx_date=date(2026, 9, 1),
                                       amount=Decimal(amount), quantity=Decimal('1'), direction='outflow', transaction_type='buy')
            return inv
        self.itc = holding(self.eq_shell, 'ITC', '600', cap='large_cap')
        self.polycab = holding(self.eq_shell, 'POLYCAB', '100', cap='mid_cap')
        self.jash = holding(self.eq_shell, 'JASH', '300', cap='small_cap')
        self.large_fund = holding(self.mf_shell, 'Axis Bluechip', '500', fund=('Equity', 'Large Cap'))
        self.flexi = holding(self.mf_shell, 'PPFAS Flexi', '500', fund=('Equity', 'Flexi Cap'))
        self.manual = holding(self.mf_shell, 'Kotak Small Cap', '0.01', fund=('Equity', 'Small Cap'),
                              asset_category=self.gold, category_auto=False)

    def _targets(self):
        from instruments.models import AllocationTarget
        return {t.asset_category.name: t.target_percent for t in AllocationTarget.objects.filter(household=self.household)}

    def test_assigns_caps_and_converts_targets_once(self):
        from fund_data.market_cap import assign_cap_categories
        result = assign_cap_categories(self.household)
        for inv in (self.itc, self.polycab, self.jash, self.large_fund, self.flexi, self.manual):
            inv.refresh_from_db()
        self.assertEqual([i.asset_category.name if i.asset_category else None for i in (self.itc, self.polycab, self.jash, self.large_fund, self.flexi)],
                         ['Large Cap', 'Mid Cap', 'Small Cap', 'Large Cap', None])
        self.assertEqual(self.manual.asset_category_id, self.gold.id)  # picked by hand: left alone
        # Equities 20% split 60/10/30 by stock value; Mutual Fund 40% gives half to Large Cap.
        self.assertEqual(self._targets(), {'Mutual Fund': Decimal('20.00'), 'Large Cap': Decimal('32.00'),
                                           'Mid Cap': Decimal('2.00'), 'Small Cap': Decimal('6.00')})
        self.assertTrue(result['target_changes'])
        self.assertEqual(assign_cap_categories(self.household)['target_changes'], [])

    def test_holdings_and_breakdown_use_the_holdings_own_category(self):
        from fund_data.market_cap import assign_cap_categories
        from insights.services import compute_category_breakdown, compute_holdings
        assign_cap_categories(self.household)
        by_inv = {h['investment_id']: h for h in compute_holdings(self.household.id, date(2026, 10, 1))}
        self.assertEqual((by_inv[self.itc.id]['asset_category_source'], by_inv[self.flexi.id]['asset_category']),
                         ('investment', self.mf_category.id))
        breakdown = {r['category_name']: r['market_value'] for r in compute_category_breakdown(self.household.id, date(2026, 10, 1))}
        self.assertEqual(breakdown['Large Cap'], '1100.00')
        self.assertEqual(breakdown['Mutual Fund'], '500.00')
