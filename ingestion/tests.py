from datetime import date
from decimal import Decimal

from django.test import TestCase

from core.models import Household, Member
from ingestion.fd_parser import FDParseError, parse_deposit_text
from ingestion.pdf_decrypt import IncorrectPasswordError, decrypt_and_extract_text
from ingestion.rd_maturity import compute_rd_maturity
from ingestion.services import process_csv_import
from ingestion.universal_importer import apply_fd_advice_import, apply_rd_statement_import
from instruments.models import Account, AssetCategory, FDDetails, Instrument
from insights.services import compute_holdings
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


SBI_ESTDR_SAMPLE = """STATE BANK OF INDIA
e-Special Term Deposit
(In lieu of term deposit receipt)
This is not a negotiable document
MANJANADY ASSAIGOLI BRANCH (71037)
Date: 15-06-2026
Dear Sir/Madam,
We have pleasure in confirming details of the following amount held in deposit with us. Please quote the
Account Number in all correspondence. Thank you for Banking with us.
Name : ANUSHREE L
Mode of operation : Single
Customer Number : 86312804396
Scheme : STD-MOD GENPUB IND-1YR-<2YRINR
Debit Account Number :
Nominee(s) : NA
e-TDR/e-STDR
Account No.
Tenure Fixed
Rate
Interest
@
Principal Amt Value/
Renewal
Date
Maturity
Date
Maturity
Value
45282193629 365 Days 6.25 150000.00 15-06-2026 15-06-2027 159597.00
Maturity Instruction:
"""

SBI_RD_STATEMENT_SAMPLE = """Statement of Account STATE BANK OF INDIA
Branch Address : NO.1-4-51, R V ARCADE , ASSAIGOLI
P OMANJANADY, DAKSHINA
KANNADA,KARNATAKA
Branch Name : MANJANADY ASSAIGOLI
Branch code : 71037
Branch Email : sbi.71037@sbi.co.in
Branch Phone : 9071459905
Full Name : Mrs. ANUSHREE L
Address line 1 : W/O LAKSHMI
Address line 2 : SRIKRIPA HOUSE
City : SURATHKAL
Pin Code : 574199
IFSC Code : SBIN0071037
MICR Code : 575002039
Currency : INR
Account Status : OPEN
Nominee Name : LAKSHMINARAYANA
E-mail : lanushree89@gmail.com
CIF no : 86312804396
Account no : 43455163752
Product : RD-GEN-PUB IND-2YL3-INR
Time of statement : 21:25:37
Cleared Balance : 2,10,000.00CR
Uncleared Amount : 0.00
+MOD Bal : 0.00
Limit : 0.00
Monthly Avg Balance : 0.00
Interest Rate : 7.00 % p.a.
Drawing Power : 0.00
Account open Date : 19-10-2024
Date of statement : 02-07-2026
Statement From : 19-10-2024 TO 02-07-2026
Post Date Value Date Description Cheque
No/Reference Debit Credit Balance
19-10-2024 19-10-2024
DEP TFR INST NO
001
RDInstallment4345
5163752
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 10,000.00
19-11-2024 19-11-2024
DEP TFR INST NO
002
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 20,000.00
Page no 1
Post Date Value Date Description Cheque
No/Reference Debit Credit Balance
19-12-2024 19-12-2024
DEP TFR INST NO
003
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 30,000.00
19-01-2025 19-01-2025
DEP TFR INST NO
004
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 40,000.00
19-02-2025 19-02-2025
DEP TFR INST NO
005
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 50,000.00
19-03-2025 19-03-2025
DEP TFR INST NO
006
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 60,000.00
31-03-2025 31-03-2025 INTEREST CREDIT - - 124.00 60,124.00
31-03-2025 31-03-2025
WDL TFR
0098047710378
AT 71037
MANJANADY
ASSAIGOLI
- 124.00 - 60,000.00
19-04-2025 19-04-2025
DEP TFR INST NO
007
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 70,000.00
19-05-2025 19-05-2025
DEP TFR INST NO
008
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 80,000.00
19-06-2025 19-06-2025
DEP TFR INST NO
009
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 90,000.00
Page no 2
Post Date Value Date Description Cheque
No/Reference Debit Credit Balance
19-07-2025 19-07-2025
DEP TFR INST NO
010
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 1,00,000.00
19-08-2025 19-08-2025
DEP TFR INST NO
011
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 1,10,000.00
19-09-2025 19-09-2025
DEP TFR INST NO
012
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 1,20,000.00
19-10-2025 19-10-2025
DEP TFR INST NO
013
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 1,30,000.00
19-11-2025 19-11-2025
DEP TFR INST NO
014
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 1,40,000.00
19-12-2025 19-12-2025
DEP TFR INST NO
015
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 1,50,000.00
19-01-2026 19-01-2026
DEP TFR INST NO
016
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 1,60,000.00
19-02-2026 19-02-2026
DEP TFR INST NO
017
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 1,70,000.00
Page no 3
Post Date Value Date Description Cheque
No/Reference Debit Credit Balance
19-03-2026 19-03-2026
DEP TFR INST NO
018
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 1,80,000.00
31-03-2026 31-03-2026 INTEREST CREDIT - - 902.00 1,80,902.00
31-03-2026 31-03-2026
WDL TFR
0098047710378
AT 71037
MANJANADY
ASSAIGOLI
- 902.00 - 1,80,000.00
19-04-2026 19-04-2026
DEP TFR INST NO
019
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 1,90,000.00
19-05-2026 19-05-2026
DEP TFR INST NO
020
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 2,00,000.00
19-06-2026 19-06-2026
DEP TFR INST NO
021
0064120415898
OF Mrs. ANUSHREE
L AT 71037
MANJANADY
ASSAIGOLI
- - 10,000.00 2,10,000.00
Brought Forward Dr Count Cr Count Total Debits Total Credits Closing Balance
0.00 2 23 1,026.00 2,11,026.00 2,10,000.00
*---END OF STATEMENT---*
In Case Your Accounts is Operated By A Letter Of Authority/Power Of Attomey Holder Please Check The
Transaction With Extra Care.
Statement Summary: 19-10-2024 To 02-07-2026
Page no 4
"""


