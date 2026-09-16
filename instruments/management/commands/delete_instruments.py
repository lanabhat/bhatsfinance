"""
Deletes all Instrument rows for a household — cascading to FDDetails,
BondDetails (+coupon acks), MutualFundDetails, InstrumentOwnership,
FundHoldingsSnapshot, SIPMandate/RDMandate (+payment acks), ValuationSnapshot,
and (if installed) fund_data.ExternalFund/NAV cache and ai_insights cached
classifications.

Does NOT touch: ledger.Transaction (instrument FK is SET_NULL — transactions
survive, just lose the instrument link until reimported and relinked),
sms_ingestion/gmail_ingestion (no FK to Instrument at all), Account,
AssetCategory, Member, Household.

Always run export_instruments first — this command refuses to run unless
--confirm is passed, and always does a dry-run summary first.

Usage:
  python manage.py delete_instruments --household-id 1            # dry-run, shows counts only
  python manage.py delete_instruments --household-id 1 --confirm  # actually deletes
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = 'Delete all Instruments for a household (and their FD/Bond/MF details, ownerships, mandates). Transactions are preserved (instrument link nulled).'

    def add_arguments(self, parser):
        parser.add_argument('--household-id', type=int, required=True)
        parser.add_argument('--confirm', action='store_true', help='Actually perform the deletion. Without this, only a dry-run summary is printed.')

    def handle(self, *args, **options):
        from instruments.models import Instrument
        from ledger.models import Transaction

        household_id = options['household_id']
        confirm = options['confirm']

        qs = Instrument.objects.filter(household_id=household_id)
        count = qs.count()
        if count == 0:
            self.stdout.write(self.style.WARNING(f'No instruments found for household_id={household_id}. Nothing to do.'))
            return

        linked_tx_count = Transaction.objects.filter(instrument__household_id=household_id).count()

        self.stdout.write(f'Household {household_id}: {count} instrument(s) would be deleted.')
        self.stdout.write(f'{linked_tx_count} transaction(s) reference these instruments — they will be KEPT, '
                           f'with their instrument link cleared (SET_NULL), not deleted.')
        self.stdout.write('SMS/Gmail staging data is untouched (no relationship to Instrument).')

        if not confirm:
            self.stdout.write(self.style.WARNING(
                '\nDry run only — no changes made. Run export_instruments first if you haven\'t, '
                'then re-run this command with --confirm to actually delete.'
            ))
            return

        with db_transaction.atomic():
            deleted_count, deleted_by_model = qs.delete()

        self.stdout.write(self.style.SUCCESS(f'\nDeleted {count} instrument(s), {deleted_count} row(s) total across related tables:'))
        for model_label, n in sorted(deleted_by_model.items()):
            self.stdout.write(f'  {model_label}: {n}')
        self.stdout.write(self.style.SUCCESS(
            f'\n{linked_tx_count} transaction(s) preserved with instrument link cleared.'
        ))
