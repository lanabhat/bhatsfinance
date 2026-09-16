"""
Reimports Instruments (+ FDDetails/BondDetails/InstrumentOwnership/
SIPMandate/RDMandate + acks) from a JSON file produced by export_instruments,
and relinks existing Transaction rows back to their recreated instrument
(matched by transaction_id, which is stable — deleting instruments never
touches Transaction rows).

MutualFundDetails is intentionally NOT reimported here — it now lives under
Investment, not Instrument (Milestone 2 of the Investment redesign), which
this export/import pair predates.

Idempotent by (household, name): re-running against instruments that already
exist (e.g. partial reimport, or reimporting into a household you never
deleted) updates rather than duplicates.

Usage:
  python manage.py import_instruments --household-id 1 --in backup/instruments_2026-09-08.json
"""
import json
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction


def _dec(v):
    return None if v is None else Decimal(v)


class Command(BaseCommand):
    help = 'Reimport Instruments (+ FD/Bond/MF details, ownerships, SIP/RD mandates) from an export_instruments JSON file, relinking existing Transactions.'

    def add_arguments(self, parser):
        parser.add_argument('--household-id', type=int, required=True, help='Household to import into.')
        parser.add_argument('--in', dest='in_path', type=str, required=True, help='Path to the .json file from export_instruments.')

    def handle(self, *args, **options):
        from instruments.models import (
            Account, AssetCategory, BondDetails, FDDetails, Instrument,
            InstrumentOwnership,
        )
        from alerts.models import RDMandate, RDPaymentAck, SIPMandate, SIPPaymentAck
        from core.models import Member
        from ledger.models import Transaction

        household_id = options['household_id']
        in_path = Path(options['in_path'])
        if not in_path.exists():
            raise CommandError(f'File not found: {in_path}')

        data = json.loads(in_path.read_text(encoding='utf-8'))

        accounts_by_name = {a.name: a for a in Account.objects.filter(household_id=household_id)}
        categories_by_name = {c.name: c for c in AssetCategory.objects.filter(household_id=household_id)}
        members_by_name = {m.full_name: m for m in Member.objects.filter(household_id=household_id)}

        instruments_created = 0
        instruments_updated = 0
        tx_relinked = 0
        tx_missing = []

        with db_transaction.atomic():
            name_to_instrument = {}

            for row in data['instruments']:
                defaults = {
                    'instrument_type': row['instrument_type'],
                    'symbol': row.get('symbol', ''),
                    'metadata': row.get('metadata') or {},
                    'is_active': row.get('is_active', True),
                    'include_in_rebalancing': row.get('include_in_rebalancing', True),
                    'asset_category': categories_by_name.get(row.get('asset_category_name')),
                    'default_account': accounts_by_name.get(row.get('default_account_name')),
                }
                if 'sub_category' in row and hasattr(Instrument, 'sub_category'):
                    defaults['sub_category'] = row['sub_category']

                inst, created = Instrument.objects.update_or_create(
                    household_id=household_id, name=row['name'], defaults=defaults,
                )
                name_to_instrument[row['name']] = inst
                if created:
                    instruments_created += 1
                else:
                    instruments_updated += 1

                for o in row.get('ownerships', []):
                    member = members_by_name.get(o['member_name'])
                    if member:
                        InstrumentOwnership.objects.update_or_create(
                            instrument=inst, member=member,
                            defaults={'allocation_percent': _dec(o['allocation_percent'])},
                        )

                for fd in row.get('fd_details', []):
                    lookup = {'instrument': inst}
                    if fd.get('account_number'):
                        lookup['account_number'] = fd['account_number']
                    else:
                        lookup['investment_date'] = fd['investment_date']
                    funding_tx_id = fd.get('funding_transaction_id')
                    funding_tx = Transaction.objects.filter(id=funding_tx_id).first() if funding_tx_id else None
                    FDDetails.objects.update_or_create(
                        **lookup,
                        defaults={
                            'account_number': fd.get('account_number', ''),
                            'funding_transaction': funding_tx,
                            'principal': _dec(fd['principal']),
                            'annual_rate': _dec(fd['annual_rate']),
                            'investment_date': fd['investment_date'],
                            'maturity_date': fd['maturity_date'],
                            'compounding': fd['compounding'],
                            'maturity_value': _dec(fd.get('maturity_value')),
                        },
                    )

                for bond in row.get('bond_details', []):
                    bond_funding_tx_id = bond.get('funding_transaction_id')
                    bond_funding_tx = Transaction.objects.filter(id=bond_funding_tx_id).first() if bond_funding_tx_id else None
                    bond_obj, _ = BondDetails.objects.update_or_create(
                        instrument=inst, investment_date=bond['investment_date'],
                        defaults={
                            'issuer_name': bond.get('issuer_name', ''),
                            'bond_type': bond.get('bond_type', 'other'),
                            'isin': bond.get('isin', ''),
                            'funding_transaction': bond_funding_tx,
                            'face_value': _dec(bond['face_value']),
                            'quantity': bond.get('quantity', 1),
                            'coupon_rate': _dec(bond['coupon_rate']),
                            'coupon_frequency': bond.get('coupon_frequency', 'annual'),
                            'maturity_date': bond['maturity_date'],
                            'first_coupon_date': bond.get('first_coupon_date'),
                            'grace_days': bond.get('grace_days', 15),
                            'maturity_value': _dec(bond.get('maturity_value')),
                            'credit_rating': bond.get('credit_rating', ''),
                            'notes': bond.get('notes', ''),
                        },
                    )
                    for ack in bond.get('coupon_acks', []):
                        from instruments.models import BondCouponAck
                        BondCouponAck.objects.update_or_create(
                            bond=bond_obj, due_date=ack['due_date'],
                            defaults={'acknowledged_on': ack['acknowledged_on'], 'note': ack.get('note', '')},
                        )

                # MutualFundDetails now lives under Investment, not Instrument
                # (Milestone 2 of the Investment redesign — a household's MF/SIP
                # holdings share one "Mutual Fund" Instrument shell). This
                # export/import pair predates that model; skip re-creating
                # per-instrument MF details on reimport rather than crash.

                for sip in row.get('sip_mandates', []):
                    member = members_by_name.get(sip.get('member_name'))
                    account = accounts_by_name.get(sip.get('account_name'))
                    if not account:
                        continue
                    mandate, _ = SIPMandate.objects.update_or_create(
                        household_id=household_id, instrument=inst, account=account, start_date=sip['start_date'],
                        defaults={
                            'member': member,
                            'expected_amount': _dec(sip['expected_amount']),
                            'frequency': sip.get('frequency', 'monthly'),
                            'due_day': sip.get('due_day', 5),
                            'end_date': sip.get('end_date'),
                            'grace_days': sip.get('grace_days', 5),
                            'is_active': sip.get('is_active', True),
                        },
                    )
                    for ack in sip.get('payment_acks', []):
                        SIPPaymentAck.objects.update_or_create(
                            mandate=mandate, due_date=ack['due_date'],
                            defaults={'acknowledged_on': ack['acknowledged_on'], 'note': ack.get('note', '')},
                        )

                for rd in row.get('rd_mandates', []):
                    member = members_by_name.get(rd.get('member_name'))
                    account = accounts_by_name.get(rd.get('account_name'))
                    if not account:
                        continue
                    mandate, _ = RDMandate.objects.update_or_create(
                        household_id=household_id, instrument=inst, account=account, start_date=rd['start_date'],
                        defaults={
                            'member': member,
                            'installment_amount': _dec(rd['installment_amount']),
                            'frequency': rd.get('frequency', 'monthly'),
                            'due_day': rd.get('due_day', 5),
                            'tenure_months': rd['tenure_months'],
                            'end_date': rd.get('end_date'),
                            'grace_days': rd.get('grace_days', 5),
                            'is_active': rd.get('is_active', True),
                        },
                    )
                    for ack in rd.get('payment_acks', []):
                        RDPaymentAck.objects.update_or_create(
                            mandate=mandate, due_date=ack['due_date'],
                            defaults={'acknowledged_on': ack['acknowledged_on'], 'note': ack.get('note', '')},
                        )

            # Relink transactions by their stable, never-deleted transaction_id.
            for link in data.get('transaction_links', []):
                inst = name_to_instrument.get(link['instrument_name'])
                if not inst:
                    tx_missing.append(link['transaction_id'])
                    continue
                updated = Transaction.objects.filter(id=link['transaction_id']).update(instrument=inst)
                tx_relinked += updated
                if not updated:
                    tx_missing.append(link['transaction_id'])

        self.stdout.write(self.style.SUCCESS(
            f'Instruments: {instruments_created} created, {instruments_updated} updated.\n'
            f'Transactions relinked: {tx_relinked}.'
        ))
        if tx_missing:
            self.stdout.write(self.style.WARNING(
                f'{len(tx_missing)} transaction(s) could not be relinked (instrument missing from export or '
                f'transaction no longer exists): {tx_missing[:20]}{"..." if len(tx_missing) > 20 else ""}'
            ))