class FDParserTests(TestCase):
    def test_sbi_estdr_advice_fields(self):
        result = parse_deposit_text(SBI_ESTDR_SAMPLE)
        self.assertEqual(result['doc_type'], 'fd_advice')
        self.assertEqual(result['parser_used'], 'sbi_estdr')
        self.assertEqual(result['bank_name'], 'State Bank of India')
        self.assertEqual(result['account_number'], '45282193629')
        self.assertEqual(result['member_name_raw'], 'ANUSHREE L')
        self.assertEqual(result['annual_rate'], '6.25')
        self.assertEqual(result['principal'], '150000.00')
        self.assertEqual(result['investment_date'], '2026-06-15')
        self.assertEqual(result['maturity_date'], '2027-06-15')
        self.assertEqual(result['maturity_value'], '159597.00')
        self.assertEqual(result['compounding'], 'quarterly')
        self.assertEqual(result['tenure_days'], 365)

    def test_sbi_rd_statement_fields(self):
        result = parse_deposit_text(SBI_RD_STATEMENT_SAMPLE)
        self.assertEqual(result['doc_type'], 'rd_statement')
        self.assertEqual(result['parser_used'], 'sbi_rd_statement')
        self.assertEqual(result['bank_name'], 'State Bank of India')
        self.assertEqual(result['account_number'], '43455163752')
        self.assertEqual(result['member_name_raw'], 'Mrs. ANUSHREE L')
        self.assertEqual(result['annual_rate'], '7.00')
        self.assertEqual(result['investment_date'], '2024-10-19')
        self.assertEqual(result['installment_amount'], '10000.00')
        self.assertEqual(result['current_balance'], '210000.00')
        self.assertEqual(result['installment_count_observed'], 21)

    def test_generic_fallback_does_not_raise_on_unrecognized_layout(self):
        fake_text = """FICTIONAL BANK LTD
Name : Some Person
Rate of Interest : 8.00
Deposit Date : 01-01-2025
Principal Amount : 50000.00
Maturity Date : 01-01-2026
Maturity Amount : 54000.00
"""
        result = parse_deposit_text(fake_text)
        self.assertEqual(result['parser_used'], 'generic')
        self.assertGreater(len(result['warnings']), 0)
        self.assertEqual(result['bank_name'], 'FICTIONAL BANK LTD')

    def test_generic_fallback_raises_on_unrelated_document(self):
        with self.assertRaises(FDParseError):
            parse_deposit_text('This is just some random unrelated PDF text with no financial data.')


