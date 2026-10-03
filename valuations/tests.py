from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Household, UserProfile
from instruments.models import Investment
from instruments.services import get_or_create_mf_shell
from valuations.models import ValuationSnapshot


class ValuationInvestmentFilterTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Menon Family')
        user = get_user_model().objects.create_user(username='tester', password='x')
        UserProfile.objects.create(user=user, household=self.household, role='admin', status='approved')
        self.client = APIClient()
        self.client.force_authenticate(user=user)

        self.shell = get_or_create_mf_shell(self.household)
        self.fund_a = Investment.objects.create(instrument=self.shell, name='Fund A')
        self.fund_b = Investment.objects.create(instrument=self.shell, name='Fund B')
        for inv, nav in ((self.fund_a, '10.5'), (self.fund_b, '42.0')):
            ValuationSnapshot.objects.create(
                household=self.household, instrument=self.shell, investment=inv,
                valuation_date=date(2026, 9, 1), unit_price=Decimal(nav),
            )

    def test_filter_by_investment_excludes_sibling_fund(self):
        response = self.client.get(f'/api/valuations/?household={self.household.id}&investment={self.fund_a.id}')
        self.assertEqual(response.status_code, 200, response.content)
        rows = response.json()['results']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['investment'], self.fund_a.id)

    def test_bulk_snapshot_values_each_fund_not_the_shell(self):
        from valuations.services import bulk_snapshot
        bulk_snapshot(self.household.id, date(2026, 9, 10))
        today = ValuationSnapshot.objects.filter(valuation_date=date(2026, 9, 10))
        self.assertFalse(today.filter(instrument=self.shell, investment__isnull=True).exists())
        self.assertEqual(today.get(investment=self.fund_a).unit_price, Decimal('10.5'))
        self.assertEqual(today.get(investment=self.fund_b).unit_price, Decimal('42.0'))

    def test_bulk_snapshot_rerun_is_idempotent(self):
        from valuations.services import bulk_snapshot
        bulk_snapshot(self.household.id, date(2026, 9, 10))
        before = ValuationSnapshot.objects.count()
        bulk_snapshot(self.household.id, date(2026, 9, 10))
        self.assertEqual(ValuationSnapshot.objects.count(), before)

    def test_bulk_snapshot_keeps_users_same_day_value(self):
        from valuations.services import bulk_snapshot
        ValuationSnapshot.objects.create(
            household=self.household, instrument=self.shell, investment=self.fund_a,
            valuation_date=date(2026, 9, 10), unit_price=Decimal('11.0'), source='manual',
        )
        bulk_snapshot(self.household.id, date(2026, 9, 10))
        rows = ValuationSnapshot.objects.filter(investment=self.fund_a, valuation_date=date(2026, 9, 10))
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.get().unit_price, Decimal('11.0'))

    def test_create_with_investment_is_attributed_to_fund(self):
        response = self.client.post('/api/valuations/', {
            'household': self.household.id, 'instrument': self.shell.id, 'investment': self.fund_b.id,
            'valuation_date': '2026-09-15', 'unit_price': '43.1', 'source': 'manual',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(ValuationSnapshot.objects.filter(investment=self.fund_b).count(), 2)
