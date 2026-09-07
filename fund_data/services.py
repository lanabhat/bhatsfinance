"""Real Sharpe ratio / alpha / beta / standard deviation, computed from actual daily
NAV history (ExternalFundNav) against a Nifty 50 index fund proxy (BenchmarkFundNav).

Standard, well-established formulas — no invented metrics:
  - daily return_t = nav_t / nav_(t-1) - 1
  - standard_deviation: stdev(daily returns), annualized by * sqrt(252)
  - beta: cov(fund_returns, benchmark_returns) / var(benchmark_returns)
  - alpha (Jensen's alpha, CAPM): annualized_fund_return - risk_free
        - beta * (annualized_benchmark_return - risk_free)
  - sharpe_ratio: (annualized_fund_return - risk_free) / annualized_std_dev

Every result reports the actual date range and number of data points used, since a
fund linked only recently won't have a full window of history yet. Returns None
(with a reason) rather than silently substituting a guess when data is insufficient.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from statistics import StatisticsError, mean, pstdev

TRADING_DAYS_PER_YEAR = 252
MIN_DATA_POINTS = 30  # below this, risk metrics are too noisy to be meaningful

# 3-year fund-vs-benchmark gap beyond which a fund is flagged as underperforming
# its category benchmark. A named constant (not inlined) so it's easy to tune.
UNDERPERFORMANCE_THRESHOLD_PERCENT = 2.0

# fund_sub_category (free text, e.g. "Large Cap", "Flexi Cap") -> BenchmarkFund.category_match.
# Ordered so more specific substrings ("small cap") are checked before broader
# ones that could otherwise false-match ("cap"). Debt/liquid/hybrid sub-categories
# intentionally have no entry — compute_benchmark_comparison() returns "no match"
# rather than forcing an inaccurate equity index onto them.
_SUB_CATEGORY_MATCH_ORDER = [
    ('small cap', 'small_cap'),
    ('mid cap', 'mid_cap'),
    ('large cap', 'large_cap'),
    ('bluechip', 'large_cap'),
    ('flexi cap', 'flexi_cap_broad_market'),
    ('multi cap', 'flexi_cap_broad_market'),
    ('large & mid cap', 'flexi_cap_broad_market'),
]


def match_benchmark_for_fund(instrument) -> 'BenchmarkFund | None':
    """Map an Instrument's MutualFundDetails.fund_sub_category to the BenchmarkFund
    row that most accurately tracks its market-cap segment. Returns None (never a
    fallback guess) when the sub-category doesn't map to any seeded benchmark —
    e.g. debt/liquid/hybrid funds, which have no clean index-fund equivalent."""
    from fund_data.models import BenchmarkFund

    details = getattr(instrument, 'mf_details', None)
    sub_category = (details.fund_sub_category if details else '') or ''
    sub_category_lower = sub_category.lower()

    for needle, category_match in _SUB_CATEGORY_MATCH_ORDER:
        if needle in sub_category_lower:
            return BenchmarkFund.objects.filter(category_match=category_match).first()
    return None


def _daily_returns(nav_rows: list[tuple[date, Decimal]]) -> list[float]:
    returns = []
    for (_, prev_nav), (_, nav) in zip(nav_rows, nav_rows[1:]):
        if prev_nav and prev_nav != 0:
            returns.append(float(nav / prev_nav - 1))
    return returns


def _annualize_return(daily_returns: list[float]) -> float:
    avg_daily = mean(daily_returns)
    return avg_daily * TRADING_DAYS_PER_YEAR


def _annualize_stdev(daily_returns: list[float]) -> float:
    return pstdev(daily_returns) * (TRADING_DAYS_PER_YEAR ** 0.5)


def _covariance(a: list[float], b: list[float]) -> float:
    ma, mb = mean(a), mean(b)
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / len(a)


def compute_fund_risk_metrics(instrument_id: int, household_id: int, window_days: int = 365) -> dict:
    from core.models import Household
    from fund_data.models import BenchmarkFund, ExternalFund, ExternalFundNav, BenchmarkFundNav

    try:
        external_fund = ExternalFund.objects.get(instrument_id=instrument_id)
    except ExternalFund.DoesNotExist:
        return {'available': False, 'reason': 'Not linked to a NAV data source yet.'}

    # Prefer the benchmark matched to the fund's own category (mid-cap fund vs
    # Nifty Midcap 150, etc.); fall back to Nifty 50 for funds with no category
    # match (or no MutualFundDetails at all) so this stays backward-compatible
    # with the original single-benchmark Sharpe/beta/alpha feature.
    benchmark = match_benchmark_for_fund(external_fund.instrument) or BenchmarkFund.objects.filter(category_match='large_cap').first() or BenchmarkFund.objects.first()
    if benchmark is None:
        return {'available': False, 'reason': 'No benchmark fund configured.'}

    cutoff = date.today() - timedelta(days=window_days)
    fund_navs = list(
        ExternalFundNav.objects.filter(fund=external_fund, nav_date__gte=cutoff).order_by('nav_date').values_list('nav_date', 'nav')
    )
    benchmark_navs = list(
        BenchmarkFundNav.objects.filter(benchmark=benchmark, nav_date__gte=cutoff).order_by('nav_date').values_list('nav_date', 'nav')
    )

    if len(fund_navs) < MIN_DATA_POINTS or len(benchmark_navs) < MIN_DATA_POINTS:
        return {
            'available': False,
            'reason': f'Not enough NAV history yet (have {len(fund_navs)} fund / {len(benchmark_navs)} '
                      f'benchmark points in the last {window_days} days, need at least {MIN_DATA_POINTS}). '
                      f'Run the NAV sync again after some time has passed, or widen the window.',
        }

    # Align on common dates only, so both return series are computed over the exact same days.
    fund_by_date = dict(fund_navs)
    bench_by_date = dict(benchmark_navs)
    common_dates = sorted(set(fund_by_date) & set(bench_by_date))
    if len(common_dates) < MIN_DATA_POINTS:
        return {
            'available': False,
            'reason': f'Only {len(common_dates)} overlapping NAV dates between the fund and benchmark '
                      f'in this window (need at least {MIN_DATA_POINTS}).',
        }

    fund_series = [(d, fund_by_date[d]) for d in common_dates]
    bench_series = [(d, bench_by_date[d]) for d in common_dates]

    fund_returns = _daily_returns(fund_series)
    bench_returns = _daily_returns(bench_series)

    try:
        annualized_fund_return = _annualize_return(fund_returns)
        annualized_bench_return = _annualize_return(bench_returns)
        annualized_std_dev = _annualize_stdev(fund_returns)
        bench_variance = pstdev(bench_returns) ** 2
    except StatisticsError:
        return {'available': False, 'reason': 'Not enough data points to compute statistics.'}

    household = Household.objects.get(pk=household_id)
    risk_free = float(household.risk_free_rate_percent) / 100

    beta = _covariance(fund_returns, bench_returns) / bench_variance if bench_variance else None
    alpha = None
    sharpe_ratio = None
    if beta is not None:
        alpha = (annualized_fund_return - risk_free) - beta * (annualized_bench_return - risk_free)
    if annualized_std_dev:
        sharpe_ratio = (annualized_fund_return - risk_free) / annualized_std_dev

    return {
        'available': True,
        'date_range': {'start': common_dates[0].isoformat(), 'end': common_dates[-1].isoformat()},
        'data_points': len(common_dates),
        'benchmark_name': benchmark.name,
        'benchmark_category_match': benchmark.category_match,
        'risk_free_rate_percent': str(household.risk_free_rate_percent),
        'annualized_return_percent': round(annualized_fund_return * 100, 2),
        'standard_deviation_percent': round(annualized_std_dev * 100, 2),
        'beta': round(beta, 3) if beta is not None else None,
        'alpha_percent': round(alpha * 100, 2) if alpha is not None else None,
        'sharpe_ratio': round(sharpe_ratio, 3) if sharpe_ratio is not None else None,
    }


def _nav_cagr(nav_qs, as_of: date, period_months: int) -> float | None:
    """Point-to-point CAGR from a NAV queryset (ExternalFundNav/BenchmarkFundNav),
    using the nearest available nav_date at-or-before each end of the window.
    Mirrors insights.services.compute_cagr's fixed 30-day-month period math."""
    start_date = as_of - timedelta(days=period_months * 30)

    start_row = nav_qs.filter(nav_date__lte=start_date).order_by('-nav_date').first()
    end_row = nav_qs.filter(nav_date__lte=as_of).order_by('-nav_date').first()
    if not start_row or not end_row or start_row.nav <= 0 or end_row.nav <= 0:
        return None

    years = (as_of - start_date).days / 365.0
    if years <= 0:
        return None
    try:
        return round((float(end_row.nav) / float(start_row.nav)) ** (1 / years) - 1, 6)
    except (ZeroDivisionError, ValueError, OverflowError):
        return None


