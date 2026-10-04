from datetime import date, datetime, timezone
from decimal import Decimal

from django.test import TestCase

from core.models import Household, Member
from instruments.models import Account
from sms_ingestion.extract import extract_sms, normalize_sender
from sms_ingestion.models import SmsMessage, SmsRule

RECEIVED = date(2026, 10, 3)


def x(body, sender='AD-TEST-S'):
    return extract_sms(body, sender, RECEIVED)


class ExtractSmsTests(TestCase):
    """Formats taken from real alerts (numbers changed)."""

    def test_federal_upi_debit(self):
        r = x('Debited Rs 1227.00 from a/c X3422 on 26Sep26 23:40 via UPI to ANNAPPA. Ref 382727552218.Bal Rs 54513.42. Not you?Call 18004251199 -Federal Bank')
        self.assertEqual((r['kind'], r['direction'], r['amount']), ('debit', 'outflow', Decimal('1227.00')))
        self.assertEqual((r['account_hint'], r['counterparty'], r['reference']), ('3422', 'ANNAPPA', '382727552218'))
        self.assertEqual((r['balance'], r['tx_date']), (Decimal('54513.42'), date(2026, 9, 26)))

    def test_federal_neft_received_by_payee_is_a_debit(self):
        r = x('Kotak Mutual Fund has received Rs 100.00 from your A/c 3422 via NEFT on 03-Oct-2026 09:04:06. Ref no. FBBT262764612066 - Federal Bank')
        self.assertEqual((r['kind'], r['direction'], r['amount']), ('debit', 'outflow', Decimal('100.00')))
        self.assertEqual((r['counterparty'], r['reference']), ('Kotak Mutual Fund', 'FBBT262764612066'))

    def test_sbi_credit_with_indian_grouping(self):
        r = x('Your A/C XXXXX914252 Credited INR 10,590.18 on 17/09/26 -Deposit by transfer from Mrs. E DEVAKIKUMAR. Avl Bal INR 24,12,937.20-SBI')
        self.assertEqual((r['kind'], r['direction'], r['amount']), ('credit', 'inflow', Decimal('10590.18')))
        self.assertEqual((r['account_hint'], r['balance'], r['tx_date']), ('4252', Decimal('2412937.20'), date(2026, 9, 17)))
        self.assertEqual(r['counterparty'], 'E DEVAKIKUMAR')

    def test_dbs_debit_balance_without_space(self):
        r = x('Dear Customer, Your account no XXXXXXXX7799 is debited with INR 100.00 on 17-Sep-2026. Current Balance is INR10971.14.')
        self.assertEqual((r['kind'], r['amount'], r['account_hint'], r['balance']), ('debit', Decimal('100.00'), '7799', Decimal('10971.14')))

    def test_hdfc_upi_sent_and_imps_to_own_account(self):
        r = x('Sent Rs.942.50\nFrom HDFC Bank A/C *8196\nTo HINDUSTAN PETROLEUM CORPO\nOn 06/09/26\nRef 315385837816')
        self.assertEqual((r['kind'], r['amount'], r['account_hint'], r['counterparty']), ('debit', Decimal('942.50'), '8196', 'HINDUSTAN PETROLEUM CORPO'))
        r = x('IMPS INR 10,000.00 sent from HDFC Bank A/c XX8196 on 20-09-26 To A/c xxxxxxxxxx7799 Ref-620148884803')
        self.assertEqual((r['account_hint'], r['to_account_hint']), ('8196', '7799'))

    def test_hdfc_daily_balance(self):
        r = x('Available Bal in HDFC Bank A/c XX8196 as on yesterday:29-SEP-26 is INR 2,08,316.85. Cheques are subject to clearing.')
        self.assertEqual((r['kind'], r['balance'], r['balance_date']), ('balance', Decimal('208316.85'), date(2026, 9, 29)))

    def test_cards(self):
        r = x('Hi! Your txn of ₹1,574.00 at Kaveri Milk Parlour on your Scapia Federal RuPay credit card was successful.')
        self.assertEqual((r['kind'], r['amount'], r['counterparty']), ('card_spend', Decimal('1574.00'), 'Kaveri Milk Parlour'))
        r = x('Spent INR 8778 Axis Bank Card no. XX2133 23-09-26 07:16:48 IST Axis Bill p Avl Limit: INR 271465 Not you?')
        self.assertEqual((r['kind'], r['account_hint'], r['balance']), ('card_spend', '2133', None))
        r = x('Payment of INR 1878 has been received towards your Axis Bank Credit Card XX2133 on 08-09-26 - Axis Bank')
        self.assertEqual((r['kind'], r['direction']), ('cc_payment', 'inflow'))
        r = x('Bill Paid: FederaBaCC Bill 7760823455 of Rs. 30600.26 paid on 10-Sep-2026 from HDFC Bank Account xx8196 via SmartPay.')
        self.assertEqual((r['kind'], r['account_hint']), ('cc_bill_paid', '8196'))

    def test_non_transactions(self):
        self.assertEqual(x('Payment of INR 1878 for Axis Bank Credit Card no. XX2133 is due on 11-09-26. Ignore if paid.')['kind'], 'reminder')
        self.assertEqual(x('your payment of Rs. 39 for your PREPAID 7760823455 was unsuccessful.')['kind'], 'failed')
        self.assertEqual(x('Get a Personal Loan at 10.49%. Click https://x.in/abc')['kind'], 'promotion')
        r = x('Purchase in Folio 1050928014 in ABSL Nifty Midcap 150 Index Direct-Growth for Rs.100.00, NAV 24.9765 / Trade date 28-Sep-2026 is processed & 4.004 units allotted.')
        self.assertEqual((r['kind'], r['amount']), ('mf_purchase', Decimal('100.00')))

    def test_sender_normalized(self):
        self.assertEqual({normalize_sender(s) for s in ('AD-FEDBNK-S', 'VA-FEDBNK', 'FEDBNK-T')}, {'FEDBNK'})


class ProcessMessageTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.anu = Member.objects.create(household=self.household, full_name='Anushree L')
        self.ln = Member.objects.create(household=self.household, full_name='Lakshminarayana K G')
        self.federal = Account.objects.create(household=self.household, name='LN Federal (3422)', account_type='bank',
                                              institution_name='Federal Bank', primary_member=self.ln)
        self.dbs = Account.objects.create(household=self.household, name='Anu DBS', account_type='bank', primary_member=self.anu)
        self.scapia = Account.objects.create(household=self.household, name='LN Scapia credit card', account_type='credit_card',
                                             institution_name='Federal Bank')

    def _msg(self, body, sender='AD-FEDBNK-S', when=datetime(2026, 9, 26, 18, 0, tzinfo=timezone.utc)):
        return SmsMessage.objects.create(household=self.household, sender=sender, body=body, received_at=when, raw_payload={})

    def _process(self, msg, rules=None):
        from sms_ingestion.autofill import process_message
        parsed = process_message(msg, rules or [])
        msg.save()
        return parsed

    def test_account_owner_and_balance_filled_from_text(self):
        from valuations.models import ValuationSnapshot
        msg = self._msg('Debited Rs 1227.00 from a/c X3422 on 26Sep26 23:40 via UPI to ANNAPPA. Ref 382727552218.Bal Rs 54513.42. -Federal Bank')
        parsed = self._process(msg)
        self.assertEqual((parsed['account'], parsed['member'], parsed['classification']), (str(self.federal.id), str(self.ln.id), 'spend'))
        self.assertEqual(msg.confidence, 1.0)
        snap = ValuationSnapshot.objects.get(account=self.federal)
        self.assertEqual((snap.balance, snap.valuation_date), (Decimal('54513.42'), date(2026, 9, 26)))

    def test_balance_never_overrides_a_newer_or_manual_reading(self):
        from valuations.models import ValuationSnapshot
        ValuationSnapshot.objects.create(household=self.household, account=self.federal, balance=Decimal('100'),
                                         valuation_date=date(2026, 9, 26), source='manual')
        self._process(self._msg('Debited Rs 10.00 from a/c X3422 on 26Sep26 via UPI to A B. Bal Rs 90.00. -Federal Bank'))
        self.assertEqual(ValuationSnapshot.objects.get(account=self.federal).balance, Decimal('100'))

    def test_transfer_to_family_member_is_internal(self):
        msg = self._msg('Debited Rs 25000.00 from a/c X3422 on 26Sep26 via UPI to ANUSHREE L. Ref 565311987471. -Federal Bank')
        self.assertEqual(self._process(msg)['classification'], 'internal_transfer')

    def test_investment_payee(self):
        msg = self._msg('Kotak Mutual Fund has received Rs 100.00 from your A/c 3422 via NEFT on 26-Sep-2026 09:04:06. Ref no. FBBT1 - Federal Bank')
        parsed = self._process(msg)
        self.assertEqual((parsed['kind'], parsed['transaction_type']), ('investment_debit', 'buy'))

    def test_card_sms_without_digits_uses_the_only_card_at_that_bank(self):
        msg = self._msg('Hi! Your txn of ₹50.00 at Bhats Shop on your Scapia Federal RuPay credit card was successful.', sender='VM-FEDSCP-S')
        self.assertEqual(self._process(msg)['account'], str(self.scapia.id))

    def test_unknown_digits_learned_on_approval(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient
        from core.models import UserProfile
        user = get_user_model().objects.create_user(username='sms-admin', password='x')
        UserProfile.objects.create(user=user, household=self.household, role='admin', status='approved')
        client = APIClient()
        client.force_authenticate(user=user)

        dbs_sms = 'Dear Customer, Your account no XXXXXXXX7799 is debited with INR 100.00 on 26-Sep-2026. Current Balance is INR10971.14.'
        first = self._msg(dbs_sms, sender='JM-DBSBNK-S')
        self.assertNotIn('account', self._process(first))
        response = client.post(f'/api/sms-messages/{first.id}/approve/', {'account': str(self.dbs.id)}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.dbs.refresh_from_db()
        self.assertEqual(self.dbs.sms_identifiers, '7799')

        second = self._msg(dbs_sms.replace('100.00', '55.00'), sender='JM-DBSBNK-S', when=datetime(2026, 9, 27, tzinfo=timezone.utc))
        self.assertEqual(self._process(second)['account'], str(self.dbs.id))

    def test_message_direction_beats_a_per_sender_rule(self):
        rule = SmsRule.objects.create(household=self.household, name='Federal', conditions={'field': 'sender', 'op': 'contains', 'value': 'FEDBNK'},
                                      direction='outflow', spend_category='groceries')
        msg = self._msg('Your A/c X3422 is credited with INR 500.00 on 26-Sep-2026 from SOMEONE. -Federal Bank')
        parsed = self._process(msg, [rule])
        self.assertEqual((parsed['direction'], parsed['spend_category'], msg.raw_payload['matched_rule_name']), ('inflow', 'groceries', 'Federal'))


class SmsMessageDetailTests(TestCase):
    def test_review_page_can_load_one_message_with_what_was_read(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient
        from core.models import UserProfile
        from sms_ingestion.autofill import process_message
        household = Household.objects.create(name='Pai Family')
        user = get_user_model().objects.create_user(username='sms-viewer', password='x')
        UserProfile.objects.create(user=user, household=household, role='admin', status='approved')
        client = APIClient()
        client.force_authenticate(user=user)
        msg = SmsMessage.objects.create(household=household, sender='AD-FEDBNK-S', received_at=datetime(2026, 9, 26, tzinfo=timezone.utc),
                                        body='Debited Rs 12.00 from a/c X3422 on 26Sep26 via UPI to A SHOP. Ref 123456789. -Federal Bank', raw_payload={})
        process_message(msg, [])
        msg.save()
        response = client.get(f'/api/sms-messages/{msg.id}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data['parsed_tx']['kind'], response.data['parsed_tx']['account_hint']), ('debit', '3422'))