class RDMaturityTests(TestCase):
    def test_quarterly_compounding_produces_positive_interest(self):
        maturity = compute_rd_maturity(Decimal('10000'), Decimal('7.00'), 24, 'quarterly')
        total_principal = Decimal('10000') * 24
        self.assertGreater(maturity, total_principal)
        # Sanity band: interest earned should be a modest single-digit
        # percentage of principal for a 2yr/7% RD (declining average balance).
        interest = maturity - total_principal
        self.assertGreater(interest, Decimal('15000'))
        self.assertLess(interest, Decimal('25000'))

    def test_monthly_vs_quarterly_compounding_differ(self):
        quarterly = compute_rd_maturity(Decimal('10000'), Decimal('7.00'), 12, 'quarterly')
        monthly = compute_rd_maturity(Decimal('10000'), Decimal('7.00'), 12, 'monthly')
        self.assertNotEqual(quarterly, monthly)


class PdfPasswordTests(TestCase):
    def _build_encrypted_pdf(self, password: str) -> bytes:
        import io
        import pikepdf

        pdf = pikepdf.new()
        pdf.add_blank_page(page_size=(200, 200))
        buffer = io.BytesIO()
        pdf.save(buffer, encryption=pikepdf.Encryption(owner=password, user=password))
        pdf.close()
        return buffer.getvalue()

    def test_wrong_password_raises(self):
        encrypted_bytes = self._build_encrypted_pdf('correct-horse')
        with self.assertRaises(IncorrectPasswordError):
            decrypt_and_extract_text(encrypted_bytes, 'wrong-password')

    def test_correct_password_succeeds(self):
        encrypted_bytes = self._build_encrypted_pdf('correct-horse')
        # A blank page has no text, but decryption + extraction should not raise.
        text = decrypt_and_extract_text(encrypted_bytes, 'correct-horse')
        self.assertEqual(text.strip(), '')