def compute_benchmark_comparison(instrument_id: int, as_of: date | None = None) -> dict:
    """Fund CAGR vs its category-matched benchmark's own CAGR, over 1Y/3Y/5Y,
    plus the gap and an underperforming flag (3Y gap > UNDERPERFORMANCE_THRESHOLD_PERCENT).

    Returns {'available': False, 'reason': ...} when the fund isn't linked to NAV
    data, or its category has no matching benchmark (debt/liquid/hybrid funds) —
    never a fallback to an inaccurate equity benchmark."""
    from fund_data.models import ExternalFund, ExternalFundNav, BenchmarkFundNav

    as_of = as_of or date.today()

    try:
        external_fund = ExternalFund.objects.get(instrument_id=instrument_id)
    except ExternalFund.DoesNotExist:
        return {'available': False, 'reason': 'Not linked to a NAV data source yet.'}

    benchmark = match_benchmark_for_fund(external_fund.instrument)
    if benchmark is None:
        return {'available': False, 'reason': 'No matching benchmark available for this fund\'s category.'}

    fund_nav_qs = ExternalFundNav.objects.filter(fund=external_fund)
    bench_nav_qs = BenchmarkFundNav.objects.filter(benchmark=benchmark)

    periods = [('1Y', 12), ('3Y', 36), ('5Y', 60)]
    comparison = {}
    for label, months in periods:
        fund_cagr = _nav_cagr(fund_nav_qs, as_of, months)
        bench_cagr = _nav_cagr(bench_nav_qs, as_of, months)
        gap = None
        if fund_cagr is not None and bench_cagr is not None:
            gap = round((fund_cagr - bench_cagr) * 100, 2)
        comparison[label] = {'fund_cagr': fund_cagr, 'benchmark_cagr': bench_cagr, 'gap_percent': gap}

    gap_3y = comparison['3Y']['gap_percent']
    underperforming = gap_3y is not None and gap_3y < -UNDERPERFORMANCE_THRESHOLD_PERCENT

    return {
        'available': True,
        'benchmark_name': benchmark.name,
        'benchmark_category_match': benchmark.category_match,
        'periods': comparison,
        'underperforming': underperforming,
    }
