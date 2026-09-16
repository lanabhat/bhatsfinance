"""
Exports every MF/SIP Instrument's data in the shape it will become after
migration 0015 (Mutual Fund -> Investment collapse): one shared "Mutual
Fund" Instrument shell per household, with each old per-scheme Instrument
becoming an Investment row (name/symbol/folio/owner), plus the Transaction
and ValuationSnapshot links needed to relink them to the new Investment
after import.

This is a REHEARSAL/BACKUP tool, independent of migration 0015's own
RunPython logic (though it uses the identical transformation rules —
folio-suffix stripping, single-owner resolution, folio_no derivation) so
it can be:
  1. Run against a fresh copy of production BEFORE migration 0015/0016 are
     applied, as a portable backup of the pre-migration MF/SIP data in its
     post-migration shape.
  2. Used with import_mf_investments (a plain, non-destructive command,
     not a migration) to rehearse the whole transformation on a scratch
     database and verify it end-to-end before ever touching production.

Reads MutualFundDetails.instrument_id/folio_no via raw SQL because, at the
point migration 0014 has run but not 0015/0016, those columns still exist
in the database but are no longer mapped by the current MutualFundDetails
model (Django loads model shape from models.py source, which already
reflects the post-0016 schema) — see instruments/migrations/0014's
docstring for why the migrations are deliberately sequenced this way.

Usage:
  python manage.py export_mf_pre_migration --household-id 1 --out backup/mf_pre_migration_2026-09-09
  (writes backup/mf_pre_migration_2026-09-09.json)
"""
import json
import re
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

_FOLIO_SUFFIX_RE = re.compile(r'\s*\([^()]*\)\s*$')

MF_TYPES = ('mutual_fund', 'sip')
SHARED_MF_NAME = 'Mutual Fund'


def _jsonable(value):
    if isinstance(value, Decimal):
        return str(value)
    return value


class Command(BaseCommand):
    help = (
        'Export MF/SIP Instrument data in its post-migration-0015 shape (shared shell + '
        'Investment rows), for use as a rehearsal/backup input to import_mf_investments.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--household-id', type=int, required=True, help='Household to export.')
        parser.add_argument('--out', type=str, required=True, help='Output file path without extension (writes .json).')

    def handle(self, *args, **options):
        from core.models import Member
        from instruments.models import Instrument, InstrumentOwnership
        from ledger.models import Transaction
        from valuations.models import ValuationSnapshot

        household_id = options['household_id']
        out_path = Path(options['out'])
        out_path.parent.mkdir(parents=True, exist_ok=True)

        old_instruments = list(
            Instrument.objects.filter(household_id=household_id, instrument_type__in=MF_TYPES).order_by('id')
        )
        if not old_instruments:
            raise CommandError(f'No MF/SIP instruments found for household_id={household_id}.')

        # instrument_id -> (folio_no, amc, fund_category, fund_sub_category, expense_ratio)
        mf_details_by_instrument = {}
        ids = [i.id for i in old_instruments]
        placeholders = ','.join(['%s'] * len(ids))
        with connection.cursor() as cursor:
            cursor.execute(
                f'SELECT instrument_id, folio_no, amc, fund_category, fund_sub_category, expense_ratio '
                f'FROM instruments_mutualfunddetails WHERE instrument_id IN ({placeholders})',
                ids,
            )
            for instrument_id, folio_no, amc, fund_category, fund_sub_category, expense_ratio in cursor.fetchall():
                mf_details_by_instrument[instrument_id] = {
                    'folio_no': folio_no or '',
                    'amc': amc or '',
                    'fund_category': fund_category or '',
                    'fund_sub_category': fund_sub_category or '',
                    'expense_ratio': str(expense_ratio) if expense_ratio is not None else None,
                }

        members_by_id = {m.id: m.full_name for m in Member.objects.filter(household_id=household_id)}

        investments = []
        ambiguous = []

        for old in old_instruments:
            ownerships = list(InstrumentOwnership.objects.filter(instrument=old))
            member_name = members_by_id.get(ownerships[0].member_id) if len(ownerships) == 1 else None
            if len(ownerships) > 1:
                ambiguous.append(old.name)

            details = mf_details_by_instrument.get(old.id, {})
            folio_no = details.get('folio_no') or old.symbol or ''
            clean_name = _FOLIO_SUFFIX_RE.sub('', old.name).strip() or old.name

            tx_links = [
                {
                    'transaction_id': tx.id,
                    'idempotency_key': tx.idempotency_key,
                    'tx_date': str(tx.tx_date),
                    'amount': _jsonable(tx.amount),
                }
                for tx in Transaction.objects.filter(instrument=old).order_by('tx_date', 'id')
            ]
            valuation_links = [
                {
                    'valuation_snapshot_id': vs.id,
                    'valuation_date': str(vs.valuation_date),
                }
                for vs in ValuationSnapshot.objects.filter(instrument=old).order_by('valuation_date', 'id')
            ]

            investments.append({
                'old_instrument_id': old.id,
                'old_instrument_name': old.name,
                'name': clean_name,
                'symbol': old.symbol,
                'folio_no': folio_no,
                'is_active': old.is_active,
                'member_name': member_name,
                'mf_details': {
                    'amc': details.get('amc', ''),
                    'fund_category': details.get('fund_category', ''),
                    'fund_sub_category': details.get('fund_sub_category', ''),
                    'expense_ratio': details.get('expense_ratio'),
                },
                'transaction_links': tx_links,
                'valuation_links': valuation_links,
            })

        data = {
            'household_id': household_id,
            'shell_instrument_name': SHARED_MF_NAME,
            'investments': investments,
        }

        json_path = out_path.with_suffix('.json')
        json_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')

        if ambiguous:
            self.stdout.write(self.style.WARNING(
                f'{len(ambiguous)} instrument(s) had multiple owners and were exported with '
                f'member_name=None (manual fix-up needed): {ambiguous}'
            ))
        self.stdout.write(self.style.SUCCESS(
            f'Exported {len(investments)} MF/SIP investment(s) '
            f'({sum(len(i["transaction_links"]) for i in investments)} linked transactions, '
            f'{sum(len(i["valuation_links"]) for i in investments)} linked valuation snapshots) to:\n'
            f'  {json_path}'
        ))
