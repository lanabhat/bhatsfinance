from datetime import date
from decimal import Decimal

from django.test import TestCase

from core.models import Household, Member
from instruments.models import Account, Instrument
from ledger.models import Transaction
from valuations.models import ValuationSnapshot
from insights.services import compute_holdings, compute_xirr


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
