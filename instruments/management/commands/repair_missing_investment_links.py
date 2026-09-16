"""
Repairs Transaction rows for mutual_fund/sip Instruments whose `investment`
FK was silently dropped by a bug in ledger/serializers.py's TransactionSerializer
(it omitted 'investment' from Meta.fields, so DRF discarded it on every create
until that was fixed — see ledger/serializers.py).

A transaction with instrument.instrument_type in (mutual_fund, sip) and
investment_id=None should, in virtually every case, belong to the household's
shared MF/SIP shell's single Investment — since that shell only holds more
than one Investment for households with multiple funds, and in that case
there is no remaining signal on the affected transaction (name, symbol, etc.
were never stored on Transaction) to say which fund it was for. So:

  - Shell has exactly ONE Investment  -> unambiguous, safe to relink.
  - Shell has 0 or 2+ Investments     -> cannot be inferred; reported as
                                          "needs manual review", never guessed.

Always dry-run (report only) unless --confirm is passed.

Usage:
  python manage.py repair_missing_investment_links                     # dry-run, all households
  python manage.py repair_missing_investment_links --household-id 1    # dry-run, one household
  python manage.py repair_missing_investment_links --confirm           # actually relink
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Report (and optionally fix) buy/sell Transactions missing their investment link due to a past serializer bug.'

    def add_arguments(self, parser):
        parser.add_argument('--household-id', type=int, default=None, help='Limit to one household. Default: all households.')
        parser.add_argument('--confirm', action='store_true', help='Actually relink transactions. Without this, only a report is printed.')

    def handle(self, *args, **options):
        from core.models import Household
        from instruments.models import Instrument, Investment
        from ledger.models import Transaction

        household_id = options['household_id']
        confirm = options['confirm']

        households = Household.objects.filter(pk=household_id) if household_id else Household.objects.all()

        total_fixable = 0
        total_ambiguous = 0

        for household in households:
            shells = Instrument.objects.filter(
                household=household, instrument_type__in=[Instrument.InstrumentType.MUTUAL_FUND, Instrument.InstrumentType.SIP],
            )
            for shell in shells:
                affected = Transaction.objects.filter(household=household, instrument=shell, investment__isnull=True)
                count = affected.count()
                if count == 0:
                    continue

                investments = list(Investment.objects.filter(instrument=shell))
                if len(investments) == 1:
                    total_fixable += count
                    self.stdout.write(
                        f'[{household.name}] "{shell.name}": {count} transaction(s) missing investment '
                        f'-> would relink to "{investments[0].name}" (only fund under this shell)'
                    )
                    if confirm:
                        updated = affected.update(investment=investments[0])
                        self.stdout.write(self.style.SUCCESS(f'  relinked {updated} transaction(s)'))
                else:
                    total_ambiguous += count
                    reason = 'no Investment rows exist under this shell' if not investments else f'{len(investments)} funds under this shell — cannot infer which'
                    self.stdout.write(self.style.WARNING(
                        f'[{household.name}] "{shell.name}": {count} transaction(s) missing investment '
                        f'-> NEEDS MANUAL REVIEW ({reason}). Transaction ids: {list(affected.values_list("id", flat=True))}'
                    ))

        self.stdout.write('')
        if confirm:
            self.stdout.write(self.style.SUCCESS(f'Done. Relinked {total_fixable} transaction(s). {total_ambiguous} still need manual review.'))
        else:
            self.stdout.write(f'Dry run: {total_fixable} transaction(s) would be relinked automatically, {total_ambiguous} need manual review. Re-run with --confirm to apply.')
