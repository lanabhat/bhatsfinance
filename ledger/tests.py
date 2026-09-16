from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Household, Member, UserProfile
from instruments.models import Account, Instrument, Investment
from instruments.services import get_or_create_mf_shell
from ledger.models import Transaction


def _approved_client(household):
    user = get_user_model().objects.create_user(username='tester', password='x')
    UserProfile.objects.create(user=user, household=household, role='admin', status='approved')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class TransactionModelTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Sharma Family')
        self.member = Member.objects.create(household=self.household, full_name='Amit Sharma')
        self.account = Account.objects.create(
            household=self.household,
            name='HDFC Bank',
            account_type=Account.AccountType.BANK,
            primary_member=self.member,
        )
        self.instrument = Instrument.objects.create(
            household=self.household,
            default_account=self.account,
            name='Nifty 50 Fund',
            instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )

    def test_transaction_is_immutable(self):
        tx = Transaction.objects.create(
            household=self.household,
            member=self.member,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2025, 1, 5),
            amount=Decimal('10000.00'),
            quantity=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )

        tx.amount = Decimal('12000.00')
        with self.assertRaises(ValidationError):
            tx.save()


class TransactionFilterTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.client = _approved_client(self.household)
        self.shell = get_or_create_mf_shell(self.household)
        self.investment_a = Investment.objects.create(instrument=self.shell, name='Flexi Cap Fund', folio_no='111')
        self.investment_b = Investment.objects.create(instrument=self.shell, name='Small Cap Fund', folio_no='222')
        self.tx_a = Transaction.objects.create(
            household=self.household, instrument=self.shell, investment=self.investment_a,
            tx_date=date(2025, 1, 5), amount=Decimal('1000.00'), quantity=Decimal('10.000000'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )
        Transaction.objects.create(
            household=self.household, instrument=self.shell, investment=self.investment_b,
            tx_date=date(2025, 1, 6), amount=Decimal('2000.00'), quantity=Decimal('20.000000'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )

    def test_filter_by_investment(self):
        response = self.client.get(f'/api/transactions/?investment={self.investment_a.id}')
        self.assertEqual(response.status_code, 200)
        ids = [tx['id'] for tx in response.data['results']]
        self.assertEqual(ids, [self.tx_a.id])


class TransactionSerializerInvestmentFieldTests(TestCase):
    """Regression test for a bug where TransactionSerializer.Meta.fields
    omitted 'investment' entirely, so DRF silently dropped it from every
    create request — a buy for a specific fund/stock under a shared shell
    Instrument would save with investment=null instead of the real fund."""

    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.client = _approved_client(self.household)
        self.shell = get_or_create_mf_shell(self.household)
        self.investment = Investment.objects.create(instrument=self.shell, name='Flexi Cap Fund', folio_no='111')

    def test_investment_round_trips_through_create(self):
        response = self.client.post('/api/transactions/', {
            'household': self.household.id,
            'instrument': self.shell.id,
            'investment': self.investment.id,
            'tx_date': '2025-01-05',
            'amount': '1000.00',
            'quantity': '10.000000',
            'direction': 'outflow',
            'transaction_type': 'buy',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data['investment'], self.investment.id)
        tx = Transaction.objects.get(id=response.data['id'])
        self.assertEqual(tx.investment_id, self.investment.id)


class TransactionSellRealizedGainTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.client = _approved_client(self.household)
        self.shell = get_or_create_mf_shell(self.household)
        self.investment = Investment.objects.create(instrument=self.shell, name='Flexi Cap Fund', folio_no='111')
        # Buy 100 units @ 100/unit = 10000 invested.
        Transaction.objects.create(
            household=self.household, instrument=self.shell, investment=self.investment,
            tx_date=date(2025, 1, 1), amount=Decimal('10000.00'), quantity=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )

    def _sell(self, quantity, amount, tx_date='2025-06-01'):
        return self.client.post('/api/transactions/', {
            'household': self.household.id,
            'instrument': self.shell.id,
            'investment': self.investment.id,
            'tx_date': tx_date,
            'amount': amount,
            'quantity': quantity,
            'direction': 'inflow',
            'transaction_type': 'sell',
        }, format='json')

    def test_partial_sell_at_a_profit(self):
        # Sell 40 units @ 150/unit = 6000 proceeds. Avg cost = 100/unit.
        # realized_gain = 6000 - (100 * 40) = 2000.
        response = self._sell('40.000000', '6000.00')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Decimal(response.data['realized_gain']), Decimal('2000.00'))

    def test_full_sell_at_a_loss(self):
        # Sell all 100 units @ 60/unit = 6000 proceeds. Avg cost = 100/unit.
        # realized_gain = 6000 - (100 * 100) = -4000 (a loss).
        response = self._sell('100.000000', '6000.00')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Decimal(response.data['realized_gain']), Decimal('-4000.00'))

    def test_sell_with_no_prior_holding_leaves_realized_gain_null(self):
        other_investment = Investment.objects.create(instrument=self.shell, name='Untouched Fund', folio_no='999')
        response = self.client.post('/api/transactions/', {
            'household': self.household.id,
            'instrument': self.shell.id,
            'investment': other_investment.id,
            'tx_date': '2025-06-01',
            'amount': '500.00',
            'quantity': '5.000000',
            'direction': 'inflow',
            'transaction_type': 'sell',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertIsNone(response.data['realized_gain'])

    def test_buy_transaction_never_gets_realized_gain(self):
        response = self.client.post('/api/transactions/', {
            'household': self.household.id,
            'instrument': self.shell.id,
            'investment': self.investment.id,
            'tx_date': '2025-06-01',
            'amount': '1000.00',
            'quantity': '10.000000',
            'direction': 'outflow',
            'transaction_type': 'buy',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertIsNone(response.data['realized_gain'])

    def test_realized_gain_is_not_client_settable(self):
        response = self._sell('40.000000', '6000.00')
        self.assertEqual(response.status_code, 201, response.content)
        # A client trying to directly set realized_gain must not override the
        # server-computed value.
        tx = Transaction.objects.get(id=response.data['id'])
        self.assertEqual(tx.realized_gain, Decimal('2000.00'))
