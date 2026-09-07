"""Seeds a household with realistic-looking (but clearly fake) demo mutual fund
instruments — for testing bulk classification, overlap, and the fund
performance/CAGR views without needing real portfolio data.

Never runs implicitly against production data: --household-id is required, and
every created row is get_or_create'd on a name that is always prefixed "Demo "
so seeded data can never be mistaken for a real holding.
"""
from __future__ import annotations

import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction

from core.models import Household
from instruments.models import Account, AssetCategory, Instrument, MutualFundDetails
from ledger.models import Transaction
from valuations.models import ValuationSnapshot

# (name suffix, AMC, fund_category, fund_sub_category, expense_ratio, annualized growth rate used to backfill NAV)
DEMO_FUNDS = [
    ('Bluechip Large Cap Fund', 'Demo Asset Management', 'Equity', 'Large Cap', Decimal('0.450'), 0.12),
    ('Emerging Midcap Fund', 'Demo Asset Management', 'Equity', 'Mid Cap', Decimal('0.650'), 0.15),
    ('Small Wonders Fund', 'Demo Capital', 'Equity', 'Small Cap', Decimal('0.850'), 0.18),
    ('Flexi Opportunities Fund', 'Demo Capital', 'Equity', 'Flexi Cap', Decimal('0.700'), 0.13),
    ('Liquid Reserve Fund', 'Demo Trust Mutual Fund', 'Debt', 'Liquid', Decimal('0.200'), 0.06),
    ('Corporate Bond Fund', 'Demo Trust Mutual Fund', 'Debt', 'Corporate Bond', Decimal('0.350'), 0.075),
    ('Balanced Advantage Fund', 'Demo Asset Management', 'Hybrid', 'Balanced Advantage', Decimal('0.600'), 0.10),
]


class Command(BaseCommand):
    help = 'Seed a household with demo mutual fund instruments for testing (never runs without --household-id).'

    def add_arguments(self, parser):
        parser.add_argument('--household-id', type=int, required=True, help='Household to seed demo funds into.')
        parser.add_argument('--count', type=int, default=len(DEMO_FUNDS), help=f'Number of demo funds to create (max {len(DEMO_FUNDS)}).')

    def handle(self, *args, **options):
        household_id = options['household_id']
        count = min(options['count'], len(DEMO_FUNDS))

        try:
            household = Household.objects.get(pk=household_id)
        except Household.DoesNotExist:
            raise CommandError(f'No household with id={household_id}.')

        today = date.today()
        rng = random.Random(household_id)  # deterministic per household, so re-runs are stable

        account, _ = Account.objects.get_or_create(
            household=household, name='Demo Broker',
            defaults={'account_type': Account.AccountType.BROKER},
        )
        equity_cat, _ = AssetCategory.objects.get_or_create(
            household=household, name='Demo Equity', defaults={'color': '#6366f1', 'sort_order': 900},
        )
        debt_cat, _ = AssetCategory.objects.get_or_create(
            household=household, name='Demo Debt', defaults={'color': '#10b981', 'sort_order': 901},
        )

        created_count = 0
        with db_transaction.atomic():
            for name_suffix, amc, fund_category, fund_sub_category, expense_ratio, annual_growth in DEMO_FUNDS[:count]:
                name = f'Demo {name_suffix}'
                category = debt_cat if fund_category == 'Debt' else equity_cat

                instrument, created = Instrument.objects.get_or_create(
                    household=household, name=name,
                    defaults={
                        'instrument_type': Instrument.InstrumentType.MUTUAL_FUND,
                        'asset_category': category,
                        'default_account': account,
                    },
                )
                if not created:
                    continue  # already seeded — idempotent, don't duplicate transactions/valuations either

                MutualFundDetails.objects.get_or_create(
                    instrument=instrument,
                    defaults={
                        'amc': amc, 'fund_category': fund_category,
                        'fund_sub_category': fund_sub_category, 'expense_ratio': expense_ratio,
                    },
                )

                # Backdated buys over the last ~4 years, spaced a few months apart, so
                # XIRR/CAGR have real multi-period history (3M through 3Y always
                # covered; 5Y covered for funds bought earliest in this loop).
                nav = Decimal('100.0000')
                daily_growth = (1 + annual_growth) ** (1 / 365)
                purchase_offsets_days = sorted(rng.sample(range(30, 4 * 365), k=6))
                total_qty = Decimal('0')
                for offset_days in purchase_offsets_days:
                    tx_date = today - timedelta(days=(4 * 365 - offset_days))
                    nav_at_purchase = (Decimal('100.0000') * Decimal(str(daily_growth)) ** offset_days).quantize(Decimal('0.0001'))
                    amount = Decimal(str(rng.randint(8000, 25000)))
                    qty = (amount / nav_at_purchase).quantize(Decimal('0.000001'))
                    total_qty += qty
                    Transaction.objects.create(
                        household=household, account=account, instrument=instrument,
                        tx_date=tx_date, amount=amount, quantity=qty, price_per_unit=nav_at_purchase,
                        direction=Transaction.Direction.OUTFLOW, transaction_type=Transaction.TransactionType.BUY,
                        source=Transaction.SourceType.MANUAL,
                        idempotency_key=f'demo-seed-{instrument.id}-{offset_days}',
                    )

                # Monthly NAV snapshots for the same window, so compute_holdings_history()
                # (and therefore CAGR) has real points to interpolate from, not just the
                # two endpoints implied by transactions.
                for months_ago in range(0, 49, 1):  # ~4 years of monthly points
                    snap_date = today - timedelta(days=months_ago * 30)
                    if snap_date < today - timedelta(days=4 * 365):
                        break
                    days_from_epoch = (today - snap_date).days
                    nav_then = (Decimal('100.0000') * Decimal(str(daily_growth)) ** (4 * 365 - days_from_epoch)).quantize(Decimal('0.0001'))
                    ValuationSnapshot.objects.get_or_create(
                        household=household, instrument=instrument, valuation_date=snap_date,
                        defaults={'unit_price': nav_then, 'source': ValuationSnapshot.SourceType.MANUAL},
                    )

                created_count += 1
                self.stdout.write(f'  created {name} ({fund_sub_category}, {len(purchase_offsets_days)} buys)')

        self.stdout.write(self.style.SUCCESS(f'Seeded {created_count} demo fund(s) for household {household_id}.'))
