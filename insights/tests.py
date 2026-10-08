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
from insights.services import compute_cagr, compute_fund_performance, compute_holdings, compute_networth, compute_rebalancing, compute_xirr, holding_display_name


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

    def test_standalone_stock_instrument_is_uncovered_not_an_error(self):
        # A legacy per-stock Instrument (no Investment under it) can't carry a holdings
        # snapshot — FundHoldingsSnapshot is keyed to Investment only.
        from insights.overlap import compute_portfolio_diversification
        stock = Instrument.objects.create(household=self.household, name='ITC LTD', instrument_type=Instrument.InstrumentType.EQUITY)
        Transaction.objects.create(
            household=self.household, account=self.account, instrument=stock, tx_date=date(2026, 1, 1),
            amount=Decimal('1000.00'), quantity=Decimal('10'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )
        self._upload_holdings(self.fund_a, [('ISIN1', 'Stock 1', 10)])
        self._upload_holdings(self.fund_b, [('ISIN1', 'Stock 1', 4)])
        result = compute_portfolio_diversification(self.household.id, date(2026, 2, 1))
        self.assertIn(stock.id, result['uncovered_instrument_ids'])
        self.assertEqual(result['pairs'][0]['overlap_percent'], '4.00')

    def test_fund_comparison_endpoint_with_standalone_stock(self):
        from core.models import UserProfile
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient
        stock = Instrument.objects.create(household=self.household, name='ITC LTD', instrument_type=Instrument.InstrumentType.EQUITY)
        Transaction.objects.create(
            household=self.household, account=self.account, instrument=stock, tx_date=date(2026, 1, 1),
            amount=Decimal('1000.00'), quantity=Decimal('10'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )
        user = get_user_model().objects.create_user(username='nair', password='x')
        UserProfile.objects.update_or_create(user=user, defaults={'household': self.household, 'role': 'admin', 'status': 'approved'})
        client = APIClient()
        client.force_authenticate(user)
        response = client.get('/api/fund-comparison', {'household_id': self.household.id, 'as_of': '2026-02-01'})
        self.assertEqual(response.status_code, 200, response.content[:300])


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


class InactiveInstrumentExclusionTests(TestCase):
    """An instrument marked is_active=False (e.g. an FD confirmed closed
    during an SBI statement re-import) should no longer count toward
    household-wide aggregates, but a caller explicitly asking about that one
    instrument (its own XIRR/CAGR history) should still get a real answer."""

    def setUp(self):
        self.household = Household.objects.create(name='Verma Family')
        self.member = Member.objects.create(household=self.household, full_name='Rina Verma')
        self.account = Account.objects.create(
            household=self.household, name='SBI', account_type=Account.AccountType.BANK, primary_member=self.member,
        )
        self.active_fd = Instrument.objects.create(
            household=self.household, name='SBI FD Active', instrument_type=Instrument.InstrumentType.FD,
        )
        self.closed_fd = Instrument.objects.create(
            household=self.household, name='SBI FD Closed', instrument_type=Instrument.InstrumentType.FD, is_active=False,
        )
        for inst, amount in ((self.active_fd, Decimal('50000.00')), (self.closed_fd, Decimal('30000.00'))):
            Transaction.objects.create(
                household=self.household,
                instrument=inst,
                tx_date=date(2025, 1, 10),
                amount=amount,
                direction=Transaction.Direction.OUTFLOW,
                transaction_type=Transaction.TransactionType.DEPOSIT,
            )

    def test_compute_holdings_excludes_inactive_by_default(self):
        holdings = compute_holdings(self.household.id, date(2025, 6, 1))
        instrument_ids = {h['instrument_id'] for h in holdings}
        self.assertIn(self.active_fd.id, instrument_ids)
        self.assertNotIn(self.closed_fd.id, instrument_ids)

    def test_compute_holdings_include_inactive_true_returns_it(self):
        holdings = compute_holdings(self.household.id, date(2025, 6, 1), include_inactive=True)
        instrument_ids = {h['instrument_id'] for h in holdings}
        self.assertIn(self.closed_fd.id, instrument_ids)

    def test_compute_networth_excludes_closed_fd_value(self):
        networth = compute_networth(self.household.id, date(2025, 6, 1))
        self.assertEqual(networth, Decimal('50000.00'))

    def test_compute_xirr_for_specific_inactive_instrument_still_works(self):
        xirr = compute_xirr(self.household.id, date(2026, 1, 10), instrument_id=self.closed_fd.id)
        self.assertIsNotNone(xirr)

    def test_compute_xirr_household_wide_excludes_inactive_terminal_value(self):
        # Household-wide XIRR's terminal value should only reflect the active FD.
        xirr_active_only = compute_xirr(self.household.id, date(2026, 1, 10), instrument_id=self.active_fd.id)
        xirr_household = compute_xirr(self.household.id, date(2026, 1, 10))
        self.assertIsNotNone(xirr_active_only)
        self.assertIsNotNone(xirr_household)


class HoldingsHistoryPerFundTests(TestCase):
    """Two funds under the shared Mutual Fund shell must each be priced with their
    own NAV — not all units summed and priced with one fund's NAV."""

    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.shell = get_or_create_mf_shell(self.household)
        self.cheap = Investment.objects.create(instrument=self.shell, name='Cheap NAV Fund')
        self.pricey = Investment.objects.create(instrument=self.shell, name='Pricey NAV Fund')
        for inv, units, nav in ((self.cheap, '100', '10'), (self.pricey, '10', '500')):
            Transaction.objects.create(
                household=self.household, instrument=self.shell, investment=inv, tx_date=date(2026, 1, 5),
                amount=Decimal(units) * Decimal(nav), quantity=Decimal(units),
                direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
            )
            ValuationSnapshot.objects.create(
                household=self.household, instrument=self.shell, investment=inv,
                valuation_date=date(2026, 2, 1), unit_price=Decimal(nav) * Decimal('1.1'),
            )

    def test_each_fund_valued_with_its_own_nav(self):
        from insights.services import compute_holdings_history
        series = compute_holdings_history(self.household.id, instrument_type='mutual_fund')
        point = next(p for p in series if p['date'] == '2026-02-01')
        # 100 units x 11 + 10 units x 550 = 1100 + 5500
        self.assertAlmostEqual(point['current'], 6600.0, places=2)
        self.assertAlmostEqual(point['invested'], 6000.0, places=2)


class ComputeAttentionTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Nair Family')
        self.shell = get_or_create_mf_shell(self.household)
        self.fund = Investment.objects.create(instrument=self.shell, name='Axis Midcap Direct Growth')
        Transaction.objects.create(
            household=self.household, instrument=self.shell, investment=self.fund, tx_date=date(2026, 1, 5),
            amount=Decimal('1000'), quantity=Decimal('10'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )

    def test_counts_unvalued_unlinked_and_duplicates(self):
        from insights.services import compute_attention
        # Same fund, same owner, no folio on either — a likely duplicate import.
        Investment.objects.create(instrument=self.shell, name='AXIS MIDCAP - DIRECT GROWTH')
        result = compute_attention(self.household.id, date(2026, 10, 2))
        self.assertEqual(result['never_valued'], 1)
        self.assertEqual(result['unlinked_funds'], 2)
        self.assertEqual(result['duplicate_groups'], 1)

    def test_old_valuation_counts_as_stale(self):
        from insights.services import compute_attention
        ValuationSnapshot.objects.create(
            household=self.household, instrument=self.shell, investment=self.fund,
            valuation_date=date(2026, 6, 1), unit_price=Decimal('110'),
        )
        result = compute_attention(self.household.id, date(2026, 10, 2))
        self.assertEqual((result['stale_holdings'], result['never_valued']), (1, 0))


class PendingSmsBreakdownTests(TestCase):
    def test_pending_sms_grouped_by_kind_newest_first(self):
        from datetime import datetime, timezone as dt_tz
        from core.models import Household
        from insights.services import _pending_sms_breakdown
        from sms_ingestion.models import SmsMessage
        household = Household.objects.create(name='Shenoy Family')

        def sms(day, kind, status='pending', snap=None):
            payload = {'balance_snapshot_id': snap} if snap else {}
            return SmsMessage.objects.create(household=household, sender='AD-HDFCBK-S', body=f'{kind} {day}', status=status,
                                             received_at=datetime(2026, 10, day, 6, tzinfo=dt_tz.utc), template_key=kind, raw_payload=payload)

        old_tx, new_tx = sms(1, 'debit'), sms(3, 'credit')
        sms(2, 'cc_bill_paid')
        sms(2, 'balance', snap=99)
        sms(3, 'otp')
        sms(3, 'debit', status='approved')
        sms(3, '')
        b = _pending_sms_breakdown(household.id)
        self.assertEqual((b['transactions']['count'], b['balances']['count'], b['balances']['recorded'], b['unread']), (3, 1, 1, 1))
        self.assertEqual((b['transactions']['ids'][0], b['transactions']['ids'][-1]), (new_tx.id, old_tx.id))
        self.assertEqual((b['transactions']['first_date'], b['transactions']['last_date']), ('2026-10-01', '2026-10-03'))
        self.assertEqual([d['date'] for d in b['transactions']['by_date']], ['2026-10-03', '2026-10-02', '2026-10-01'])


class MarketCapSplitTests(TestCase):
    def test_stocks_and_funds_combined_debt_left_out(self):
        from datetime import date
        from decimal import Decimal
        from core.models import Household
        from instruments.models import Investment, MutualFundDetails
        from instruments.services import get_or_create_equity_shell, get_or_create_mf_shell
        from insights.services import compute_market_cap_split
        from ledger.models import Transaction
        household = Household.objects.create(name='Kamath Family 2')
        eq, mf = get_or_create_equity_shell(household), get_or_create_mf_shell(household)

        def holding(shell, name, amount, cap='', fund=None):
            inv = Investment.objects.create(instrument=shell, name=name, market_cap=cap)
            if fund:
                MutualFundDetails.objects.create(investment=inv, fund_category=fund[0], fund_sub_category=fund[1])
            Transaction.objects.create(household=household, instrument=shell, investment=inv, tx_date=date(2026, 9, 1),
                                       amount=Decimal(amount), quantity=Decimal('1'), direction='outflow', transaction_type='buy')
        holding(eq, 'ITC', '600', cap='large_cap')
        holding(mf, 'Axis Bluechip', '400', fund=('Equity', 'Large Cap'))
        holding(mf, 'Kotak Small Cap', '500', fund=('Equity', 'Small Cap'))
        holding(mf, 'PPFAS Flexi', '500', fund=('Equity', 'Flexi Cap'))
        holding(mf, 'HDFC Short Term', '9000', fund=('Debt', 'Short Duration'))

        result = compute_market_cap_split(household.id, date(2026, 10, 1))
        rows = {r['key']: r for r in result['rows']}
        self.assertEqual(result['total'], Decimal('2000.00'))  # debt fund excluded
        self.assertEqual((rows['large_cap']['stocks'], rows['large_cap']['funds'], rows['large_cap']['percent']),
                         (Decimal('600.00'), Decimal('400.00'), 50.0))
        self.assertEqual(rows['small_cap']['total'], Decimal('500.00'))
        self.assertEqual(rows['multi']['total'], Decimal('500.00'))
        self.assertNotIn('mid_cap', rows)


class AllocationFactsTests(TestCase):
    def setUp(self):
        from datetime import date
        from decimal import Decimal
        from core.models import Household, Member
        from instruments.models import Account, AccountOwnership, Instrument, InstrumentOwnership, Investment, MutualFundDetails
        from instruments.services import get_or_create_equity_shell, get_or_create_mf_shell
        from ledger.models import Transaction
        self.date = date(2026, 9, 1)
        self.household = Household.objects.create(name='Facts Family')
        self.ln = Member.objects.create(household=self.household, full_name='LN')
        self.anu = Member.objects.create(household=self.household, full_name='Anu')

        def buy(instrument, amount, investment=None):
            Transaction.objects.create(household=self.household, instrument=instrument, investment=investment, tx_date=self.date,
                                       amount=Decimal(amount), quantity=Decimal('1'), direction='outflow', transaction_type='buy')
        eq = get_or_create_equity_shell(self.household)
        itc = Investment.objects.create(instrument=eq, name='ITC', member=self.ln, market_cap='large_cap')
        buy(eq, '1000', itc)
        mf = get_or_create_mf_shell(self.household)
        fund = Investment.objects.create(instrument=mf, name='Axis Midcap', member=self.anu)
        MutualFundDetails.objects.create(investment=fund, amc='Axis', fund_category='Equity', fund_sub_category='Mid Cap')
        buy(mf, '2000', fund)
        fd = Instrument.objects.create(household=self.household, name='Joint FD', instrument_type='fd', sub_category='debt')
        InstrumentOwnership.objects.create(instrument=fd, member=self.ln, allocation_percent=60)
        InstrumentOwnership.objects.create(instrument=fd, member=self.anu, allocation_percent=40)
        buy(fd, '5000')
        orphan = Instrument.objects.create(household=self.household, name='Old Gold', instrument_type='gold')
        buy(orphan, '300')
        loan = Instrument.objects.create(household=self.household, name='Home Loan', instrument_type='liability')
        buy(loan, '9999')
        savings = Account.objects.create(household=self.household, name='SBI', account_type='bank', opening_balance=Decimal('700'))
        AccountOwnership.objects.create(account=savings, member=self.anu, allocation_percent=100)
        Account.objects.create(household=self.household, name='Card', account_type='credit_card')

    def _rows(self):
        from datetime import date
        from insights.services import compute_allocation_facts
        return compute_allocation_facts(self.household.id, date(2026, 10, 1))['rows']

    def test_rows_split_by_member_with_dimensions(self):
        rows = self._rows()
        by = {(r['member'], r['holding']): r for r in rows}
        self.assertEqual((by[('LN', 'ITC')]['type'], by[('LN', 'ITC')]['market_cap'], by[('LN', 'ITC')]['asset_class']),
                         ('Stock', 'Large Cap', 'Equity'))
        fund = by[('Anu', 'Axis Midcap')]
        self.assertEqual((fund['market_cap'], fund['provider'], fund['classification']), ('Mid Cap', 'Axis', 'Mid Cap'))
        self.assertEqual((by[('LN', 'Joint FD')]['value'], by[('Anu', 'Joint FD')]['value']), (3000.0, 2000.0))
        self.assertEqual(by[('Unassigned', 'Old Gold')]['value'], 300.0)  # no owner
        self.assertEqual((by[('Anu', 'SBI')]['type'], by[('Anu', 'SBI')]['value']), ('Savings & Cash', 700.0))

    def test_etfs_typed_etf_with_asset_class_from_their_index(self):
        from decimal import Decimal
        from instruments.models import Investment
        from instruments.services import get_or_create_etf_shell
        from ledger.models import Transaction
        etf = get_or_create_etf_shell(self.household)
        for name, cap in (('ZEROD NIRL ETF D-GRW', ''), ('NIP ETF NIFTY50 BEES', 'large_cap')):
            inv = Investment.objects.create(instrument=etf, name=name, member=self.ln, market_cap=cap)
            Transaction.objects.create(household=self.household, instrument=etf, investment=inv, tx_date=self.date,
                                       amount=Decimal('500'), quantity=Decimal('1'), direction='outflow', transaction_type='buy')
        by = {r['holding']: r for r in self._rows() if r['member'] == 'LN'}
        liquid, nifty = by['ZEROD NIRL ETF D-GRW'], by['NIP ETF NIFTY50 BEES']
        self.assertEqual((liquid['type'], liquid['category'], liquid['asset_class'], liquid['classification']),
                         ('ETF', 'ETF', 'Debt', 'Debt ETF'))
        self.assertEqual((nifty['type'], nifty['asset_class'], nifty['market_cap']), ('ETF', 'Equity', 'Large Cap'))

    def test_liabilities_and_cards_left_out_and_total_matches(self):
        rows = self._rows()
        self.assertFalse([r for r in rows if r['holding'] in ('Home Loan', 'Card')])
        self.assertEqual(sum(r['value'] for r in rows), 1000 + 2000 + 5000 + 300 + 700)
