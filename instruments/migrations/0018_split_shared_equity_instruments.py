"""
Splits equity Instruments that ended up shared by more than one household
member — the result of the pre-fix Groww/Upstox importer matching stocks by
name only, household-wide, with no member scoping (see
instruments/services.py's get_or_create_equity_shell() for the ongoing fix).
Two members independently holding a same-named stock via separate broker
accounts got silently merged into one Instrument with a percentage-split
InstrumentOwnership per member, which then leaked one member's holding into
another's per-member holdings queries (e.g. the Groww re-import "not in this
file" check).

For each affected Instrument (equity, more than one InstrumentOwnership row):
  - Get-or-create the household's shared "Equity" Instrument shell.
  - For each owning member, create an Investment (name = stock name, member
    = that owner, symbol = old instrument's symbol) under the shell.
  - Move that member's Transactions from the old Instrument to
    (shell, investment).
  - Every ValuationSnapshot on the old Instrument carries its own unit_price
    (Groww/Upstox both always set it for equity) — recreate one snapshot per
    member per valuation_date as quantity_as_of_that_date * unit_price,
    rather than splitting the old household-total market_value by today's
    ownership ratio, since that would misstate value on dates before/after a
    member's actual buy.
  - Delete the old InstrumentOwnership rows and the old per-name Instrument
    once nothing references it any more.

Modeled on instruments/migrations/0015_migrate_mf_to_investment.py, but a
fan-out (one shared Instrument -> shell + N per-member Investments) rather
than a collapse — every owner here is already known via InstrumentOwnership/
Transaction.member, so there's no genuinely ambiguous case to log and skip
the way 0015 had for multi-owner MF instruments.

Single-owner equity Instruments are left untouched — they aren't broken by
this bug and don't need to move to the shell pattern for a fix to land; new
imports converge onto the shell going forward via the importer fix.
"""
from decimal import Decimal

from django.db import migrations


EQUITY_SHELL_NAME = 'Equity'


def migrate_forward(apps, schema_editor):
    Instrument = apps.get_model('instruments', 'Instrument')
    Investment = apps.get_model('instruments', 'Investment')
    InstrumentOwnership = apps.get_model('instruments', 'InstrumentOwnership')
    Transaction = apps.get_model('ledger', 'Transaction')
    ValuationSnapshot = apps.get_model('valuations', 'ValuationSnapshot')

    from django.db.models import Count

    shared = list(
        Instrument.objects.filter(instrument_type='equity')
        .annotate(n_owners=Count('ownerships'))
        .filter(n_owners__gt=1)
    )

    shell_by_household = {}
    investments_created = 0
    households_seen = set()

    for old in shared:
        household_id = old.household_id
        households_seen.add(household_id)

        shell = shell_by_household.get(household_id)
        if shell is None:
            shell, _ = Instrument.objects.get_or_create(
                household_id=household_id, name=EQUITY_SHELL_NAME,
                defaults={'instrument_type': 'equity', 'sub_category': 'equity'},
            )
            shell_by_household[household_id] = shell

        ownerships = list(InstrumentOwnership.objects.filter(instrument=old))
        all_valuations = list(ValuationSnapshot.objects.filter(instrument=old))

        for ownership in ownerships:
            member = ownership.member
            member_txs = list(Transaction.objects.filter(instrument=old, member=member))

            investment = Investment.objects.create(
                instrument=shell,
                member=member,
                name=old.name,
                symbol=old.symbol,
                folio_no='',
            )
            investments_created += 1

            Transaction.objects.filter(id__in=[t.id for t in member_txs]).update(
                instrument=shell, investment=investment,
            )

            # quantity this member actually held as of each valuation_date —
            # only their own buy/sell transactions up to that date, so a
            # snapshot from before this member's first buy correctly gets no
            # new row for them (they held nothing on that date).
            member_txs_sorted = sorted(member_txs, key=lambda t: (t.tx_date, t.id))
            for snap in all_valuations:
                qty_as_of = Decimal('0')
                for t in member_txs_sorted:
                    if t.tx_date > snap.valuation_date:
                        break
                    signed_qty = t.quantity or Decimal('0')
                    if t.direction == 'inflow':
                        signed_qty = -signed_qty
                    qty_as_of += signed_qty
                if qty_as_of == 0:
                    continue
                unit_price = snap.unit_price if snap.unit_price is not None else Decimal('0')
                ValuationSnapshot.objects.create(
                    household_id=household_id,
                    instrument=shell,
                    investment=investment,
                    account=None,
                    valuation_date=snap.valuation_date,
                    unit_price=unit_price,
                    market_value=(qty_as_of * unit_price).quantize(Decimal('0.01')),
                    source=snap.source,
                )

        InstrumentOwnership.objects.filter(instrument=old).delete()
        ValuationSnapshot.objects.filter(instrument=old).delete()
        old.delete()

    if shared:
        print(f'\n  [split_shared_equity_instruments] {len(shared)} shared equity instrument(s) split into '
              f'{investments_created} per-member Investment(s) across {len(households_seen)} household(s).')


def migrate_backward(apps, schema_editor):
    raise migrations.exceptions.IrreversibleError(
        'split_shared_equity_instruments cannot be reversed automatically — the original shared '
        'per-name Instrument rows are deleted. Restore from an export_instruments backup instead.'
    )


class Migration(migrations.Migration):

    dependencies = [
        # Depends on 0017 (not just 0016) specifically because this migration
        # creates multiple same-name Investments distinguished only by
        # member — that requires member to already be part of Investment's
        # unique_together, which 0017 adds.
        ('instruments', '0017_investment_unique_together_member'),
        ('ledger', '0008_transaction_realized_gain'),
        ('valuations', '0003_valuationsnapshot_investment_and_more'),
    ]

    operations = [
        migrations.RunPython(migrate_forward, migrate_backward),
    ]
