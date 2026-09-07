from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase

from core.models import Household
from fund_data.models import BenchmarkFund, BenchmarkFundNav, ExternalFund, ExternalFundNav
from fund_data.services import MIN_DATA_POINTS, UNDERPERFORMANCE_THRESHOLD_PERCENT, compute_benchmark_comparison, compute_fund_risk_metrics, match_benchmark_for_fund
from instruments.models import Instrument, MutualFundDetails


def _build_nav_series(start_nav: Decimal, daily_returns: list[float]) -> list[Decimal]:
    navs = [start_nav]
    for r in daily_returns:
        navs.append((navs[-1] * Decimal(str(1 + r))).quantize(Decimal('0.0001')))
    return navs


class ComputeFundRiskMetricsTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Menon Family', risk_free_rate_percent=Decimal('0.00'))
        self.instrument = Instrument.objects.create(
            household=self.household, name='Test Index Fund', instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )
        # BenchmarkFund rows are already seeded by data migrations (Nifty 50 /
        # Midcap 150 / Smallcap 250 / Nifty 500 proxies). This instrument has no
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
        fund = ExternalFund.objects.create(instrument=self.instrument, mfapi_scheme_code='888888', scheme_name='Test Fund')
        ExternalFundNav.objects.bulk_create([
            ExternalFundNav(fund=fund, nav_date=d, nav=n) for d, n in zip(self.dates, navs)
        ])
        return fund

    def test_not_linked_returns_unavailable(self):
        result = compute_fund_risk_metrics(self.instrument.id, self.household.id)
        self.assertFalse(result['available'])
        self.assertIn('Not linked', result['reason'])

    def test_insufficient_history_returns_unavailable(self):
        self._seed_benchmark(self.daily_returns)
        fund = ExternalFund.objects.create(instrument=self.instrument, mfapi_scheme_code='888888', scheme_name='Test Fund')
        # only a handful of NAV points — below MIN_DATA_POINTS
        for i, d in enumerate(self.dates[:5]):
            ExternalFundNav.objects.create(fund=fund, nav_date=d, nav=Decimal('50') + i)
        result = compute_fund_risk_metrics(self.instrument.id, self.household.id)
        self.assertFalse(result['available'])
        self.assertIn('Not enough', result['reason'])

    def test_fund_identical_to_benchmark_has_beta_near_one_alpha_near_zero(self):
        self._seed_benchmark(self.daily_returns)
        self._seed_fund(self.daily_returns)  # exact same daily returns as benchmark

        result = compute_fund_risk_metrics(self.instrument.id, self.household.id)
        self.assertTrue(result['available'])
        self.assertAlmostEqual(result['beta'], 1.0, delta=0.01)
        self.assertAlmostEqual(result['alpha_percent'], 0.0, delta=0.5)
        self.assertEqual(result['data_points'], len(self.dates))

    def test_fund_double_leveraged_has_beta_near_two(self):
        self._seed_benchmark(self.daily_returns)
        leveraged_returns = [r * 2 for r in self.daily_returns]
        self._seed_fund(leveraged_returns)

        result = compute_fund_risk_metrics(self.instrument.id, self.household.id)
        self.assertTrue(result['available'])
        self.assertAlmostEqual(result['beta'], 2.0, delta=0.05)

    def test_reports_date_range_and_data_points(self):
        self._seed_benchmark(self.daily_returns)
        self._seed_fund(self.daily_returns)
        result = compute_fund_risk_metrics(self.instrument.id, self.household.id)
        self.assertEqual(result['date_range']['start'], self.dates[0].isoformat())
        self.assertEqual(result['date_range']['end'], self.dates[-1].isoformat())
        self.assertGreaterEqual(result['data_points'], MIN_DATA_POINTS)


class MatchBenchmarkForFundTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Kapoor Family')

    def _make_instrument(self, fund_sub_category):
        instrument = Instrument.objects.create(
            household=self.household, name='Test Fund', instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )
        if fund_sub_category is not None:
            MutualFundDetails.objects.create(instrument=instrument, fund_category='Equity', fund_sub_category=fund_sub_category)
        return instrument

    def test_mid_cap_fund_matches_midcap_150(self):
        instrument = self._make_instrument('Mid Cap')
        benchmark = match_benchmark_for_fund(instrument)
        self.assertIsNotNone(benchmark)
        self.assertEqual(benchmark.category_match, 'mid_cap')

    def test_small_cap_fund_matches_smallcap_250(self):
        instrument = self._make_instrument('Small Cap')
        benchmark = match_benchmark_for_fund(instrument)
        self.assertIsNotNone(benchmark)
        self.assertEqual(benchmark.category_match, 'small_cap')

    def test_large_cap_fund_matches_nifty_50(self):
        instrument = self._make_instrument('Large Cap')
        benchmark = match_benchmark_for_fund(instrument)
        self.assertIsNotNone(benchmark)
        self.assertEqual(benchmark.category_match, 'large_cap')

    def test_flexi_cap_fund_matches_nifty_500(self):
        instrument = self._make_instrument('Flexi Cap')
        benchmark = match_benchmark_for_fund(instrument)
        self.assertIsNotNone(benchmark)
        self.assertEqual(benchmark.category_match, 'flexi_cap_broad_market')

    def test_debt_fund_matches_nothing(self):
        instrument = self._make_instrument('Corporate Bond')
        benchmark = match_benchmark_for_fund(instrument)
        self.assertIsNone(benchmark)

    def test_no_mf_details_matches_nothing(self):
        instrument = self._make_instrument(None)
        benchmark = match_benchmark_for_fund(instrument)
        self.assertIsNone(benchmark)


class ComputeBenchmarkComparisonTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Nair Family')
        self.instrument = Instrument.objects.create(
            household=self.household, name='Test Midcap Fund', instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )
        MutualFundDetails.objects.create(instrument=self.instrument, fund_category='Equity', fund_sub_category='Mid Cap')
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
        result = compute_benchmark_comparison(self.instrument.id)
        self.assertFalse(result['available'])
        self.assertIn('Not linked', result['reason'])

    def test_debt_fund_has_no_matching_benchmark(self):
        debt_instrument = Instrument.objects.create(
            household=self.household, name='Test Debt Fund', instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )
        MutualFundDetails.objects.create(instrument=debt_instrument, fund_category='Debt', fund_sub_category='Corporate Bond')
        ExternalFund.objects.create(instrument=debt_instrument, mfapi_scheme_code='999999', scheme_name='Test Debt Fund')

        result = compute_benchmark_comparison(debt_instrument.id)
        self.assertFalse(result['available'])
        self.assertIn('No matching benchmark', result['reason'])

    def test_outperforming_fund_is_not_flagged(self):
        fund = ExternalFund.objects.create(instrument=self.instrument, mfapi_scheme_code='888777', scheme_name='Test Midcap Fund')
        self._seed_nav(ExternalFundNav, 'fund', fund, 100, 0.20)
        self._seed_nav(BenchmarkFundNav, 'benchmark', self.midcap_benchmark, 100, 0.12)

        result = compute_benchmark_comparison(self.instrument.id)
        self.assertTrue(result['available'])
        self.assertEqual(result['benchmark_category_match'], 'mid_cap')
        self.assertFalse(result['underperforming'])
        self.assertGreater(result['periods']['3Y']['gap_percent'], 0)

    def test_underperforming_fund_beyond_threshold_is_flagged(self):
        fund = ExternalFund.objects.create(instrument=self.instrument, mfapi_scheme_code='888777', scheme_name='Test Midcap Fund')
        self._seed_nav(ExternalFundNav, 'fund', fund, 100, 0.05)
        self._seed_nav(BenchmarkFundNav, 'benchmark', self.midcap_benchmark, 100, 0.15)

        result = compute_benchmark_comparison(self.instrument.id)
        self.assertTrue(result['available'])
        self.assertTrue(result['underperforming'])
        self.assertLess(result['periods']['3Y']['gap_percent'], -UNDERPERFORMANCE_THRESHOLD_PERCENT)
