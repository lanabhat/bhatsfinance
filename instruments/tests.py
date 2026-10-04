from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Household, Member, UserProfile
from instruments.models import AllocationTarget, AssetCategory, Instrument, InstrumentOwnership, Investment, MutualFundDetails
from instruments.services import get_or_create_equity_shell, get_or_create_mf_shell


def _approved_client(household):
    user = get_user_model().objects.create_user(username='tester', password='x')
    UserProfile.objects.create(user=user, household=household, role='admin', status='approved')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class MutualFundDetailsModelTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.shell = get_or_create_mf_shell(self.household)
        self.investment = Investment.objects.create(
            instrument=self.shell, name='Flexi Cap Fund', folio_no='12345',
        )

    def test_one_to_one_with_investment(self):
        details = MutualFundDetails.objects.create(
            investment=self.investment, amc='Axis Mutual Fund', fund_category='Equity',
            fund_sub_category='Flexi Cap',
        )
        self.assertEqual(self.investment.mf_details, details)

    def test_create_via_api_uses_investment_not_instrument(self):
        client = _approved_client(self.household)
        response = client.post('/api/mf-details/', {
            'investment': self.investment.id, 'amc': 'Axis Mutual Fund',
            'fund_category': 'Equity', 'fund_sub_category': 'Flexi Cap',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(MutualFundDetails.objects.get(investment=self.investment).amc, 'Axis Mutual Fund')


class MutualFundInvestmentViewTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Iyer Family')
        self.client = _approved_client(self.household)

    def test_creates_shell_and_investment(self):
        response = self.client.post('/api/instruments/mf-investment/', {
            'household': self.household.id, 'name': 'Flexi Cap Fund', 'folio_no': '12345',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        investment = Investment.objects.get(id=response.data['id'])
        self.assertEqual(investment.name, 'Flexi Cap Fund')
        self.assertEqual(investment.instrument.name, 'Mutual Fund')
        self.assertEqual(Instrument.objects.filter(household=self.household, instrument_type='mutual_fund').count(), 1)

    def test_idempotent_on_same_fund_and_folio(self):
        first = self.client.post('/api/instruments/mf-investment/', {
            'household': self.household.id, 'name': 'Flexi Cap Fund', 'folio_no': '12345',
        }, format='json')
        second = self.client.post('/api/instruments/mf-investment/', {
            'household': self.household.id, 'name': 'Flexi Cap Fund', 'folio_no': '12345',
        }, format='json')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(Investment.objects.filter(name='Flexi Cap Fund').count(), 1)

    def test_different_folio_creates_distinct_investment(self):
        first = self.client.post('/api/instruments/mf-investment/', {
            'household': self.household.id, 'name': 'Flexi Cap Fund', 'folio_no': '111',
        }, format='json')
        second = self.client.post('/api/instruments/mf-investment/', {
            'household': self.household.id, 'name': 'Flexi Cap Fund', 'folio_no': '222',
        }, format='json')
        self.assertNotEqual(first.data['id'], second.data['id'])
        self.assertEqual(Investment.objects.filter(name='Flexi Cap Fund').count(), 2)
        self.assertEqual(Instrument.objects.filter(household=self.household, instrument_type='mutual_fund').count(), 1)

    def test_requires_household_and_name(self):
        response = self.client.post('/api/instruments/mf-investment/', {'household': self.household.id}, format='json')
        self.assertEqual(response.status_code, 400)


class EquityInvestmentViewTests(TestCase):
    """instrument_type='equity' routes MutualFundInvestmentView through the
    shared Equity shell instead — the general "get-or-create a shell +
    Investment" endpoint BuyForm.tsx's new-equity path uses, scoped by
    member rather than folio since equity has no natural folio."""

    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.member_a = Member.objects.create(household=self.household, full_name='Anita Rao')
        self.member_b = Member.objects.create(household=self.household, full_name='Kiran Rao')
        self.client = _approved_client(self.household)

    def test_creates_equity_shell_and_investment(self):
        response = self.client.post('/api/instruments/mf-investment/', {
            'household': self.household.id, 'name': 'HDFC BANK LTD', 'instrument_type': 'equity',
            'member': self.member_a.id,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        investment = Investment.objects.get(id=response.data['id'])
        self.assertEqual(investment.instrument.name, 'Equity')
        self.assertEqual(investment.instrument.instrument_type, 'equity')
        self.assertEqual(investment.member_id, self.member_a.id)

    def test_two_members_same_stock_name_get_distinct_investments(self):
        first = self.client.post('/api/instruments/mf-investment/', {
            'household': self.household.id, 'name': 'HDFC BANK LTD', 'instrument_type': 'equity',
            'member': self.member_a.id,
        }, format='json')
        second = self.client.post('/api/instruments/mf-investment/', {
            'household': self.household.id, 'name': 'HDFC BANK LTD', 'instrument_type': 'equity',
            'member': self.member_b.id,
        }, format='json')
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 201, second.content)
        self.assertNotEqual(first.data['id'], second.data['id'])
        self.assertEqual(Investment.objects.filter(name='HDFC BANK LTD').count(), 2)
        self.assertEqual(Instrument.objects.filter(household=self.household, instrument_type='equity', name='Equity').count(), 1)

    def test_idempotent_for_same_member_same_stock(self):
        first = self.client.post('/api/instruments/mf-investment/', {
            'household': self.household.id, 'name': 'HDFC BANK LTD', 'instrument_type': 'equity',
            'member': self.member_a.id,
        }, format='json')
        second = self.client.post('/api/instruments/mf-investment/', {
            'household': self.household.id, 'name': 'HDFC BANK LTD', 'instrument_type': 'equity',
            'member': self.member_a.id,
        }, format='json')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data['id'], second.data['id'])


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
        self.shell = get_or_create_mf_shell(self.household)
        self.investment = Investment.objects.create(instrument=self.shell, name='Test Fund')

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
            f'/api/instruments/{self.investment.id}/upload-holdings/',
            {'file': self._make_upload_file(), 'as_of_date': '2026-07-31'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201)
        from instruments.models import FundHoldingsSnapshot
        snapshot = FundHoldingsSnapshot.objects.get(investment=self.investment)
        self.assertEqual(snapshot.holdings.count(), 1)
        self.assertEqual(snapshot.holdings.first().isin, 'INE040A01034')

    def test_reupload_same_date_replaces_snapshot(self):
        self.client.post(
            f'/api/instruments/{self.investment.id}/upload-holdings/',
            {'file': self._make_upload_file(), 'as_of_date': '2026-07-31'},
            format='multipart',
        )
        self.client.post(
            f'/api/instruments/{self.investment.id}/upload-holdings/',
            {'file': self._make_upload_file(), 'as_of_date': '2026-07-31'},
            format='multipart',
        )
        from instruments.models import FundHoldingsSnapshot
        self.assertEqual(FundHoldingsSnapshot.objects.filter(investment=self.investment).count(), 1)

    def test_missing_file_returns_400(self):
        response = self.client.post(f'/api/instruments/{self.investment.id}/upload-holdings/', {}, format='multipart')
        self.assertEqual(response.status_code, 400)


class SeedDemoFundsCommandTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Seed Command Test Household')

    def test_seed_creates_demo_investments(self):
        from io import StringIO
        from django.core.management import call_command
        call_command('seed_demo_funds', household_id=self.household.id, stdout=StringIO())
        # One shared "Mutual Fund" Instrument shell, with 7 Investments underneath.
        self.assertEqual(Instrument.objects.filter(household=self.household).count(), 1)
        self.assertEqual(Investment.objects.filter(instrument__household=self.household).count(), 7)
        self.assertTrue(Investment.objects.filter(instrument__household=self.household, name__startswith='Demo ').count() == 7)

    def test_seed_creates_mf_details_for_each(self):
        from io import StringIO
        from django.core.management import call_command
        call_command('seed_demo_funds', household_id=self.household.id, stdout=StringIO())
        for inv in Investment.objects.filter(instrument__household=self.household):
            self.assertTrue(MutualFundDetails.objects.filter(investment=inv).exists())

    def test_seed_is_idempotent(self):
        from io import StringIO
        from django.core.management import call_command
        call_command('seed_demo_funds', household_id=self.household.id, stdout=StringIO())
        first_count = Investment.objects.filter(instrument__household=self.household).count()
        call_command('seed_demo_funds', household_id=self.household.id, stdout=StringIO())
        second_count = Investment.objects.filter(instrument__household=self.household).count()
        self.assertEqual(first_count, second_count)

    def test_seed_respects_count_argument(self):
        from io import StringIO
        from django.core.management import call_command
        call_command('seed_demo_funds', household_id=self.household.id, count=3, stdout=StringIO())
        self.assertEqual(Investment.objects.filter(instrument__household=self.household).count(), 3)

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
        for inv in Investment.objects.filter(instrument__household=self.household):
            xirr = compute_xirr(self.household.id, date.today(), investment_id=inv.id)
            self.assertIsNotNone(xirr, f'{inv.name} should have a computable XIRR')


class EquityShellTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Kumary Family')

    def test_creates_one_equity_shell(self):
        shell = get_or_create_equity_shell(self.household)
        self.assertEqual(shell.name, 'Equity')
        self.assertEqual(shell.instrument_type, 'equity')

    def test_reuses_shell_on_second_call(self):
        first = get_or_create_equity_shell(self.household)
        second = get_or_create_equity_shell(self.household)
        self.assertEqual(first.id, second.id)
        self.assertEqual(Instrument.objects.filter(household=self.household, instrument_type='equity').count(), 1)


class SplitSharedEquityInstrumentsMigrationTests(TestCase):
    """Exercises instruments/migrations/0017_split_shared_equity_instruments.py's
    migrate_forward() directly against real models — this repo has no
    dedicated migration-test harness (confirmed: 0015 has none either), and
    migrate_forward only touches apps.get_model()-style historical models, so
    it's safe to call directly in a normal TestCase (no fields are renamed
    between the historical and current model shape here)."""

    def setUp(self):
        self.household = Household.objects.create(name='Rao Family')
        self.member_a = Member.objects.create(household=self.household, full_name='E Devaki Kumary')
        self.member_b = Member.objects.create(household=self.household, full_name='Lakshminarayana K G')

    def _import_migration(self):
        import importlib
        return importlib.import_module('instruments.migrations.0018_split_shared_equity_instruments')

    def test_shared_equity_instrument_is_split_per_member(self):
        from datetime import date
        from ledger.models import Transaction
        from valuations.models import ValuationSnapshot
        import django.apps

        shared = Instrument.objects.create(
            household=self.household, name='HDFC BANK LTD', instrument_type='equity',
            symbol='INE040A01034',
        )
        InstrumentOwnership.objects.create(instrument=shared, member=self.member_a, allocation_percent=Decimal('97.53'))
        InstrumentOwnership.objects.create(instrument=shared, member=self.member_b, allocation_percent=Decimal('2.47'))
        tx_a = Transaction.objects.create(
            household=self.household, instrument=shared, member=self.member_a,
            tx_date=date(2026, 6, 19), amount=Decimal('403371.78'), quantity=Decimal('514'),
            direction='outflow', transaction_type='buy', currency='INR', source='csv',
        )
        tx_b = Transaction.objects.create(
            household=self.household, instrument=shared, member=self.member_b,
            tx_date=date(2026, 6, 19), amount=Decimal('9296.30'), quantity=Decimal('13'),
            direction='outflow', transaction_type='buy', currency='INR', source='csv',
        )
        ValuationSnapshot.objects.create(
            household=self.household, instrument=shared, valuation_date=date(2026, 9, 13),
            unit_price=Decimal('708.25'), market_value=Decimal('373247.75'), source='csv',
        )

        # A single-owner equity instrument in the same household must be left untouched.
        untouched = Instrument.objects.create(
            household=self.household, name='INFY', instrument_type='equity',
        )
        InstrumentOwnership.objects.create(instrument=untouched, member=self.member_a, allocation_percent=Decimal('100'))

        migration = self._import_migration()
        migration.migrate_forward(django.apps.apps, None)

        self.assertFalse(Instrument.objects.filter(id=shared.id).exists())
        self.assertTrue(Instrument.objects.filter(id=untouched.id).exists())

        shell = Instrument.objects.get(household=self.household, name='Equity', instrument_type='equity')
        investments = Investment.objects.filter(instrument=shell).order_by('member_id')
        self.assertEqual(investments.count(), 2)

        inv_a = investments.get(member=self.member_a)
        inv_b = investments.get(member=self.member_b)
        self.assertEqual(inv_a.name, 'HDFC BANK LTD')
        self.assertEqual(inv_b.name, 'HDFC BANK LTD')

        tx_a.refresh_from_db()
        tx_b.refresh_from_db()
        self.assertEqual(tx_a.investment_id, inv_a.id)
        self.assertEqual(tx_a.instrument_id, shell.id)
        self.assertEqual(tx_b.investment_id, inv_b.id)
        self.assertEqual(tx_b.instrument_id, shell.id)

        self.assertFalse(InstrumentOwnership.objects.filter(instrument_id=shared.id).exists())

        snap_a = ValuationSnapshot.objects.get(investment=inv_a)
        self.assertEqual(snap_a.market_value, (Decimal('514') * Decimal('708.25')).quantize(Decimal('0.01')))
        snap_b = ValuationSnapshot.objects.get(investment=inv_b)
        self.assertEqual(snap_b.market_value, (Decimal('13') * Decimal('708.25')).quantize(Decimal('0.01')))

    def test_no_op_when_no_shared_equity_instruments_exist(self):
        import django.apps
        Instrument.objects.create(household=self.household, name='TCS', instrument_type='equity')
        migration = self._import_migration()
        migration.migrate_forward(django.apps.apps, None)
        self.assertEqual(Instrument.objects.filter(household=self.household).count(), 1)
        self.assertFalse(Instrument.objects.filter(household=self.household, name='Equity').exists())


class BulkDeleteInstrumentsViewTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Kapoor Family')
        self.client = _approved_client(self.household)
        self.fd_1 = Instrument.objects.create(household=self.household, name='SBI FD 1', instrument_type='fd')
        self.fd_2 = Instrument.objects.create(household=self.household, name='SBI FD 2', instrument_type='fd')
        self.fd_3 = Instrument.objects.create(household=self.household, name='SBI FD 3', instrument_type='fd')

    def test_deletes_only_specified_ids(self):
        response = self.client.delete(
            f'/api/instruments/bulk-delete/?household_id={self.household.id}&instrument_id={self.fd_1.id}&instrument_id={self.fd_2.id}',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['deleted'], 2)
        self.assertFalse(Instrument.objects.filter(id=self.fd_1.id).exists())
        self.assertFalse(Instrument.objects.filter(id=self.fd_2.id).exists())
        self.assertTrue(Instrument.objects.filter(id=self.fd_3.id).exists())

    def test_no_ids_or_types_deletes_everything_for_household(self):
        # Matches existing type-wide bulk-delete semantics: no filter means
        # "everything for this household" — the frontend always sends an
        # explicit type or id list, but the endpoint itself doesn't require one.
        response = self.client.delete(f'/api/instruments/bulk-delete/?household_id={self.household.id}')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['deleted'], 3)
        self.assertEqual(Instrument.objects.filter(household=self.household).count(), 0)

    def test_instrument_id_does_not_affect_other_households(self):
        other_household = Household.objects.create(name='Other Family')
        other_fd = Instrument.objects.create(household=other_household, name='Other FD', instrument_type='fd')
        response = self.client.delete(
            f'/api/instruments/bulk-delete/?household_id={self.household.id}&instrument_id={other_fd.id}',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['deleted'], 0)
        self.assertTrue(Instrument.objects.filter(id=other_fd.id).exists())


class PurgeTests(TestCase):
    """Purge = delete a holding with its transactions/valuations. A plain delete
    SET_NULLs transactions, which for a fund leaves a phantom shell holding."""

    def setUp(self):
        from datetime import date
        from ledger.models import Transaction
        from valuations.models import ValuationSnapshot

        self.household = Household.objects.create(name='Pillai Family')
        self.client = _approved_client(self.household)
        self.shell = get_or_create_mf_shell(self.household)
        self.fund_keep = Investment.objects.create(instrument=self.shell, name='Fund Keep')
        self.fund_dup = Investment.objects.create(instrument=self.shell, name='Fund Dup')
        for inv in (self.fund_keep, self.fund_dup):
            Transaction.objects.create(
                household=self.household, instrument=self.shell, investment=inv, tx_date=date(2025, 1, 10),
                amount=Decimal('1000.00'), quantity=Decimal('10'), direction='outflow', transaction_type='buy',
            )
            ValuationSnapshot.objects.create(
                household=self.household, instrument=self.shell, investment=inv,
                valuation_date=date(2025, 6, 1), unit_price=Decimal('120'),
            )

    def test_purge_investment_removes_its_data_only(self):
        from datetime import date
        from insights.services import compute_holdings
        from ledger.models import Transaction
        from valuations.models import ValuationSnapshot

        response = self.client.post(f'/api/investments/{self.fund_dup.id}/purge/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), {'transactions_deleted': 1, 'valuations_deleted': 1})
        self.assertFalse(Investment.objects.filter(id=self.fund_dup.id).exists())
        self.assertEqual(Transaction.objects.filter(investment=self.fund_keep).count(), 1)
        self.assertEqual(ValuationSnapshot.objects.filter(investment=self.fund_keep).count(), 1)

        holdings = compute_holdings(self.household.id, date(2025, 7, 1))
        self.assertEqual([h['investment_id'] for h in holdings], [self.fund_keep.id])

    def test_purge_fd_instrument_removes_transactions_and_details(self):
        from datetime import date
        from instruments.models import FDDetails
        from ledger.models import Transaction

        fd = Instrument.objects.create(household=self.household, name='SBI FD 999', instrument_type='fd')
        tx = Transaction.objects.create(
            household=self.household, instrument=fd, tx_date=date(2025, 1, 10),
            amount=Decimal('50000.00'), direction='outflow', transaction_type='deposit',
        )
        FDDetails.objects.create(
            instrument=fd, funding_transaction=tx, account_number='999', principal=Decimal('50000'),
            annual_rate=Decimal('7'), investment_date=date(2025, 1, 10), maturity_date=date(2026, 1, 10),
        )
        response = self.client.post(f'/api/instruments/{fd.id}/purge/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['transactions_deleted'], 1)
        self.assertFalse(Instrument.objects.filter(id=fd.id).exists())
        self.assertFalse(Transaction.objects.filter(id=tx.id).exists())
        self.assertFalse(FDDetails.objects.filter(account_number='999').exists())

    def test_purge_shell_with_investments_is_refused(self):
        from ledger.models import Transaction

        response = self.client.post(f'/api/instruments/{self.shell.id}/purge/')
        self.assertEqual(response.status_code, 400, response.content)
        self.assertTrue(Instrument.objects.filter(id=self.shell.id).exists())
        self.assertEqual(Transaction.objects.filter(instrument=self.shell).count(), 2)


class HoldingClassificationTests(TestCase):
    def test_mutual_fund_isin_excludes_etfs(self):
        from instruments.services import is_mutual_fund_isin
        self.assertTrue(is_mutual_fund_isin('INF109K012K1', 'ICICI VFD DP GR'))
        self.assertTrue(is_mutual_fund_isin('INF174KA1HV3', 'KOTAK MTCF D-GROW'))
        self.assertFalse(is_mutual_fund_isin('INF109KC1NS5', 'ICICI NIFTY NXT50ETF'))
        self.assertFalse(is_mutual_fund_isin('INF732E01037', 'NIP ETNF1D RTLIQBEES'))
        self.assertFalse(is_mutual_fund_isin('INE154A01025', 'ITC LTD'))

    def test_bond_isin_from_structure(self):
        from instruments.services import is_bond_isin
        self.assertTrue(is_bond_isin('IN3920260020'))   # state development loan
        self.assertTrue(is_bond_isin('INE658F08565'))   # KIIFB debenture
        self.assertFalse(is_bond_isin('INE154A01025'))  # equity share
        self.assertFalse(is_bond_isin('INF109K012K1'))  # fund unit
        self.assertFalse(is_bond_isin(''))


class ReclassifyHoldingTests(TestCase):
    def setUp(self):
        from datetime import date
        from ledger.models import Transaction
        from valuations.models import ValuationSnapshot
        self.household = Household.objects.create(name='Pillai Family')
        self.member = Member.objects.create(household=self.household, full_name='Anu Pillai')
        self.equity = get_or_create_equity_shell(self.household)
        self.date = date(2026, 10, 2)

        def holding(name, isin, units, amount):
            inv = Investment.objects.create(instrument=self.equity, name=name, member=self.member, symbol=isin)
            Transaction.objects.create(
                household=self.household, instrument=self.equity, investment=inv, member=self.member, tx_date=self.date,
                amount=Decimal(amount), quantity=Decimal(units), direction='outflow', transaction_type='buy',
            )
            ValuationSnapshot.objects.create(
                household=self.household, instrument=self.equity, investment=inv, valuation_date=self.date,
                market_value=Decimal(amount), source='csv',
            )
            return inv
        self.holding = holding

    def _bond(self, name, isin, quantity):
        from datetime import date
        from instruments.models import BondDetails
        inst = Instrument.objects.create(household=self.household, name=name, instrument_type='bond')
        BondDetails.objects.create(
            instrument=inst, isin=isin, face_value=Decimal('100'), quantity=quantity, coupon_rate=Decimal('7.75'),
            investment_date=date(2024, 1, 1), maturity_date=date(2041, 6, 24),
        )
        return inst

    def test_move_to_mf_shell_carries_ledger(self):
        from instruments.services import move_investment_to_shell
        from ledger.models import Transaction
        inv = self.holding('KOTAK MTCF D-GROW', 'INF174KA1HV3', '471.52', '9946.67')
        mf = get_or_create_mf_shell(self.household)
        moved = move_investment_to_shell(inv, mf)
        self.assertEqual((moved.pk, moved.instrument_id, moved.isin), (inv.pk, mf.id, 'INF174KA1HV3'))
        self.assertEqual(Transaction.objects.get(investment=inv).instrument_id, mf.id)

    def test_move_merges_into_existing_same_isin(self):
        from instruments.services import move_investment_to_shell
        from ledger.models import Transaction
        mf = get_or_create_mf_shell(self.household)
        existing = Investment.objects.create(instrument=mf, name='Kotak Multi Cap', member=self.member, isin='INF174KA1HV3')
        inv = self.holding('KOTAK MTCF D-GROW', 'INF174KA1HV3', '10', '500')
        survivor = move_investment_to_shell(inv, mf)
        self.assertEqual(survivor.pk, existing.pk)
        self.assertFalse(Investment.objects.filter(pk=inv.pk).exists())
        self.assertEqual(Transaction.objects.filter(investment=existing).count(), 1)

    def test_duplicate_of_tracked_bonds_is_removed(self):
        from instruments.services import reclassify_bond_investment
        from ledger.models import Transaction
        self._bond('KIIFB A', 'INE658F08565', 2)
        self._bond('KIIFB B', 'INE658F08565', 1)
        inv = self.holding('KIIFB 9.30 21012032', 'INE658F08565', '3', '311400')
        self.assertEqual(reclassify_bond_investment(inv), 'removed_duplicate')
        self.assertFalse(Investment.objects.filter(pk=inv.pk).exists())
        self.assertFalse(Transaction.objects.filter(amount=Decimal('311400')).exists())

    def test_bond_with_different_units_is_converted_not_deleted(self):
        from instruments.services import reclassify_bond_investment
        from ledger.models import Transaction
        self._bond('Delhi SDL', 'IN3920260020', 500)
        inv = self.holding('DEL 37608 7.75 2041', 'IN3920260020', '1000', '99120')
        self.assertEqual(reclassify_bond_investment(inv), 'converted')
        bond = Instrument.objects.get(symbol='IN3920260020', instrument_type='bond')
        tx = Transaction.objects.get(amount=Decimal('99120'))
        self.assertEqual((tx.instrument_id, tx.investment_id), (bond.id, None))
        self.assertTrue(InstrumentOwnership.objects.filter(instrument=bond, member=self.member).exists())
