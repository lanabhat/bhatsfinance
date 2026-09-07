from datetime import date
from decimal import Decimal

from django.test import TestCase

from core.models import Household, Member
from instruments.models import Account, AllocationTarget, AssetCategory, Instrument, MutualFundDetails
from ledger.models import Transaction
from valuations.models import ValuationSnapshot
from insights.services import compute_cagr, compute_fund_performance, compute_holdings, compute_rebalancing, compute_xirr


class InsightsServiceTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Sharma Family')
        self.member = Member.objects.create(household=self.household, full_name='Amit Sharma')
        self.account = Account.objects.create(
            household=self.household,
            name='Zerodha',
            account_type=Account.AccountType.BROKER,
            primary_member=self.member,
        )
        self.instrument = Instrument.objects.create(
            household=self.household,
            default_account=self.account,
            name='Index ETF',
            instrument_type=Instrument.InstrumentType.EQUITY,
        )

    def test_holdings_recompute_for_backdated_transactions(self):
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2025, 3, 10),
            amount=Decimal('2000.00'),
            quantity=Decimal('10.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2025, 1, 10),
            amount=Decimal('1000.00'),
            quantity=Decimal('5.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2025, 4, 10),
            amount=Decimal('900.00'),
            quantity=Decimal('3.000000'),
            direction=Transaction.Direction.INFLOW,
            transaction_type=Transaction.TransactionType.SELL,
        )

        holdings = compute_holdings(self.household.id, date(2025, 4, 15))
        self.assertEqual(len(holdings), 1)
        self.assertEqual(holdings[0]['quantity'], Decimal('12.000000'))

    def test_xirr_with_mixed_cashflows(self):
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2024, 1, 10),
            amount=Decimal('100000.00'),
            quantity=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2025, 6, 10),
            amount=Decimal('5000.00'),
            direction=Transaction.Direction.INFLOW,
            transaction_type=Transaction.TransactionType.DIVIDEND,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=self.instrument,
            valuation_date=date(2026, 1, 10),
            unit_price=Decimal('1300.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )

        xirr = compute_xirr(self.household.id, date(2026, 1, 10))
        self.assertIsNotNone(xirr)
        self.assertGreater(xirr, 0)

    def test_xirr_with_buy_only_transactions(self):
        # A fund with only BUY transactions (no sells, no dividends) is the
        # common case — every flow is an outflow until the terminal market
        # value supplies the offsetting positive flow. Regression test for a
        # bug where the both-signs check ran before the terminal value was
        # appended, so buy-only holdings always returned None.
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2024, 1, 10),
            amount=Decimal('100000.00'),
            quantity=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=self.instrument,
            valuation_date=date(2025, 1, 10),
            unit_price=Decimal('1200.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )

        xirr = compute_xirr(self.household.id, date(2025, 1, 10))
        self.assertIsNotNone(xirr)
        self.assertGreater(xirr, 0)

    def test_cagr_doubling_over_one_year(self):
        # Closed-form check: a NAV that exactly doubles over exactly 1 year is
        # a 100% CAGR.
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2025, 1, 10),
            amount=Decimal('100000.00'),
            quantity=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=self.instrument,
            valuation_date=date(2025, 1, 10),
            unit_price=Decimal('1000.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=self.instrument,
            valuation_date=date(2026, 1, 10),
            unit_price=Decimal('2000.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )

        cagr = compute_cagr(self.household.id, date(2026, 1, 10), 12, self.instrument.id)
        self.assertIsNotNone(cagr)
        # period_months uses a fixed 30-day-month approximation for the start
        # date, so the "1 year" window is ~360 days rather than exactly 365 —
        # allow for that instead of expecting an exact 100%.
        self.assertAlmostEqual(cagr, 1.0, places=1)

    def test_cagr_unaffected_by_new_contribution_mid_period(self):
        # A fresh lump-sum buy inside the lookback window must not inflate
        # CAGR — CAGR tracks the fund's own NAV, not the position's total
        # market value (which moves with new money in as well as growth).
        # Regression test for a bug where CAGR used market_value directly.
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2024, 1, 10),
            amount=Decimal('100000.00'),
            quantity=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=self.instrument,
            valuation_date=date(2025, 5, 24),
            unit_price=Decimal('1000.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )
        # A large new purchase lands inside the 3-month lookback window —
        # this alone should not move the CAGR reading.
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2025, 8, 5),
            amount=Decimal('500000.00'),
            quantity=Decimal('476.190476'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=self.instrument,
            valuation_date=date(2025, 8, 22),
            unit_price=Decimal('1030.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )

        cagr = compute_cagr(self.household.id, date(2025, 8, 22), 3, self.instrument.id)
        self.assertIsNotNone(cagr)
        # NAV moved 1000 -> 1030 over ~90 days, a modest double-digit annualized
        # rate — nowhere near the multiples a market-value-based calculation
        # would produce once the ~5.76L new contribution is folded in.
        self.assertLess(cagr, 1.0)
        self.assertGreater(cagr, 0)

    def test_cagr_none_when_holding_predates_period(self):
        # A fund bought 2 months ago has no meaningful 3-year CAGR — must
        # return None rather than fabricating a number.
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2025, 11, 10),
            amount=Decimal('10000.00'),
            quantity=Decimal('10.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=self.instrument,
            valuation_date=date(2026, 1, 10),
            unit_price=Decimal('1050.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )

        cagr = compute_cagr(self.household.id, date(2026, 1, 10), 36, self.instrument.id)
        self.assertIsNone(cagr)


class FundPerformanceServiceTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.member = Member.objects.create(household=self.household, full_name='Deepa Iyer')
        self.account = Account.objects.create(
            household=self.household,
            name='Coin',
            account_type=Account.AccountType.BROKER,
            primary_member=self.member,
        )

    def _make_fund(self, name, fund_sub_category):
        instrument = Instrument.objects.create(
            household=self.household,
            default_account=self.account,
            name=name,
            instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )
        MutualFundDetails.objects.create(instrument=instrument, fund_category='Equity', fund_sub_category=fund_sub_category)
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=instrument,
            tx_date=date(2024, 1, 10),
            amount=Decimal('50000.00'),
            quantity=Decimal('500.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=instrument,
            valuation_date=date(2024, 1, 10),
            unit_price=Decimal('100.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=instrument,
            valuation_date=date(2025, 1, 10),
            unit_price=Decimal('112.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )
        return instrument

    def test_fund_performance_includes_allocation_xirr_and_cagr(self):
        fund_a = self._make_fund('Demo Large Cap', 'Large Cap')
        self._make_fund('Demo Mid Cap', 'Mid Cap')

        rows = compute_fund_performance(self.household.id, date(2025, 1, 10))
        self.assertEqual(len(rows), 2)
        row_a = next(r for r in rows if r['instrument_id'] == fund_a.id)
        self.assertEqual(row_a['fund_sub_category'], 'Large Cap')
        self.assertIsNotNone(row_a['xirr'])
        self.assertIsNotNone(row_a['cagr']['1Y'])
        self.assertIsNone(row_a['cagr']['5Y'])
        total_allocation = sum(r['allocation_percent'] for r in rows)
        self.assertAlmostEqual(float(total_allocation), 100.0, places=1)

    def test_fund_performance_excludes_non_fund_instruments(self):
        self._make_fund('Demo Flexi Cap', 'Flexi Cap')
        Instrument.objects.create(
            household=self.household,
            default_account=self.account,
            name='Direct Equity Stock',
            instrument_type=Instrument.InstrumentType.EQUITY,
        )

        rows = compute_fund_performance(self.household.id, date(2025, 1, 10))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['instrument_name'], 'Demo Flexi Cap')

    def test_fund_performance_empty_household_returns_empty_list(self):
        rows = compute_fund_performance(self.household.id, date(2025, 1, 10))
        self.assertEqual(rows, [])


class RebalancingServiceTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.member = Member.objects.create(household=self.household, full_name='Priya Rao')
        self.account = Account.objects.create(
            household=self.household,
            name='Groww',
            account_type=Account.AccountType.BROKER,
            primary_member=self.member,
        )
        self.equity_cat = AssetCategory.objects.create(household=self.household, name='Equity', color='#6366f1')
        self.debt_cat = AssetCategory.objects.create(household=self.household, name='Debt', color='#10b981')

        self.equity_fund = Instrument.objects.create(
            household=self.household,
            asset_category=self.equity_cat,
            name='Flexi Cap Fund',
            instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )
        self.debt_fund = Instrument.objects.create(
            household=self.household,
            asset_category=self.debt_cat,
            name='Liquid Fund',
            instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )
        self.liability = Instrument.objects.create(
            household=self.household,
            name='Home Loan',
            instrument_type=Instrument.InstrumentType.LIABILITY,
        )

        Transaction.objects.create(
            household=self.household, account=self.account, instrument=self.equity_fund,
            tx_date=date(2026, 1, 1), amount=Decimal('70000.00'), quantity=Decimal('700.000000'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )
        Transaction.objects.create(
            household=self.household, account=self.account, instrument=self.debt_fund,
            tx_date=date(2026, 1, 1), amount=Decimal('30000.00'), quantity=Decimal('300.000000'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )
        Transaction.objects.create(
            household=self.household, account=self.account, instrument=self.liability,
            tx_date=date(2026, 1, 1), amount=Decimal('500000.00'),
            direction=Transaction.Direction.INFLOW, transaction_type=Transaction.TransactionType.LOAN_DISBURSAL,
        )

    def test_liability_excluded_from_base(self):
        result = compute_rebalancing(self.household.id, date(2026, 2, 1))
        self.assertEqual(result['total_portfolio_value'], '100000.00')

    def test_current_percent_matches_holdings_split(self):
        result = compute_rebalancing(self.household.id, date(2026, 2, 1))
        by_name = {r['category_name']: r for r in result['rows']}
        self.assertEqual(by_name['Equity']['current_percent'], '70.00')
        self.assertEqual(by_name['Debt']['current_percent'], '30.00')

    def test_target_drift_and_suggested_action(self):
        AllocationTarget.objects.create(household=self.household, asset_category=self.equity_cat, target_percent=Decimal('50.00'))
        AllocationTarget.objects.create(household=self.household, asset_category=self.debt_cat, target_percent=Decimal('50.00'))

        result = compute_rebalancing(self.household.id, date(2026, 2, 1))
        by_name = {r['category_name']: r for r in result['rows']}

        self.assertEqual(by_name['Equity']['drift_percent'], '20.00')
        self.assertEqual(by_name['Equity']['suggested_action'], 'sell')
        self.assertEqual(by_name['Equity']['suggested_amount'], '20000.00')

        self.assertEqual(by_name['Debt']['drift_percent'], '-20.00')
        self.assertEqual(by_name['Debt']['suggested_action'], 'buy')
        self.assertEqual(by_name['Debt']['suggested_amount'], '20000.00')

    def test_target_with_zero_current_holdings_still_appears(self):
        gold_cat = AssetCategory.objects.create(household=self.household, name='Gold', color='#f59e0b')
        AllocationTarget.objects.create(household=self.household, asset_category=gold_cat, target_percent=Decimal('10.00'))

        result = compute_rebalancing(self.household.id, date(2026, 2, 1))
        by_name = {r['category_name']: r for r in result['rows']}

        self.assertIn('Gold', by_name)
        self.assertEqual(by_name['Gold']['current_value'], '0.00')
        self.assertEqual(by_name['Gold']['suggested_action'], 'buy')

    def test_excluded_instrument_removed_from_base_and_tracked_separately(self):
        self.equity_fund.include_in_rebalancing = False
        self.equity_fund.save(update_fields=['include_in_rebalancing'])

        result = compute_rebalancing(self.household.id, date(2026, 2, 1))
        self.assertEqual(result['total_portfolio_value'], '30000.00')
        self.assertEqual(result['excluded_value'], '70000.00')
        by_name = {r['category_name']: r for r in result['rows']}
        self.assertNotIn('Equity', by_name)
        self.assertEqual(by_name['Debt']['current_percent'], '100.00')


class OverlapServiceTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Nair Family')
        self.member = Member.objects.create(household=self.household, full_name='Anil Nair')
        self.account = Account.objects.create(
            household=self.household, name='Groww', account_type=Account.AccountType.BROKER, primary_member=self.member,
        )
        self.fund_a = Instrument.objects.create(household=self.household, name='Fund A', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)
        self.fund_b = Instrument.objects.create(household=self.household, name='Fund B', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)

        for inst in (self.fund_a, self.fund_b):
            Transaction.objects.create(
                household=self.household, account=self.account, instrument=inst,
                tx_date=date(2026, 1, 1), amount=Decimal('50000.00'), quantity=Decimal('500.000000'),
                direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
            )

    def _upload_holdings(self, instrument, holdings):
        from instruments.models import FundHolding, FundHoldingsSnapshot
        snapshot = FundHoldingsSnapshot.objects.create(instrument=instrument, as_of_date=date(2026, 7, 31))
        FundHolding.objects.bulk_create([
            FundHolding(snapshot=snapshot, isin=isin, instrument_name=name, weight_percent=Decimal(str(weight)))
            for isin, name, weight in holdings
        ])
        return snapshot

    def test_overlap_returns_none_without_uploaded_holdings(self):
        from insights.overlap import compute_fund_overlap
        result = compute_fund_overlap(self.fund_a.id, self.fund_b.id)
        self.assertIsNone(result)

    def test_overlap_percent_is_sum_of_min_weights(self):
        from insights.overlap import compute_fund_overlap
        self._upload_holdings(self.fund_a, [
            ('ISIN1', 'Stock 1', 10), ('ISIN2', 'Stock 2', 5), ('ISIN3', 'Stock 3', 8),
        ])
        self._upload_holdings(self.fund_b, [
            ('ISIN1', 'Stock 1', 6), ('ISIN2', 'Stock 2', 5), ('ISIN4', 'Stock 4', 12),
        ])
        result = compute_fund_overlap(self.fund_a.id, self.fund_b.id)
        # shared: ISIN1 min(10,6)=6, ISIN2 min(5,5)=5 -> 11
        self.assertEqual(result['overlap_percent'], '11.00')
        self.assertEqual(len(result['shared_holdings']), 2)

    def test_zero_overlap_between_disjoint_funds(self):
        from insights.overlap import compute_fund_overlap
        self._upload_holdings(self.fund_a, [('ISIN1', 'Stock 1', 10)])
        self._upload_holdings(self.fund_b, [('ISIN9', 'Stock 9', 10)])
        result = compute_fund_overlap(self.fund_a.id, self.fund_b.id)
        self.assertEqual(result['overlap_percent'], '0.00')
        self.assertEqual(result['shared_holdings'], [])

    def test_portfolio_diversification_flags_uncovered_instruments(self):
        from insights.overlap import compute_portfolio_diversification
        self._upload_holdings(self.fund_a, [('ISIN1', 'Stock 1', 10)])
        # fund_b has no uploaded holdings
        result = compute_portfolio_diversification(self.household.id, date(2026, 2, 1))
        self.assertIn(self.fund_a.id, result['covered_instrument_ids'])
        self.assertIn(self.fund_b.id, result['uncovered_instrument_ids'])
        self.assertEqual(result['pairs'], [])  # need 2 covered funds to form a pair


class AllocationTemplateTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Nair Family')
        self.member = Member.objects.create(household=self.household, full_name='Anil Nair', date_of_birth=date(1990, 6, 15))
        self.account = Account.objects.create(
            household=self.household, name='Bank', account_type=Account.AccountType.BANK, primary_member=self.member,
        )
        self.equity_cat = AssetCategory.objects.create(household=self.household, name='Equity', color='#6366f1')
        self.debt_cat = AssetCategory.objects.create(household=self.household, name='Debt', color='#10b981')
        self.mixed_cat = AssetCategory.objects.create(household=self.household, name='Mixed', color='#f59e0b')

        self.equity_fund = Instrument.objects.create(
            household=self.household, asset_category=self.equity_cat, name='Equity Fund', instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )
        self.fd = Instrument.objects.create(
            household=self.household, asset_category=self.debt_cat, name='FD', instrument_type=Instrument.InstrumentType.FD,
        )
        self.mixed_equity_leg = Instrument.objects.create(
            household=self.household, asset_category=self.mixed_cat, name='Mixed Equity Leg', instrument_type=Instrument.InstrumentType.EQUITY,
        )
        self.mixed_debt_leg = Instrument.objects.create(
            household=self.household, asset_category=self.mixed_cat, name='Mixed Debt Leg', instrument_type=Instrument.InstrumentType.FD,
        )

        for inst in (self.equity_fund, self.fd, self.mixed_equity_leg, self.mixed_debt_leg):
            Transaction.objects.create(
                household=self.household, account=self.account, instrument=inst,
                tx_date=date(2026, 1, 1), amount=Decimal('10000.00'),
                direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
            )

    def test_calculate_age(self):
        from insights.allocation_templates import calculate_age
        self.assertEqual(calculate_age(date(1990, 6, 15), date(2026, 6, 14)), 35)
        self.assertEqual(calculate_age(date(1990, 6, 15), date(2026, 6, 15)), 36)

    def test_suggest_age_based_split_100_minus_age(self):
        from insights.allocation_templates import suggest_age_based_split
        result = suggest_age_based_split(age=35, equity_base=100)
        self.assertEqual(result['equity_percent'], 65)
        self.assertEqual(result['debt_percent'], 35)

    def test_suggest_category_targets_classifies_clean_categories(self):
        from insights.allocation_templates import suggest_category_targets
        result = suggest_category_targets(self.household.id, date(2026, 2, 1), age=35, equity_base=100)
        by_name = {r['category_name']: r for r in result['categories']}
        self.assertEqual(by_name['Equity']['classification'], 'equity')
        self.assertEqual(by_name['Equity']['suggested_target_percent'], '65.00')
        self.assertEqual(by_name['Debt']['classification'], 'debt')
        self.assertEqual(by_name['Debt']['suggested_target_percent'], '35.00')

    def test_suggest_category_targets_does_not_invent_split_for_mixed_category(self):
        from insights.allocation_templates import suggest_category_targets
        result = suggest_category_targets(self.household.id, date(2026, 2, 1), age=35, equity_base=100)
        by_name = {r['category_name']: r for r in result['categories']}
        self.assertEqual(by_name['Mixed']['classification'], 'mixed')
        self.assertIsNone(by_name['Mixed']['suggested_target_percent'])
