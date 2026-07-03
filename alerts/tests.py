from datetime import date
from decimal import Decimal

from django.test import TestCase

from alerts.models import RDMandate, RDPaymentAck, SIPMandate
from alerts.services import generate_missed_rd_installments, generate_missed_sip_alerts
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


class RDAlertTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Sharma Family')
        self.member = Member.objects.create(household=self.household, full_name='Amit Sharma')
        self.account = Account.objects.create(
            household=self.household,
            name='RD Account',
            account_type=Account.AccountType.BANK,
            primary_member=self.member,
        )
        self.instrument = Instrument.objects.create(
            household=self.household,
            default_account=self.account,
            name='SBI RD',
            instrument_type=Instrument.InstrumentType.RD,
        )

    def test_backfilled_acks_suppress_alerts_for_already_paid_months(self):
        mandate = RDMandate.objects.create(
            household=self.household,
            member=self.member,
            account=self.account,
            instrument=self.instrument,
            installment_amount=Decimal('10000.00'),
            frequency=RDMandate.Frequency.MONTHLY,
            due_day=19,
            start_date=date(2024, 10, 19),
            tenure_months=27,
            grace_days=5,
        )
        # Backfill the first 21 months as already paid, as an imported
        # statement would (mirrors apply_rd_statement_import's backfill loop).
        current = date(2024, 10, 19)
        for _ in range(21):
            due = current.replace(day=19)
            RDPaymentAck.objects.create(mandate=mandate, due_date=due, acknowledged_on=due)
            month = current.month - 1 + 1
            year = current.year + month // 12
            month = month % 12 + 1
            current = date(year, month, min(current.day, 28))

        # As of the 22nd installment's due date, nothing should be flagged
        # missed yet (grace period), but by well past it, exactly one missed
        # installment (the 22nd) should show — the 21 backfilled ones must
        # not reappear.
        missed = generate_missed_rd_installments(self.household.id, date(2026, 8, 1))
        self.assertEqual(len(missed), 1)
        self.assertEqual(missed[0]['due_date'], '2026-07-19')
        self.assertEqual(missed[0]['mandate_id'], mandate.id)

    def test_transaction_clears_missed_installment(self):
        mandate = RDMandate.objects.create(
            household=self.household,
            member=self.member,
            account=self.account,
            instrument=self.instrument,
            installment_amount=Decimal('5000.00'),
            frequency=RDMandate.Frequency.MONTHLY,
            due_day=5,
            start_date=date(2025, 1, 1),
            tenure_months=12,
            grace_days=5,
        )
        Transaction.objects.create(
            household=self.household,
            member=self.member,
            account=self.account,
            instrument=self.instrument,
            tx_date=date(2025, 1, 6),
            amount=Decimal('5000.00'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.DEPOSIT,
        )

        missed = generate_missed_rd_installments(self.household.id, date(2025, 2, 10))
        due_dates = [m['due_date'] for m in missed]
        self.assertNotIn('2025-01-05', due_dates)
        self.assertIn('2025-02-05', due_dates)
