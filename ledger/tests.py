from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from core.models import Household, Member
from instruments.models import Account, Instrument
from ledger.models import Transaction


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
