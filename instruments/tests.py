from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Household, UserProfile
from instruments.models import AllocationTarget, AssetCategory, Instrument, MutualFundDetails


def _approved_client(household):
    user = get_user_model().objects.create_user(username='tester', password='x')
    UserProfile.objects.create(user=user, household=household, role='admin', status='approved')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class MutualFundDetailsModelTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.instrument = Instrument.objects.create(
            household=self.household,
            name='Flexi Cap Fund',
            instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )

    def test_one_to_one_with_instrument(self):
        details = MutualFundDetails.objects.create(
            instrument=self.instrument, amc='Axis Mutual Fund', fund_category='Equity',
            fund_sub_category='Flexi Cap', folio_no='12345',
        )
        self.assertEqual(self.instrument.mf_details, details)


class AllocationTargetModelTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.category = AssetCategory.objects.create(household=self.household, name='Equity', color='#6366f1')

    def test_unique_per_household_category(self):
        AllocationTarget.objects.create(household=self.household, asset_category=self.category, target_percent=Decimal('60.00'))
        with self.assertRaises(Exception):
            AllocationTarget.objects.create(household=self.household, asset_category=self.category, target_percent=Decimal('40.00'))


class BulkUpdateInstrumentCategoryViewTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.client = _approved_client(self.household)
        self.category = AssetCategory.objects.create(household=self.household, name='Equity', color='#6366f1')
        self.mf1 = Instrument.objects.create(household=self.household, name='Fund A', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)
        self.mf2 = Instrument.objects.create(household=self.household, name='Fund B', instrument_type=Instrument.InstrumentType.MUTUAL_FUND)

    def test_assigns_category_to_multiple_instruments(self):
        response = self.client.patch(
            '/api/instruments/bulk-update-category/',
            {'instrument_ids': [self.mf1.id, self.mf2.id], 'asset_category': self.category.id},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['updated'], 2)
        self.mf1.refresh_from_db()
        self.mf2.refresh_from_db()
        self.assertEqual(self.mf1.asset_category_id, self.category.id)
        self.assertEqual(self.mf2.asset_category_id, self.category.id)

    def test_clears_category_when_null(self):
        self.mf1.asset_category = self.category
        self.mf1.save(update_fields=['asset_category'])

        response = self.client.patch(
            '/api/instruments/bulk-update-category/',
            {'instrument_ids': [self.mf1.id], 'asset_category': None},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.mf1.refresh_from_db()
        self.assertIsNone(self.mf1.asset_category_id)

    def test_requires_instrument_ids(self):
        response = self.client.patch('/api/instruments/bulk-update-category/', {'asset_category': self.category.id}, format='json')
        self.assertEqual(response.status_code, 400)


class HoldingsParserTests(TestCase):
    def _make_workbook(self, rows):
        import io
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        for row in rows:
            ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    def test_parses_standard_sebi_format(self):
        from instruments.holdings_parser import parse_holdings_workbook
        rows = [
            ['Scheme', 'Test Fund'],
            [],
            ['', 'Monthly Portfolio Statement as on July 31, 2026'],
            ['', 'Name of the Instrument', 'ISIN', 'Industry', 'Quantity', 'Market/Fair Value\n (Rs. in Lakhs)', '% to Net\n Assets'],
            ['', 'Equity & Equity related', None, None, None, None, None],
            ['', '(a) Listed / awaiting listing on Stock Exchanges', None, None, None, None, None],
            ['CODE1', 'HDFC Bank Limited', 'INE040A01034', 'Banks', 1000, 500.0, 0.08],
            ['CODE2', 'Infosys Limited', 'INE009A01021', 'IT - Software', 500, 300.0, 0.05],
        ]
        data = self._make_workbook(rows)
        results = parse_holdings_workbook(data)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]['isin'], 'INE040A01034')
        self.assertEqual(results[0]['instrument_name'], 'HDFC Bank Limited')
        self.assertEqual(results[0]['weight_percent'], Decimal('8'))

    def test_handles_percent_already_as_percent_not_fraction(self):
        from instruments.holdings_parser import parse_holdings_workbook
        rows = [
            ['', 'Name of the Instrument', 'ISIN', 'Industry', '% to Net Assets'],
            ['', 'HDFC Bank Limited', 'INE040A01034', 'Banks', 8.2],
        ]
        data = self._make_workbook(rows)
        results = parse_holdings_workbook(data)
        self.assertEqual(results[0]['weight_percent'], Decimal('8.2'))

    def test_raises_when_no_header_found(self):
        from instruments.holdings_parser import HoldingsParseError, parse_holdings_workbook
        rows = [['just', 'some', 'random', 'data']]
        data = self._make_workbook(rows)
        with self.assertRaises(HoldingsParseError):
            parse_holdings_workbook(data)


class UploadFundHoldingsViewTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.client = _approved_client(self.household)
        self.instrument = Instrument.objects.create(
            household=self.household, name='Test Fund', instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
        )

    def _make_upload_file(self):
        import io
        import openpyxl
        from django.core.files.uploadedfile import SimpleUploadedFile
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['', 'Name of the Instrument', 'ISIN', 'Industry', '% to Net Assets'])
        ws.append(['', 'HDFC Bank Limited', 'INE040A01034', 'Banks', 0.08])
        buf = io.BytesIO()
        wb.save(buf)
        return SimpleUploadedFile('portfolio.xlsx', buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    def test_upload_creates_snapshot_and_holdings(self):
        response = self.client.post(
            f'/api/instruments/{self.instrument.id}/upload-holdings/',
            {'file': self._make_upload_file(), 'as_of_date': '2026-07-31'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201)
        from instruments.models import FundHoldingsSnapshot
        snapshot = FundHoldingsSnapshot.objects.get(instrument=self.instrument)
        self.assertEqual(snapshot.holdings.count(), 1)
        self.assertEqual(snapshot.holdings.first().isin, 'INE040A01034')

    def test_reupload_same_date_replaces_snapshot(self):
        self.client.post(
            f'/api/instruments/{self.instrument.id}/upload-holdings/',
            {'file': self._make_upload_file(), 'as_of_date': '2026-07-31'},
            format='multipart',
        )
        self.client.post(
            f'/api/instruments/{self.instrument.id}/upload-holdings/',
            {'file': self._make_upload_file(), 'as_of_date': '2026-07-31'},
            format='multipart',
        )
        from instruments.models import FundHoldingsSnapshot
        self.assertEqual(FundHoldingsSnapshot.objects.filter(instrument=self.instrument).count(), 1)

    def test_missing_file_returns_400(self):
        response = self.client.post(f'/api/instruments/{self.instrument.id}/upload-holdings/', {}, format='multipart')
        self.assertEqual(response.status_code, 400)


class SeedDemoFundsCommandTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Seed Command Test Household')

    def test_seed_creates_demo_instruments(self):
        from io import StringIO
        from django.core.management import call_command
        call_command('seed_demo_funds', household_id=self.household.id, stdout=StringIO())
        self.assertEqual(Instrument.objects.filter(household=self.household).count(), 7)
        self.assertTrue(Instrument.objects.filter(household=self.household, name__startswith='Demo ').count() == 7)

    def test_seed_creates_mf_details_for_each(self):
        from io import StringIO
        from django.core.management import call_command
        call_command('seed_demo_funds', household_id=self.household.id, stdout=StringIO())
        for inst in Instrument.objects.filter(household=self.household):
            self.assertTrue(MutualFundDetails.objects.filter(instrument=inst).exists())

    def test_seed_is_idempotent(self):
        from io import StringIO
        from django.core.management import call_command
        call_command('seed_demo_funds', household_id=self.household.id, stdout=StringIO())
        first_count = Instrument.objects.filter(household=self.household).count()
        call_command('seed_demo_funds', household_id=self.household.id, stdout=StringIO())
        second_count = Instrument.objects.filter(household=self.household).count()
        self.assertEqual(first_count, second_count)

    def test_seed_respects_count_argument(self):
        from io import StringIO
        from django.core.management import call_command
        call_command('seed_demo_funds', household_id=self.household.id, count=3, stdout=StringIO())
        self.assertEqual(Instrument.objects.filter(household=self.household).count(), 3)

    def test_seed_requires_valid_household(self):
        from django.core.management import CommandError, call_command
        with self.assertRaises(CommandError):
            call_command('seed_demo_funds', household_id=999999)

    def test_seed_backfills_xirr_computable_data(self):
        from datetime import date
        from io import StringIO
        from django.core.management import call_command
        from insights.services import compute_xirr
        call_command('seed_demo_funds', household_id=self.household.id, stdout=StringIO())
        for inst in Instrument.objects.filter(household=self.household):
            xirr = compute_xirr(self.household.id, date.today(), inst.id)
            self.assertIsNotNone(xirr, f'{inst.name} should have a computable XIRR')
