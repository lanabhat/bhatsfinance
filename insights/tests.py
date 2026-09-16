from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Household, Member, UserProfile
from instruments.models import Account, AllocationTarget, AssetCategory, Instrument, Investment, MutualFundDetails
from instruments.services import get_or_create_mf_shell
from ledger.models import Transaction
from valuations.models import ValuationSnapshot
from insights.services import compute_cagr, compute_fund_performance, compute_holdings, compute_rebalancing, compute_xirr, holding_display_name


def _approved_client(household):
    user = get_user_model().objects.create_user(username='tester', password='x')
    UserProfile.objects.create(user=user, household=household, role='admin', status='approved')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


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
    """Funds are Investments under the household's shared "Mutual Fund"
    Instrument shell (Milestone 2 of the Investment redesign) — each Investment's
    XIRR/CAGR is isolated via investment_id in compute_xirr()/compute_cagr(),
    since the shell instrument_id alone can no longer distinguish funds."""

    def setUp(self):
        from instruments.models import Investment
        from instruments.services import get_or_create_mf_shell

        self.household = Household.objects.create(name='Iyer Family')
        self.member = Member.objects.create(household=self.household, full_name='Deepa Iyer')
        self.account = Account.objects.create(
            household=self.household,
            name='Coin',
            account_type=Account.AccountType.BROKER,
            primary_member=self.member,
        )
        self.shell = get_or_create_mf_shell(self.household)
        self.shell.default_account = self.account
        self.shell.save(update_fields=['default_account'])

    def _make_fund(self, name, fund_sub_category):
        from instruments.models import Investment

        investment = Investment.objects.create(instrument=self.shell, name=name)
        MutualFundDetails.objects.create(investment=investment, fund_category='Equity', fund_sub_category=fund_sub_category)
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.shell,
            investment=investment,
            tx_date=date(2024, 1, 10),
            amount=Decimal('50000.00'),
            quantity=Decimal('500.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=self.shell,
            investment=investment,
            valuation_date=date(2024, 1, 10),
            unit_price=Decimal('100.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            instrument=self.shell,
            investment=investment,
            valuation_date=date(2025, 1, 10),
            unit_price=Decimal('112.000000'),
            source=ValuationSnapshot.SourceType.MANUAL,
        )
        return investment

    def test_fund_performance_includes_allocation_xirr_and_cagr(self):
        fund_a = self._make_fund('Demo Large Cap', 'Large Cap')
        self._make_fund('Demo Mid Cap', 'Mid Cap')

        rows = compute_fund_performance(self.household.id, date(2025, 1, 10))
        self.assertEqual(len(rows), 2)
        row_a = next(r for r in rows if r['investment_id'] == fund_a.id)
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


class HoldingsViewDisplayNameTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.client = _approved_client(self.household)
        self.shell = get_or_create_mf_shell(self.household)
        self.investment = Investment.objects.create(instrument=self.shell, name='Flexi Cap Fund', folio_no='12345')
        Transaction.objects.create(
            household=self.household, instrument=self.shell, investment=self.investment,
            tx_date=date(2025, 1, 10), amount=Decimal('1000.00'), quantity=Decimal('10.000000'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )
        self.fd_instrument = Instrument.objects.create(
            household=self.household, name='HDFC Bank FD', instrument_type=Instrument.InstrumentType.FD,
        )
        Transaction.objects.create(
            household=self.household, instrument=self.fd_instrument,
            tx_date=date(2025, 1, 10), amount=Decimal('5000.00'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )

    def test_investment_backed_holding_shows_real_fund_name(self):
        response = self.client.get(f'/api/holdings?household_id={self.household.id}&as_of=2025-06-01')
        self.assertEqual(response.status_code, 200)
        holdings = {h['investment_id'] or h['instrument_id']: h for h in response.data['holdings']}
        mf_holding = holdings[self.investment.id]
        self.assertEqual(mf_holding['instrument_name'], 'Mutual Fund')
        self.assertEqual(mf_holding['investment_name'], 'Flexi Cap Fund')
        self.assertEqual(mf_holding['display_name'], 'Flexi Cap Fund')
        self.assertEqual(mf_holding['investment_id'], self.investment.id)

    def test_non_investment_holding_falls_back_to_instrument_name(self):
        response = self.client.get(f'/api/holdings?household_id={self.household.id}&as_of=2025-06-01')
        fd_holding = next(h for h in response.data['holdings'] if h['instrument_id'] == self.fd_instrument.id)
        self.assertIsNone(fd_holding['investment_id'])
        self.assertEqual(fd_holding['display_name'], 'HDFC Bank FD')

    def test_holding_display_name_helper(self):
        self.assertEqual(holding_display_name({'investment_name': 'Real Fund', 'instrument_name': 'Mutual Fund'}), 'Real Fund')
        self.assertEqual(holding_display_name({'investment_name': None, 'instrument_name': 'HDFC Bank FD'}), 'HDFC Bank FD')


class HoldingsRealizedGainTotalTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.client = _approved_client(self.household)
        self.shell = get_or_create_mf_shell(self.household)
        self.investment = Investment.objects.create(instrument=self.shell, name='Flexi Cap Fund', folio_no='12345')
        # Buy 100 units @ 100/unit = 10000 invested.
        Transaction.objects.create(
            household=self.household, instrument=self.shell, investment=self.investment,
            tx_date=date(2025, 1, 1), amount=Decimal('10000.00'), quantity=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )

    def _holding(self, response):
        return next(h for h in response.data['holdings'] if h['investment_id'] == self.investment.id)

    def test_never_sold_holding_has_zero_realized_gain(self):
        response = self.client.get(f'/api/holdings?household_id={self.household.id}&as_of=2025-06-01')
        self.assertEqual(Decimal(self._holding(response)['realized_gain_total']), Decimal('0.00'))

    def test_partial_sell_realized_gain_appears_while_still_holding(self):
        # Sell 40 units @ 150/unit -> realized_gain = 6000 - 4000 = 2000.
        self.client.post('/api/transactions/', {
            'household': self.household.id, 'instrument': self.shell.id, 'investment': self.investment.id,
            'tx_date': '2025-02-01', 'amount': '6000.00', 'quantity': '40.000000',
            'direction': 'inflow', 'transaction_type': 'sell',
        }, format='json')
        response = self.client.get(f'/api/holdings?household_id={self.household.id}&as_of=2025-06-01')
        holding = self._holding(response)
        self.assertEqual(Decimal(holding['realized_gain_total']), Decimal('2000.00'))
        self.assertEqual(Decimal(holding['quantity']), Decimal('60.000000'))

    def test_fully_exited_position_still_returned_with_realized_gain(self):
        # Sell all 100 units @ 80/unit -> realized_gain = 8000 - 10000 = -2000 (a loss).
        self.client.post('/api/transactions/', {
            'household': self.household.id, 'instrument': self.shell.id, 'investment': self.investment.id,
            'tx_date': '2025-02-01', 'amount': '8000.00', 'quantity': '100.000000',
            'direction': 'inflow', 'transaction_type': 'sell',
        }, format='json')
        response = self.client.get(f'/api/holdings?household_id={self.household.id}&as_of=2025-06-01')
        holding = self._holding(response)
        self.assertEqual(Decimal(holding['quantity']), Decimal('0.000000'))
        self.assertEqual(Decimal(holding['realized_gain_total']), Decimal('-2000.00'))


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
    """Fund A/B are Investments under the household's shared "Mutual Fund"
    Instrument shell (Milestone 2 of the Investment redesign) — matching how
    real MF/SIP holdings are shaped post-migration, rather than each fund
    getting its own Instrument."""

    def setUp(self):
        from instruments.models import Investment
        from instruments.services import get_or_create_mf_shell

        self.household = Household.objects.create(name='Nair Family')
        self.member = Member.objects.create(household=self.household, full_name='Anil Nair')
        self.account = Account.objects.create(
            household=self.household, name='Groww', account_type=Account.AccountType.BROKER, primary_member=self.member,
        )
        self.shell = get_or_create_mf_shell(self.household)
        self.fund_a = Investment.objects.create(instrument=self.shell, name='Fund A')
        self.fund_b = Investment.objects.create(instrument=self.shell, name='Fund B')

        for inv in (self.fund_a, self.fund_b):
            Transaction.objects.create(
                household=self.household, account=self.account, instrument=self.shell, investment=inv,
                tx_date=date(2026, 1, 1), amount=Decimal('50000.00'), quantity=Decimal('500.000000'),
                direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
            )

    def _upload_holdings(self, investment, holdings):
        from instruments.models import FundHolding, FundHoldingsSnapshot
        snapshot = FundHoldingsSnapshot.objects.create(investment=investment, as_of_date=date(2026, 7, 31))
        FundHolding.objects.bulk_create([
            FundHolding(snapshot=snapshot, isin=isin, instrument_name=name, weight_percent=Decimal(str(weight)))
            for isin, name, weight in holdings
        ])
        return snapshot

    def test_overlap_returns_none_without_uploaded_holdings(self):
        from insights.overlap import compute_fund_overlap
        result = compute_fund_overlap(('investment', self.fund_a.id), ('investment', self.fund_b.id))
        self.assertIsNone(result)

    def test_overlap_percent_is_sum_of_min_weights(self):
        from insights.overlap import compute_fund_overlap
        self._upload_holdings(self.fund_a, [
            ('ISIN1', 'Stock 1', 10), ('ISIN2', 'Stock 2', 5), ('ISIN3', 'Stock 3', 8),
        ])
        self._upload_holdings(self.fund_b, [
            ('ISIN1', 'Stock 1', 6), ('ISIN2', 'Stock 2', 5), ('ISIN4', 'Stock 4', 12),
        ])
        result = compute_fund_overlap(('investment', self.fund_a.id), ('investment', self.fund_b.id))
        # shared: ISIN1 min(10,6)=6, ISIN2 min(5,5)=5 -> 11
        self.assertEqual(result['overlap_percent'], '11.00')
        self.assertEqual(len(result['shared_holdings']), 2)

    def test_zero_overlap_between_disjoint_funds(self):
        from insights.overlap import compute_fund_overlap
        self._upload_holdings(self.fund_a, [('ISIN1', 'Stock 1', 10)])
        self._upload_holdings(self.fund_b, [('ISIN9', 'Stock 9', 10)])
        result = compute_fund_overlap(('investment', self.fund_a.id), ('investment', self.fund_b.id))
        self.assertEqual(result['overlap_percent'], '0.00')
        self.assertEqual(result['shared_holdings'], [])

    def test_portfolio_diversification_flags_uncovered_instruments(self):
        from insights.overlap import compute_portfolio_diversification
        self._upload_holdings(self.fund_a, [('ISIN1', 'Stock 1', 10)])
        # fund_b has no uploaded holdings
        result = compute_portfolio_diversification(self.household.id, date(2026, 2, 1))
        self.assertIn(self.fund_a.id, result['covered_investment_ids'])
        self.assertIn(self.fund_b.id, result['uncovered_investment_ids'])
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
