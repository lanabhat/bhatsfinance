from datetime import date
from decimal import Decimal

from django.test import TestCase

from alerts.models import SIPMandate
from alerts.services import generate_missed_sip_alerts
from core.models import Household, Member
from instruments.models import Account, Instrument
from ledger.models import Transaction


class SIPAlertTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Sharma Family')
        self.member = Member.objects.create(household=self.household, full_name='Amit Sharma')
        self.account = Account.objects.create(
            household=self.household,
            name='SIP Account',
            account_type=Account.AccountType.BANK,
            primary_member=self.member,
        )
        self.instrument = Instrument.objects.create(
            household=self.household,
            default_account=self.account,
            name='Large Cap SIP',
            instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )

    def test_missed_sip_detection(self):
        SIPMandate.objects.create(
            household=self.household,
            member=self.member,
            account=self.account,
            instrument=self.instrument,
            expected_amount=Decimal('5000.00'),
            frequency=SIPMandate.Frequency.MONTHLY,
            due_day=5,
            start_date=date(2025, 1, 1),
            grace_days=5,
        )
        Transaction.objects.create(
            household=self.household,
            member=self.member,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2025, 2, 6),
            amount=Decimal('5000.00'),
            quantity=Decimal('4.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
        )

        missed = generate_missed_sip_alerts(self.household.id, date(2025, 3, 10))
        self.assertEqual(len(missed), 2)
        self.assertEqual(missed[0]['due_date'], '2025-01-05')
        self.assertEqual(missed[1]['due_date'], '2025-03-05')
