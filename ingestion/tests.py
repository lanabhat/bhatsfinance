from datetime import date

from django.test import TestCase

from core.models import Household, Member
from ingestion.services import process_csv_import
from instruments.models import Account, Instrument
from ledger.models import Transaction


class CSVImportTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Sharma Family')
        self.member = Member.objects.create(household=self.household, full_name='Amit Sharma')
        self.account = Account.objects.create(
            household=self.household,
            name='Import Account',
            account_type=Account.AccountType.BROKER,
            primary_member=self.member,
        )
        self.instrument = Instrument.objects.create(
            household=self.household,
            default_account=self.account,
            name='Imported Fund',
            instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )

    def test_duplicate_rows_do_not_create_duplicate_transactions(self):
        rows = [
            {
                'account_id': str(self.account.id),
                'member_id': str(self.member.id),
                'instrument_id': str(self.instrument.id),
                'tx_date': date(2025, 1, 5).isoformat(),
                'amount': '1000.00',
                'quantity': '10.000000',
                'direction': Transaction.Direction.OUTFLOW,
                'transaction_type': Transaction.TransactionType.BUY,
                'idempotency_key': 'sip-2025-01',
            },
            {
                'account_id': str(self.account.id),
                'member_id': str(self.member.id),
                'instrument_id': str(self.instrument.id),
                'tx_date': date(2025, 1, 5).isoformat(),
                'amount': '1000.00',
                'quantity': '10.000000',
                'direction': Transaction.Direction.OUTFLOW,
                'transaction_type': Transaction.TransactionType.BUY,
                'idempotency_key': 'sip-2025-01',
            },
        ]

        result = process_csv_import(self.household.id, 'test.csv', rows)
        self.assertEqual(result['created'], 1)
        self.assertEqual(result['duplicates'], 1)
        self.assertEqual(Transaction.objects.count(), 1)
