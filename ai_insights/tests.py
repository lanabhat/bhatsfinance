from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from ai_insights.gemini_client import GeminiNotConfigured
from ai_insights.models import FundClassification, FundReturnsComparison, RebalancingExplanation
from core.models import Household, Member, UserProfile
from instruments.models import Account, AssetCategory, Instrument, MutualFundDetails
from ledger.models import Transaction


def _approved_client(household):
    user = get_user_model().objects.create_user(username='tester', password='x')
    UserProfile.objects.create(user=user, household=household, role='admin', status='approved')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class _FakeParsedResponse:
    """Mimics a google.genai GenerateContentResponse with structured output."""
    def __init__(self, parsed):
        self.parsed = parsed


class _FakeTextResponse:
    """Mimics a google.genai GenerateContentResponse with plain text output."""
    def __init__(self, text):
        self.text = text


class GeminiClientTests(TestCase):
    def test_raises_when_no_key_configured(self):
        from ai_insights.gemini_client import get_client
        with self.assertRaises(GeminiNotConfigured):
            get_client()

    def test_returns_client_when_key_configured(self):
        from core.models import IntegrationCredential
        IntegrationCredential.objects.create(
            key='GEMINI_API_KEY', scope=IntegrationCredential.Scope.GLOBAL, value='fake-test-key',
        )
        from ai_insights.gemini_client import get_client
        client = get_client()
        self.assertIsNotNone(client)


class ClassifyFundServiceTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.instrument = Instrument.objects.create(
            household=self.household, name='Test Liquid Fund', instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )
        MutualFundDetails.objects.create(instrument=self.instrument, amc='Axis Mutual Fund', fund_category='Debt', fund_sub_category='Liquid')

    @patch('ai_insights.services.get_client')
    def test_classify_fund_stores_result(self, mock_get_client):
        from ai_insights.services import _ClassificationResult, classify_fund

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _FakeParsedResponse(
            _ClassificationResult(bucket='debt', rule_60_40_category='stability', reasoning='It is a liquid debt fund.')
        )
        mock_get_client.return_value = mock_client

        result = classify_fund(self.instrument)

        self.assertEqual(result.bucket, 'debt')
        self.assertEqual(result.rule_60_40_category, 'stability')
        self.assertEqual(FundClassification.objects.count(), 1)
        mock_client.models.generate_content.assert_called_once()

    @patch('ai_insights.services.get_client')
    def test_classify_fund_upserts_on_second_call(self, mock_get_client):
        from ai_insights.services import _ClassificationResult, classify_fund

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _FakeParsedResponse(
            _ClassificationResult(bucket='debt', rule_60_40_category='stability', reasoning='r1')
        )
        mock_get_client.return_value = mock_client
        classify_fund(self.instrument)

        mock_client.models.generate_content.return_value = _FakeParsedResponse(
            _ClassificationResult(bucket='equity', rule_60_40_category='growth', reasoning='r2')
        )
        classify_fund(self.instrument)

        self.assertEqual(FundClassification.objects.count(), 1)
        self.assertEqual(FundClassification.objects.get().bucket, 'equity')


class CompareFundReturnsServiceTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.member = Member.objects.create(household=self.household, full_name='Priya Rao')
        self.account = Account.objects.create(household=self.household, name='Groww', account_type=Account.AccountType.BROKER, primary_member=self.member)
        self.instrument = Instrument.objects.create(household=self.household, name='Fund A', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)
        MutualFundDetails.objects.create(instrument=self.instrument, fund_category='Equity')
        Transaction.objects.create(
            household=self.household, account=self.account, instrument=self.instrument,
            tx_date=date(2025, 1, 1), amount=Decimal('10000.00'), quantity=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )

    @patch('ai_insights.services.get_client')
    def test_compare_fund_returns_stores_result_with_no_peers(self, mock_get_client):
        from ai_insights.services import compare_fund_returns

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _FakeTextResponse('This fund has no peers to compare against.')
        mock_get_client.return_value = mock_client

        result = compare_fund_returns(self.instrument, self.household.id, date(2026, 1, 1))

        self.assertEqual(FundReturnsComparison.objects.count(), 1)
        self.assertEqual(result.input_snapshot['peers'], [])
        self.assertEqual(result.input_snapshot['fund']['name'], 'Fund A')


class ExplainRebalancingServiceTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.member = Member.objects.create(household=self.household, full_name='Priya Rao')
        self.account = Account.objects.create(household=self.household, name='Groww', account_type=Account.AccountType.BROKER, primary_member=self.member)
        self.category = AssetCategory.objects.create(household=self.household, name='Equity', color='#6366f1')
        self.instrument = Instrument.objects.create(household=self.household, asset_category=self.category, name='Fund A', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)
        Transaction.objects.create(
            household=self.household, account=self.account, instrument=self.instrument,
            tx_date=date(2025, 1, 1), amount=Decimal('10000.00'), quantity=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )

    @patch('ai_insights.services.get_client')
    def test_explain_rebalancing_stores_and_upserts(self, mock_get_client):
        from ai_insights.services import explain_rebalancing

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _FakeTextResponse('Your Equity category is 100% of your portfolio.')
        mock_get_client.return_value = mock_client

        result = explain_rebalancing(self.household.id, date(2026, 2, 1))
        self.assertEqual(RebalancingExplanation.objects.count(), 1)
        self.assertIn('rows', result.input_snapshot)

        # calling again for the same (household, as_of) upserts, not duplicates
        explain_rebalancing(self.household.id, date(2026, 2, 1))
        self.assertEqual(RebalancingExplanation.objects.count(), 1)


class ClassifyFundViewTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.client = _approved_client(self.household)
        self.instrument = Instrument.objects.create(household=self.household, name='Fund A', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)

    def test_post_returns_503_when_gemini_not_configured(self):
        response = self.client.post(f'/api/ai/classify-fund/{self.instrument.id}/')
        self.assertEqual(response.status_code, 503)

    def test_get_returns_404_before_any_classification(self):
        response = self.client.get(f'/api/ai/classify-fund/{self.instrument.id}/')
        self.assertEqual(response.status_code, 404)

    @patch('ai_insights.views.classify_fund')
    def test_post_returns_201_on_success(self, mock_classify):
        mock_classify.return_value = FundClassification.objects.create(
            instrument=self.instrument, bucket='equity', rule_60_40_category='growth',
            reasoning='test', model_used='gemini-3.6-flash',
        )
        response = self.client.post(f'/api/ai/classify-fund/{self.instrument.id}/')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['bucket'], 'equity')


class ExplainRebalancingViewTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.client = _approved_client(self.household)

    def test_post_requires_household_id(self):
        response = self.client.post('/api/ai/explain-rebalancing/', {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_post_returns_503_when_gemini_not_configured(self):
        response = self.client.post('/api/ai/explain-rebalancing/', {'household_id': self.household.id}, format='json')
        self.assertEqual(response.status_code, 503)


class AllocationTemplatesAIIntegrationTests(TestCase):
    """Confirms suggest_category_targets() actually reads FundClassification when
    present, and falls back to the instrument_type heuristic when absent."""

    def setUp(self):
        self.household = Household.objects.create(name='Nair Family')
        self.member = Member.objects.create(household=self.household, full_name='Anil Nair', date_of_birth=date(1990, 6, 15))
        self.account = Account.objects.create(household=self.household, name='Bank', account_type=Account.AccountType.BANK, primary_member=self.member)
        self.category = AssetCategory.objects.create(household=self.household, name='Mixed', color='#f59e0b')
        # instrument_type says "equity" (mutual_fund) but we'll AI-classify it as debt
        self.instrument = Instrument.objects.create(
            household=self.household, asset_category=self.category, name='Reclassified Fund', instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )
        Transaction.objects.create(
            household=self.household, account=self.account, instrument=self.instrument,
            tx_date=date(2026, 1, 1), amount=Decimal('10000.00'), quantity=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
        )

    def test_fallback_to_instrument_type_when_unclassified(self):
        from insights.allocation_templates import suggest_category_targets
        result = suggest_category_targets(self.household.id, date(2026, 2, 1), age=35, equity_base=100)
        by_name = {r['category_name']: r for r in result['categories']}
        self.assertEqual(by_name['Mixed']['classification'], 'equity')  # mutual_fund -> equity-ish by default

    def test_ai_classification_overrides_instrument_type_heuristic(self):
        FundClassification.objects.create(
            instrument=self.instrument, bucket='debt', rule_60_40_category='stability',
            reasoning='Actually a debt fund', model_used='gemini-3.6-flash',
        )
        from insights.allocation_templates import suggest_category_targets
        result = suggest_category_targets(self.household.id, date(2026, 2, 1), age=35, equity_base=100)
        by_name = {r['category_name']: r for r in result['categories']}
        self.assertEqual(by_name['Mixed']['classification'], 'debt')

    def test_hybrid_classification_splits_value_50_50(self):
        FundClassification.objects.create(
            instrument=self.instrument, bucket='hybrid', rule_60_40_category='growth',
            reasoning='balanced fund', model_used='gemini-3.6-flash',
        )
        from insights.allocation_templates import suggest_category_targets
        result = suggest_category_targets(self.household.id, date(2026, 2, 1), age=35, equity_base=100)
        by_name = {r['category_name']: r for r in result['categories']}
        # half equity, half debt -> neither equals the total -> classified 'mixed'
        self.assertEqual(by_name['Mixed']['classification'], 'mixed')


class ClassifyAllFundsServiceTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.fund1 = Instrument.objects.create(household=self.household, name='Fund A', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)
        self.fund2 = Instrument.objects.create(household=self.household, name='Fund B', instrument_type=Instrument.InstrumentType.SIP)
        self.non_mf = Instrument.objects.create(household=self.household, name='FD 1', instrument_type=Instrument.InstrumentType.FD)

    @patch('ai_insights.services.get_client')
    def test_classify_all_returns_proposals_without_writing(self, mock_get_client):
        from ai_insights.services import _ClassificationResult, classify_all_funds

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _FakeParsedResponse(
            _ClassificationResult(bucket='equity', rule_60_40_category='growth', reasoning='looks like equity')
        )
        mock_get_client.return_value = mock_client

        proposals = classify_all_funds(self.household.id)

        self.assertEqual(len(proposals), 2)  # only the 2 MF/SIP instruments, not the FD
        self.assertEqual(FundClassification.objects.count(), 0)  # nothing written yet
        instrument_ids = {p['instrument_id'] for p in proposals}
        self.assertEqual(instrument_ids, {self.fund1.id, self.fund2.id})

    @patch('ai_insights.services.get_client')
    def test_classify_all_includes_current_classification_for_comparison(self, mock_get_client):
        from ai_insights.services import _ClassificationResult, classify_all_funds

        FundClassification.objects.create(
            instrument=self.fund1, bucket='debt', rule_60_40_category='stability',
            reasoning='old', model_used='gemini-3.6-flash',
        )
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _FakeParsedResponse(
            _ClassificationResult(bucket='equity', rule_60_40_category='growth', reasoning='new take')
        )
        mock_get_client.return_value = mock_client

        proposals = classify_all_funds(self.household.id)
        fund1_proposal = next(p for p in proposals if p['instrument_id'] == self.fund1.id)
        self.assertEqual(fund1_proposal['current_bucket'], 'debt')
        self.assertEqual(fund1_proposal['bucket'], 'equity')

    @patch('ai_insights.services.get_client')
    def test_classify_all_continues_past_per_fund_errors(self, mock_get_client):
        from ai_insights.services import _ClassificationResult, classify_all_funds

        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = [
            Exception('gemini blew up on fund A'),
            _FakeParsedResponse(_ClassificationResult(bucket='debt', rule_60_40_category='stability', reasoning='ok')),
        ]
        mock_get_client.return_value = mock_client

        proposals = classify_all_funds(self.household.id)
        self.assertEqual(len(proposals), 2)
        errored = [p for p in proposals if 'error' in p]
        succeeded = [p for p in proposals if 'error' not in p]
        self.assertEqual(len(errored), 1)
        self.assertEqual(len(succeeded), 1)

    def test_classify_all_empty_household_returns_empty_list(self):
        from ai_insights.services import classify_all_funds
        empty_household = Household.objects.create(name='Empty Family')
        self.assertEqual(classify_all_funds(empty_household.id), [])


class ApplyClassificationsServiceTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.fund1 = Instrument.objects.create(household=self.household, name='Fund A', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)
        self.fund2 = Instrument.objects.create(household=self.household, name='Fund B', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)

    def test_apply_only_writes_approved_rows(self):
        from ai_insights.services import apply_classifications

        applied = apply_classifications([
            {'instrument_id': self.fund1.id, 'bucket': 'equity', 'rule_60_40_category': 'growth', 'reasoning': 'r1', 'approved': True},
            {'instrument_id': self.fund2.id, 'bucket': 'debt', 'rule_60_40_category': 'stability', 'reasoning': 'r2', 'approved': False},
        ])
        self.assertEqual(applied, 1)
        self.assertEqual(FundClassification.objects.count(), 1)
        self.assertTrue(FundClassification.objects.filter(instrument=self.fund1).exists())
        self.assertFalse(FundClassification.objects.filter(instrument=self.fund2).exists())

    def test_apply_stores_edited_values_not_original_proposal(self):
        from ai_insights.services import apply_classifications

        # simulates a user editing the bucket in the review UI before approving
        apply_classifications([
            {'instrument_id': self.fund1.id, 'bucket': 'hybrid', 'rule_60_40_category': 'growth', 'reasoning': 'user override', 'approved': True},
        ])
        classification = FundClassification.objects.get(instrument=self.fund1)
        self.assertEqual(classification.bucket, 'hybrid')

    def test_apply_upserts_existing_classification(self):
        from ai_insights.services import apply_classifications

        FundClassification.objects.create(
            instrument=self.fund1, bucket='debt', rule_60_40_category='stability',
            reasoning='old', model_used='gemini-3.6-flash',
        )
        apply_classifications([
            {'instrument_id': self.fund1.id, 'bucket': 'equity', 'rule_60_40_category': 'growth', 'reasoning': 'new', 'approved': True},
        ])
        self.assertEqual(FundClassification.objects.count(), 1)
        self.assertEqual(FundClassification.objects.get().bucket, 'equity')

    def test_apply_skips_nonexistent_instrument(self):
        from ai_insights.services import apply_classifications
        applied = apply_classifications([
            {'instrument_id': 999999, 'bucket': 'equity', 'rule_60_40_category': 'growth', 'reasoning': 'r', 'approved': True},
        ])
        self.assertEqual(applied, 0)


class ClassifyAllFundsViewTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.client = _approved_client(self.household)
        self.fund1 = Instrument.objects.create(household=self.household, name='Fund A', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)

    def test_post_requires_household_id(self):
        response = self.client.post('/api/ai/classify-all-funds/', {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_post_returns_503_when_gemini_not_configured(self):
        response = self.client.post('/api/ai/classify-all-funds/', {'household_id': self.household.id}, format='json')
        self.assertEqual(response.status_code, 503)

    @patch('ai_insights.views.classify_all_funds')
    def test_post_returns_proposals(self, mock_classify_all):
        mock_classify_all.return_value = [
            {'instrument_id': self.fund1.id, 'instrument_name': 'Fund A', 'bucket': 'equity', 'rule_60_40_category': 'growth', 'reasoning': 'r'},
        ]
        response = self.client.post('/api/ai/classify-all-funds/', {'household_id': self.household.id}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['proposals']), 1)


class ApplyClassificationsViewTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.client = _approved_client(self.household)
        self.fund1 = Instrument.objects.create(household=self.household, name='Fund A', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)

    def test_post_requires_classifications(self):
        response = self.client.post('/api/ai/apply-classifications/', {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_post_applies_and_returns_count(self):
        response = self.client.post('/api/ai/apply-classifications/', {
            'classifications': [
                {'instrument_id': self.fund1.id, 'bucket': 'equity', 'rule_60_40_category': 'growth', 'reasoning': 'r', 'approved': True},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['applied'], 1)
        self.assertEqual(FundClassification.objects.count(), 1)
