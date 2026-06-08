from django.test import TestCase

from gmail_ingestion.services import parse_message_to_rows


class GmailParsingTests(TestCase):
    def test_parse_spend_and_balance(self):
        message = {
            'id': 'abc',
            'internalDate': '1714000000000',
            'snippet': 'Your account was debited by INR 1,234.56. Available balance INR 99,888.00',
            'payload': {'headers': [{'name': 'Subject', 'value': 'Debit alert INR 1,234.56'}]},
        }
        tx_row, val_row = parse_message_to_rows(message, account_id=12, account_name='HDFC Savings')
        self.assertIsNotNone(tx_row)
        self.assertEqual(tx_row['account'], '12')
        self.assertEqual(tx_row['direction'], 'OUTFLOW')
        self.assertEqual(tx_row['amount'], '1234.56')
        self.assertIsNotNone(val_row)
        self.assertEqual(val_row['account_name'], 'HDFC Savings')
        self.assertEqual(val_row['balance'], '99888.00')

