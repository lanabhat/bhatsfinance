from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Household
from instruments.models import Account, AssetCategory, Instrument
from ledger.models import Transaction
from networth_tree.models import NetWorthTreeNode, NetWorthTreeSnapshot
from valuations.models import ValuationSnapshot


class NetWorthTreeApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.household = Household.objects.create(name='Test Family', base_currency='INR')
        self.as_of = date(2026, 4, 22)

        self.account = Account.objects.create(
            household=self.household,
            name='Primary Bank',
            account_type=Account.AccountType.BANK,
            institution_name='Test Bank',
            opening_balance=Decimal('10000.00'),
        )
        self.category = AssetCategory.objects.create(
            household=self.household,
            name='Liquid',
            color='#0ea5e9',
            icon_name='droplet',
            sort_order=1,
        )
        self.instrument = Instrument.objects.create(
            household=self.household,
            asset_category=self.category,
            default_account=self.account,
            name='Test Fund',
            instrument_type=Instrument.InstrumentType.MUTUAL_FUND,
            symbol='TESTFUND',
            metadata={},
            is_active=True,
        )
        Transaction.objects.create(
            household=self.household,
            account=self.account,
            instrument=self.instrument,
            tx_date=self.as_of,
            amount=Decimal('1000.00'),
            quantity=Decimal('10.000000'),
            price_per_unit=Decimal('100.000000'),
            direction=Transaction.Direction.OUTFLOW,
            transaction_type=Transaction.TransactionType.BUY,
            source=Transaction.SourceType.MANUAL,
            external_reference='seed tx',
            idempotency_key='seed-tx-1',
            metadata={},
        )
        ValuationSnapshot.objects.create(
            household=self.household,
            valuation_date=self.as_of,
            instrument=self.instrument,
            market_value=Decimal('1250.00'),
            balance=Decimal('0.00'),
            notes='seed',
        )

    def _seed(self):
        response = self.client.post('/api/networth-tree/seed', {
            'household_id': self.household.id,
            'as_of': self.as_of.isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201)
        return response.json()['snapshot']

    def test_seed_creates_root_category_and_instrument_nodes(self):
        payload = self._seed()
        self.assertEqual(payload['household_id'], self.household.id)
        self.assertGreaterEqual(len(payload['nodes']), 1)
        root = payload['nodes'][0]
        self.assertEqual(root['name'], 'Net Worth')
        category_nodes = root['children']
        self.assertGreaterEqual(len(category_nodes), 1)
        instrument_found = any(child['children'] for child in category_nodes)
        self.assertTrue(instrument_found)

    def test_remaining_computation_on_parent(self):
        payload = self._seed()
        snapshot_id = payload['id']
        root_id = payload['nodes'][0]['id']
        response = self.client.post('/api/networth-tree/nodes', {
            'snapshot': snapshot_id,
            'parent': root_id,
            'name': 'Manual Bucket',
            'kind': 'manual_branch',
            'target_value': '3000.00',
            'sort_order': 99,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        snapshot = response.json()['snapshot']
        manual_node = next(node for node in snapshot['nodes'][0]['children'] if node['name'] == 'Manual Bucket')
        self.assertEqual(manual_node['remaining_value'], '3000.00')

        response = self.client.post('/api/networth-tree/nodes', {
            'snapshot': snapshot_id,
            'parent': manual_node['id'],
            'name': 'Child Item',
            'kind': 'manual_item',
            'current_value_override': '250.00',
            'sort_order': 1,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        snapshot = response.json()['snapshot']
        manual_node = next(node for node in snapshot['nodes'][0]['children'] if node['name'] == 'Manual Bucket')
        self.assertEqual(manual_node['remaining_value'], '2750.00')

    def test_override_precedence_for_linked_node(self):
        payload = self._seed()
        root = payload['nodes'][0]
        category_node = root['children'][0]
        patch_response = self.client.patch(
            f"/api/networth-tree/nodes/{category_node['id']}",
            {'current_value_override': '777.00'},
            format='json',
        )
        self.assertEqual(patch_response.status_code, 200)
        updated = patch_response.json()['snapshot']['nodes'][0]['children'][0]
        self.assertEqual(updated['resolved_current_value'], '777.00')

    def test_non_destructive_node_edits(self):
        payload = self._seed()
        node_id = payload['nodes'][0]['children'][0]['id']
        instrument_count = Instrument.objects.count()
        valuation_count = ValuationSnapshot.objects.count()

        patch_response = self.client.patch(
            f"/api/networth-tree/nodes/{node_id}",
            {'name': 'Renamed Category'},
            format='json',
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(Instrument.objects.count(), instrument_count)
        self.assertEqual(ValuationSnapshot.objects.count(), valuation_count)

    def test_snapshot_isolation_between_dates(self):
        self._seed()
        second_date = date(2026, 4, 23)
        response = self.client.post('/api/networth-tree/seed', {
            'household_id': self.household.id,
            'as_of': second_date.isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201)

        snapshots = NetWorthTreeSnapshot.objects.filter(household=self.household).order_by('as_of_date')
        self.assertEqual(snapshots.count(), 2)
        first_snapshot = snapshots[0]
        second_snapshot = snapshots[1]
        self.assertNotEqual(first_snapshot.id, second_snapshot.id)

        first_root = NetWorthTreeNode.objects.filter(snapshot=first_snapshot, parent__isnull=True).first()
        patch_response = self.client.patch(
            f'/api/networth-tree/nodes/{first_root.id}',
            {'name': 'Net Worth (Edited)'},
            format='json',
        )
        self.assertEqual(patch_response.status_code, 200)

        second_root = NetWorthTreeNode.objects.filter(snapshot=second_snapshot, parent__isnull=True).first()
        self.assertEqual(second_root.name, 'Net Worth')
