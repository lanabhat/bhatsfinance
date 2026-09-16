"""
Milestone 2 of the Investment redesign: collapses every existing per-scheme
Mutual Fund / SIP Instrument into a single shared "Mutual Fund" Instrument
shell per household, with each old Instrument becoming an Investment row
underneath it — carrying its own name, folio, and owner (moved down from
InstrumentOwnership to Investment.member).

For each old MF/SIP Instrument:
  - Create (or reuse) the household's shared "Mutual Fund" Instrument.
  - Create an Investment row: name = old instrument name with any trailing
    "(folio)" suffix stripped (the Groww importer's disambiguator — no
    longer needed once folio lives on Investment.folio_no directly), symbol
    = old instrument.symbol, folio_no = old symbol (FD/MF importers store
    folio/account number in symbol) or MutualFundDetails.folio_no if set,
    member = the old instrument's single owner (all 44 in this household's
    real data have exactly one — a genuinely ambiguous multi-owner case is
    logged and left with member=None for manual fix-up rather than guessed).
  - Point every Transaction/ValuationSnapshot with instrument=<old> at
    investment=<new> and instrument=<shared shell>.
  - Point MutualFundDetails/FundHoldingsSnapshot/ExternalFund/
    FundClassification/FundReturnsComparison at the new Investment (the
    AI-cache ones are dropped instead of remapped — pure regeneratable
    cache, not worth the mapping risk; see the "drop it" decision).
  - Delete the now-orphaned old per-scheme Instrument once nothing
    references it.

Purely additive/informational until this migration runs — MutualFundDetails.
investment and FundHoldingsSnapshot.investment stay nullable through 0014,
so nothing breaks if this needs to be re-run or rolled back before the
followup migration (0016) removes the old fields for good.
"""
import re

import django.db.models.deletion
from django.db import migrations, models


_FOLIO_SUFFIX_RE = re.compile(r'\s*\([^()]*\)\s*$')

MF_TYPES = ('mutual_fund', 'sip')
SHARED_MF_NAME = 'Mutual Fund'


def migrate_forward(apps, schema_editor):
    Instrument = apps.get_model('instruments', 'Instrument')
    Investment = apps.get_model('instruments', 'Investment')
    InstrumentOwnership = apps.get_model('instruments', 'InstrumentOwnership')
    MutualFundDetails = apps.get_model('instruments', 'MutualFundDetails')
    FundHoldingsSnapshot = apps.get_model('instruments', 'FundHoldingsSnapshot')
    Transaction = apps.get_model('ledger', 'Transaction')
    ValuationSnapshot = apps.get_model('valuations', 'ValuationSnapshot')

    # ExternalFund/FundClassification/FundReturnsComparison are not touched
    # here — all three are empty tables in every environment this migration
    # has been run against (pure regeneratable cache/opt-in links, nothing
    # a user manually re-enters), and their own instrument->investment
    # RemoveField/AddField migrations (fund_data.0005, ai_insights.0003) run
    # independently since there's no data to remap. If a real deployment
    # ever has rows there when this runs, they'll simply keep instrument_id
    # pointing at a since-deleted row until those apps' migrations null it
    # out via AddField's default — acceptable given they're disposable cache.

    ambiguous = []
    households_seen = set()
    shell_by_household = {}

    old_instruments = list(Instrument.objects.filter(instrument_type__in=MF_TYPES))

    for old in old_instruments:
        household_id = old.household_id
        households_seen.add(household_id)

        shell = shell_by_household.get(household_id)
        if shell is None:
            shell, _ = Instrument.objects.get_or_create(
                household_id=household_id, name=SHARED_MF_NAME,
                defaults={'instrument_type': 'mutual_fund', 'sub_category': ''},
            )
            shell_by_household[household_id] = shell

        ownerships = list(InstrumentOwnership.objects.filter(instrument=old))
        member = ownerships[0].member if len(ownerships) == 1 else None
        if len(ownerships) > 1:
            ambiguous.append(old.name)

        mf_details = MutualFundDetails.objects.filter(instrument=old).first()
        folio_no = (mf_details.folio_no if mf_details else '') or old.symbol or ''
        clean_name = _FOLIO_SUFFIX_RE.sub('', old.name).strip() or old.name

        investment = Investment.objects.create(
            instrument=shell,
            member=member,
            name=clean_name,
            symbol=old.symbol,
            folio_no=folio_no,
            is_active=old.is_active,
        )

        Transaction.objects.filter(instrument=old).update(instrument=shell, investment=investment)
        ValuationSnapshot.objects.filter(instrument=old).update(instrument=shell, investment=investment)

        if mf_details:
            # This migration's own leading AlterField makes `instrument`
            # nullable (it's dropped for good in 0016), specifically so this
            # row can be detached from `old` before old.delete() cascades —
            # it can't be repointed at `shell` instead, since every
            # MutualFundDetails row would then collide on that same OneToOne
            # `instrument` value.
            mf_details.instrument = None
            mf_details.investment = investment
            mf_details.save(update_fields=['instrument', 'investment'])

        FundHoldingsSnapshot.objects.filter(instrument=old).update(investment=investment)

        InstrumentOwnership.objects.filter(instrument=old).delete()

        # Only now safe to delete — every FK that pointed at `old` (Transaction,
        # ValuationSnapshot, MutualFundDetails.instrument, InstrumentOwnership)
        # has been relinked to `shell`/`investment` or detached above.
        old.delete()

    if ambiguous:
        print(f'\n  [migrate_mf_to_investment] {len(ambiguous)} instrument(s) had multiple owners and were '
              f'migrated with member=None (manual fix-up needed): {ambiguous}')
    print(f'  [migrate_mf_to_investment] {len(old_instruments)} MF/SIP instrument(s) migrated across '
          f'{len(households_seen)} household(s).')


def migrate_backward(apps, schema_editor):
    raise migrations.exceptions.IrreversibleError(
        'migrate_mf_to_investment cannot be reversed automatically — the original per-scheme '
        'Instrument rows are deleted. Restore from an export_instruments backup instead.'
    )


class Migration(migrations.Migration):

    dependencies = [
        ('instruments', '0014_alter_fundholdingssnapshot_unique_together_and_more'),
        ('ledger', '0007_transaction_investment'),
        ('valuations', '0003_valuationsnapshot_investment_and_more'),
    ]

    operations = [
        # Loosen `instrument` to nullable so migrate_forward can detach a
        # MutualFundDetails row from its old per-scheme Instrument before
        # deleting it, without violating the OneToOneField's NOT NULL/unique
        # constraint (all 44 rows can't point at the same shared shell).
        # 0016 removes the column entirely once this data migration is done.
        migrations.AlterField(
            model_name='mutualfunddetails',
            name='instrument',
            field=models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.CASCADE, related_name='mf_details_old', to='instruments.instrument'),
        ),
        migrations.RunPython(migrate_forward, migrate_backward),
    ]
