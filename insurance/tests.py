from datetime import date
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from core.models import Household
from insurance.models import InsurancePolicy
from insurance.sms_matching import find_sms_matches
from sms_ingestion.models import SmsMessage


class FindSmsMatchesTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.policy = InsurancePolicy.objects.create(
            household=self.household,
            policy_type=InsurancePolicy.PolicyType.LIFE,
            policy_name='LIC Jeevan Anand',
            policy_number='LIC-998877-1234',
            premium_amount=Decimal('15000.00'),
            start_date=date(2020, 1, 1),
        )

    def _create_sms(self, body, amount=None, sender='VM-LICIND'):
        return SmsMessage.objects.create(
            household=self.household,
            sender=sender,
            body=body,
            received_at=timezone.now(),
            raw_payload={'parsed_tx': {'amount': str(amount)}} if amount is not None else {},
            status=SmsMessage.STATUS_PENDING,
        )

    def test_amount_and_digits_match_is_high_confidence(self):
        self._create_sms('Rs.15000.00 debited for LIC policy 1234 premium', amount='15000.00')
        matches = find_sms_matches(self.policy)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]['confidence'], 'high')
        self.assertTrue(matches[0]['digits_matched'])

    def test_amount_only_is_low_confidence(self):
        self._create_sms('Rs.15000.00 debited towards insurance premium', amount='15000.00')
        matches = find_sms_matches(self.policy)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]['confidence'], 'low')
        self.assertFalse(matches[0]['digits_matched'])

    def test_no_match_when_amount_and_digits_both_differ(self):
        self._create_sms('Rs.500.00 debited for groceries', amount='500.00')
        matches = find_sms_matches(self.policy)
        self.assertEqual(matches, [])

    def test_approved_sms_excluded(self):
        msg = self._create_sms('Rs.15000.00 debited for LIC policy 1234 premium', amount='15000.00')
        msg.status = SmsMessage.STATUS_APPROVED
        msg.save(update_fields=['status'])
        matches = find_sms_matches(self.policy)
        self.assertEqual(matches, [])

    def test_high_confidence_ranked_before_low(self):
        self._create_sms('Rs.15000.00 debited towards insurance premium', amount='15000.00', sender='VM-HDFCBK')
        self._create_sms('Rs.15000.00 debited for LIC policy 1234 premium', amount='15000.00', sender='VM-LICIND')
        matches = find_sms_matches(self.policy)
        self.assertEqual(len(matches), 2)
        self.assertEqual(matches[0]['confidence'], 'high')
        self.assertEqual(matches[1]['confidence'], 'low')
