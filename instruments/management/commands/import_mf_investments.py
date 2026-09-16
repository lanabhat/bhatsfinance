"""
Imports MF/SIP investment data from a JSON file produced by
export_mf_pre_migration, recreating the post-migration-0015 shape: a single
shared "Mutual Fund" Instrument shell per household, with one Investment row
per fund/folio (name, symbol, folio_no, owner) and its MutualFundDetails,
relinking existing Transaction/ValuationSnapshot rows back to both the shell
Instrument and the specific Investment (matched by transaction_id /
valuation_snapshot_id, which are stable and never touched by this command).

This is a plain (non-migration) management command, NOT a replacement for
migration 0015 — it exists as:
  1. A rehearsal tool: restore export_mf_pre_migration's JSON into a scratch
     database that already has migrations 0014-0016 applied but no MF/SIP
     data, to verify the whole export->import round-trip produces the same
     shape migration 0015 would, before ever running it against production.
  2. A production restore path: if migration 0015 needs to be re-derived
     from the pre-migration backup for any reason, this recreates the same
     Investment rows the migration would have (idempotent by
     (instrument, name, folio_no), matching Investment's unique_together).

Only relinks Transaction/ValuationSnapshot rows that already exist in the
target database (matched by id) — never creates or deletes them.

Usage:
  python manage.py import_mf_investments --household-id 1 --in backup/mf_pre_migration_20260909.json
"""
import json
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction


def _dec(v):
    return None if v is None else Decimal(v)


class Command(BaseCommand):
    help = (
        'Import MF/SIP Investment data from an export_mf_pre_migration JSON file: creates the '
        'shared "Mutual Fund" shell Instrument, one Investment per fund/folio, MutualFundDetails, '
        'and relinks existing Transaction/ValuationSnapshot rows by id.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--household-id', type=int, required=True, help='Household to import into.')
        parser.add_argument('--in', dest='in_path', type=str, required=True, help='Path to the .json file from export_mf_pre_migration.')

    def handle(self, *args, **options):
        from core.models import Member
        from instruments.models import Instrument, Investment, MutualFundDetails
        from ledger.models import Transaction
        from valuations.models import ValuationSnapshot

        household_id = options['household_id']
        in_path = Path(options['in_path'])
        if not in_path.exists():
            raise CommandError(f'File not found: {in_path}')

        data = json.loads(in_path.read_text(encoding='utf-8'))
        members_by_name = {m.full_name: m for m in Member.objects.filter(household_id=household_id)}

        investments_created = 0
        investments_updated = 0
        tx_relinked = 0
        tx_missing = []
        val_relinked = 0
        val_missing = []

        with db_transaction.atomic():
            shell, _ = Instrument.objects.get_or_create(
                household_id=household_id,
                name=data.get('shell_instrument_name', 'Mutual Fund'),
                defaults={'instrument_type': 'mutual_fund', 'sub_category': ''},
            )

            for row in data['investments']:
                member = members_by_name.get(row.get('member_name'))

                investment, created = Investment.objects.update_or_create(
                    instrument=shell,
                    name=row['name'],
                    folio_no=row.get('folio_no', ''),
                    defaults={
                        'member': member,
                        'symbol': row.get('symbol', ''),
                        'is_active': row.get('is_active', True),
                    },
                )
                if created:
                    investments_created += 1
                else:
                    investments_updated += 1

                mf = row.get('mf_details') or {}
                MutualFundDetails.objects.update_or_create(
                    investment=investment,
                    defaults={
                        'amc': mf.get('amc', ''),
                        'fund_category': mf.get('fund_category', ''),
                        'fund_sub_category': mf.get('fund_sub_category', ''),
                        'expense_ratio': _dec(mf.get('expense_ratio')),
                    },
                )

                for link in row.get('transaction_links', []):
                    updated = Transaction.objects.filter(id=link['transaction_id']).update(
                        instrument=shell, investment=investment,
                    )
                    tx_relinked += updated
                    if not updated:
                        tx_missing.append(link['transaction_id'])

                for link in row.get('valuation_links', []):
                    updated = ValuationSnapshot.objects.filter(id=link['valuation_snapshot_id']).update(
                        instrument=shell, investment=investment,
                    )
                    val_relinked += updated
                    if not updated:
                        val_missing.append(link['valuation_snapshot_id'])

        self.stdout.write(self.style.SUCCESS(
            f'Investments: {investments_created} created, {investments_updated} updated under shell '
            f'"{shell.name}" (id={shell.id}).\n'
            f'Transactions relinked: {tx_relinked}. ValuationSnapshots relinked: {val_relinked}.'
        ))
        if tx_missing:
            self.stdout.write(self.style.WARNING(
                f'{len(tx_missing)} transaction(s) could not be relinked (id not found in this '
                f'database): {tx_missing[:20]}{"..." if len(tx_missing) > 20 else ""}'
            ))
        if val_missing:
            self.stdout.write(self.style.WARNING(
                f'{len(val_missing)} valuation snapshot(s) could not be relinked (id not found in '
                f'this database): {val_missing[:20]}{"..." if len(val_missing) > 20 else ""}'
            ))