class FDRDImportHoldingsTests(TestCase):
    """
    Holdings (compute_holdings) are derived from Transaction history, not
    from Instrument/FDDetails alone — the importers must create an initial
    deposit transaction or imported FDs/RDs silently don't show up under
    Holdings even though the import itself reports success.
    """

    def setUp(self):
        self.household = Household.objects.create(name='Sharma Family')
        self.member = Member.objects.create(household=self.household, full_name='Amit Sharma')
        self.savings_account = Account.objects.create(
            household=self.household,
            name='Anu SBI 1',
            account_type=Account.AccountType.BANK,
            opening_balance=Decimal('50000.00'),
        )
        self.fd_category = AssetCategory.objects.create(household=self.household, name='Fixed Deposit')
        self.rd_category = AssetCategory.objects.create(household=self.household, name='Recurring Deposit')

    def test_imported_fd_appears_in_holdings(self):
        item = {
            'bank_name': 'State Bank of India',
            'account_number': '45282193629',
            'principal': '150000.00',
            'annual_rate': '6.25',
            'investment_date': '2026-06-15',
            'maturity_date': '2027-06-15',
            'maturity_value': '159597.00',
            'compounding': 'quarterly',
        }
        result = apply_fd_advice_import(self.household, self.member, item)
        self.assertTrue(result['created'])
        instrument = Instrument.objects.get(id=result['instrument_id'])
        self.assertEqual(instrument.asset_category_id, self.fd_category.id)
        fd_tx = Transaction.objects.get(household=self.household, instrument_id=result['instrument_id'])
        # The funding transaction must not be linked to any account — this FD
        # was opened in the past, and debiting a real account today would
        # double-count money that already left that account long ago (the
        # bug that caused a real account to show a large false negative balance).
        self.assertIsNone(fd_tx.account_id)

        # The auto-created ValuationSnapshot is dated "today" (import time), so
        # holdings must be queried as of today or later to pick it up.
        holdings = compute_holdings(self.household.id, date.today())
        matching = [h for h in holdings if h['instrument_id'] == result['instrument_id']]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]['net_invested'], Decimal('150000.00'))
        # Current value should reflect accrued interest (via the auto-created
        # ValuationSnapshot), not just sit at the original principal.
        self.assertGreater(matching[0]['market_value'], Decimal('150000.00'))

        # No real account's balance should be affected by this import.
        self.assertEqual(Transaction.objects.filter(account=self.savings_account).count(), 0)

    def test_reimporting_fd_does_not_duplicate_transaction(self):
        item = {
            'bank_name': 'State Bank of India',
            'account_number': '45282193629',
            'principal': '150000.00',
            'annual_rate': '6.25',
            'investment_date': '2026-06-15',
            'maturity_date': '2027-06-15',
            'maturity_value': '159597.00',
            'compounding': 'quarterly',
        }
        result1 = apply_fd_advice_import(self.household, self.member, item)
        result2 = apply_fd_advice_import(self.household, self.member, item)
        self.assertEqual(result1['instrument_id'], result2['instrument_id'])
        self.assertEqual(
            Transaction.objects.filter(household=self.household, instrument_id=result1['instrument_id']).count(), 1
        )

    def test_imported_rd_appears_in_holdings_with_backfilled_installments(self):
        item = {
            'bank_name': 'State Bank of India',
            'account_number': '43455163752',
            'installment_amount': '10000.00',
            'annual_rate': '7.00',
            'investment_date': '2024-10-19',
            'current_balance': '210000.00',
            'installment_count_observed': 21,
            'compounding': 'quarterly',
            'tenure_months': 27,
        }
        result = apply_rd_statement_import(self.household, self.member, item, self.savings_account)
        self.assertEqual(result['installments_backfilled'], 21)

        instrument = Instrument.objects.get(id=result['instrument_id'])
        self.assertEqual(instrument.asset_category_id, self.rd_category.id)

        backfilled_txs = Transaction.objects.filter(household=self.household, instrument_id=result['instrument_id'])
        self.assertEqual(backfilled_txs.count(), 21)
        # Backfilled installments must NOT be linked to the real account —
        # these were paid in the past and the account's current balance
        # already reflects that money having left; linking them here would
        # double-count against the account's balance.
        self.assertTrue(all(tx.account_id is None for tx in backfilled_txs))

        # RDMandate.account should be the real, user-selected account (used
        # for future installment mark-paid actions going forward).
        from alerts.models import RDMandate
        mandate = RDMandate.objects.get(id=result['mandate_id'])
        self.assertEqual(mandate.account_id, self.savings_account.id)

        holdings = compute_holdings(self.household.id, date.today())
        matching = [h for h in holdings if h['instrument_id'] == result['instrument_id']]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]['net_invested'], Decimal('210000.00'))
        # RD current value comes from the statement's accrued balance, surfaced
        # via the auto-created ValuationSnapshot.
        self.assertEqual(matching[0]['market_value'], Decimal('210000.00'))

        fd_details = FDDetails.objects.get(instrument_id=result['instrument_id'])
        self.assertEqual(fd_details.principal, Decimal('210000.00'))

        # The real savings account's own balance must be untouched by this import.
        self.assertEqual(
            Transaction.objects.filter(account=self.savings_account).count(), 0
        )
