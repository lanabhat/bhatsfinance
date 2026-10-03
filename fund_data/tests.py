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
