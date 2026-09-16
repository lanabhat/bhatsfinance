"""
Exports every Instrument and everything that hangs off it (FDDetails,
BondDetails + coupon acks, MutualFundDetails, InstrumentOwnership,
SIPMandate/RDMandate + payment acks) to a single JSON file, plus a flat CSV
for quick eyeballing — so instruments can be safely deleted (see
delete_instruments) and reimported later against a redesigned schema.

Explicitly NOT exported (regenerates on its own, not something you'd
hand-reenter): ValuationSnapshot history, fund_data.ExternalFund/NAV cache,
ai_insights cached classifications/comparisons.

Also exported: each Transaction's (id, idempotency_key, tx_date, amount,
instrument name) so a reimport script can relink Transaction.instrument
(which is SET_NULL, not deleted, when its instrument is removed) back to
the newly recreated instrument. Transactions themselves are never touched
by this command — read-only.

Usage:
  python manage.py export_instruments --household-id 1 --out backup/instruments_2026-09-08
  (writes backup/instruments_2026-09-08.json and .csv)
"""
import csv
import json
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError


def _jsonable(value):
    if isinstance(value, Decimal):
        return str(value)
    return value


def _model_to_dict(instance, fields):
    return {f: _jsonable(getattr(instance, f)) for f in fields}


class Command(BaseCommand):
    help = 'Export all Instruments (and FD/Bond/MF details, ownerships, SIP/RD mandates) to JSON + CSV.'

    def add_arguments(self, parser):
        parser.add_argument('--household-id', type=int, required=True, help='Household to export.')
        parser.add_argument('--out', type=str, required=True, help='Output file path without extension (writes .json and .csv).')

    def handle(self, *args, **options):
        from instruments.models import (
            Account, AssetCategory, BondDetails, FDDetails, Instrument,
            InstrumentOwnership,
        )
        from alerts.models import RDMandate, RDPaymentAck, SIPMandate, SIPPaymentAck
        from ledger.models import Transaction

        household_id = options['household_id']
        out_path = Path(options['out'])
        out_path.parent.mkdir(parents=True, exist_ok=True)

        instruments = list(Instrument.objects.filter(household_id=household_id).order_by('id'))
        if not instruments:
            raise CommandError(f'No instruments found for household_id={household_id}.')
        instrument_ids = [i.id for i in instruments]

        accounts_by_id = {a.id: a.name for a in Account.objects.filter(household_id=household_id)}
        categories_by_id = {c.id: c.name for c in AssetCategory.objects.filter(household_id=household_id)}
        from core.models import Member
        members_by_id = {m.id: m.full_name for m in Member.objects.filter(household_id=household_id)}

        instrument_fields = [
            'id', 'name', 'instrument_type', 'symbol', 'metadata',
            'is_active', 'include_in_rebalancing',
        ]
        # sub_category may not exist yet on main (added in the uncommitted
        # redesign branch) — include it defensively if present.
        if hasattr(Instrument, 'sub_category'):
            instrument_fields.append('sub_category')

        data = {'household_id': household_id, 'instruments': []}

        for inst in instruments:
            row = _model_to_dict(inst, instrument_fields)
            row['asset_category_name'] = categories_by_id.get(inst.asset_category_id)
            row['default_account_name'] = accounts_by_id.get(inst.default_account_id)

            row['ownerships'] = [
                {'member_name': members_by_id.get(o.member_id), 'allocation_percent': str(o.allocation_percent)}
                for o in InstrumentOwnership.objects.filter(instrument=inst)
            ]

            fd_rows = []
            for fd in FDDetails.objects.filter(instrument=inst):
                fd_row = {
                    'id': fd.id,
                    'account_number': getattr(fd, 'account_number', ''),
                    'principal': str(fd.principal),
                    'annual_rate': str(fd.annual_rate),
                    'investment_date': str(fd.investment_date),
                    'maturity_date': str(fd.maturity_date),
                    'compounding': fd.compounding,
                    'maturity_value': str(fd.maturity_value) if fd.maturity_value is not None else None,
                }
                funding_tx_id = getattr(fd, 'funding_transaction_id', None)
                if funding_tx_id:
                    fd_row['funding_transaction_id'] = funding_tx_id
                fd_rows.append(fd_row)
            row['fd_details'] = fd_rows

            bond_rows = []
            for bond in BondDetails.objects.filter(instrument=inst):
                bond_row = {
                    'id': bond.id,
                    'issuer_name': bond.issuer_name,
                    'bond_type': bond.bond_type,
                    'isin': bond.isin,
                    'face_value': str(bond.face_value),
                    'quantity': bond.quantity,
                    'coupon_rate': str(bond.coupon_rate),
                    'coupon_frequency': bond.coupon_frequency,
                    'investment_date': str(bond.investment_date),
                    'maturity_date': str(bond.maturity_date),
                    'first_coupon_date': str(bond.first_coupon_date) if bond.first_coupon_date else None,
                    'grace_days': bond.grace_days,
                    'maturity_value': str(bond.maturity_value) if bond.maturity_value is not None else None,
                    'credit_rating': bond.credit_rating,
                    'notes': bond.notes,
                    'coupon_acks': [
                        {'due_date': str(a.due_date), 'acknowledged_on': str(a.acknowledged_on), 'note': a.note}
                        for a in bond.coupon_acks.all()
                    ],
                }
                funding_tx_id = getattr(bond, 'funding_transaction_id', None)
                if funding_tx_id:
                    bond_row['funding_transaction_id'] = funding_tx_id
                bond_rows.append(bond_row)
            row['bond_details'] = bond_rows

            # MutualFundDetails now lives under Investment, not Instrument
            # (Milestone 2 of the Investment redesign — a household's MF/SIP
            # holdings share one "Mutual Fund" Instrument shell). This
            # export predates that model; kept here only so it doesn't
            # crash on instrument-level exports of other types.
            row['mutual_fund_details'] = None

            sip_rows = []
            for m in SIPMandate.objects.filter(instrument=inst):
                sip_rows.append({
                    'member_name': members_by_id.get(m.member_id),
                    'account_name': accounts_by_id.get(m.account_id),
                    'expected_amount': str(m.expected_amount),
                    'frequency': m.frequency,
                    'due_day': m.due_day,
                    'start_date': str(m.start_date),
                    'end_date': str(m.end_date) if m.end_date else None,
                    'grace_days': m.grace_days,
                    'is_active': m.is_active,
                    'payment_acks': [
                        {'due_date': str(a.due_date), 'acknowledged_on': str(a.acknowledged_on), 'note': a.note}
                        for a in SIPPaymentAck.objects.filter(mandate=m)
                    ],
                })
            row['sip_mandates'] = sip_rows

            rd_rows = []
            for m in RDMandate.objects.filter(instrument=inst):
                rd_rows.append({
                    'member_name': members_by_id.get(m.member_id),
                    'account_name': accounts_by_id.get(m.account_id),
                    'installment_amount': str(m.installment_amount),
                    'frequency': m.frequency,
                    'due_day': m.due_day,
                    'start_date': str(m.start_date),
                    'tenure_months': m.tenure_months,
                    'end_date': str(m.end_date) if m.end_date else None,
                    'grace_days': m.grace_days,
                    'is_active': m.is_active,
                    'payment_acks': [
                        {'due_date': str(a.due_date), 'acknowledged_on': str(a.acknowledged_on), 'note': a.note}
                        for a in RDPaymentAck.objects.filter(mandate=m)
                    ],
                })
            row['rd_mandates'] = rd_rows

            data['instruments'].append(row)

        # Transaction links: id + idempotency_key + enough context to relink
        # after reimport, without touching the Transaction rows themselves.
        tx_links = []
        for tx in Transaction.objects.filter(instrument_id__in=instrument_ids).order_by('tx_date', 'id'):
            tx_links.append({
                'transaction_id': tx.id,
                'idempotency_key': tx.idempotency_key,
                'tx_date': str(tx.tx_date),
                'amount': str(tx.amount),
                'transaction_type': tx.transaction_type,
                'instrument_name': tx.instrument.name,
            })
        data['transaction_links'] = tx_links

        json_path = out_path.with_suffix('.json')
        json_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')

        csv_path = out_path.with_suffix('.csv')
        with csv_path.open('w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'instrument_id', 'name', 'instrument_type', 'sub_category', 'symbol',
                'category', 'default_account', 'fd_count', 'bond_count', 'has_mf_details',
                'sip_mandate_count', 'rd_mandate_count', 'is_active',
            ])
            for row in data['instruments']:
                writer.writerow([
                    row['id'], row['name'], row['instrument_type'], row.get('sub_category', ''), row['symbol'],
                    row['asset_category_name'] or '', row['default_account_name'] or '',
                    len(row['fd_details']), len(row['bond_details']), bool(row['mutual_fund_details']),
                    len(row['sip_mandates']), len(row['rd_mandates']), row['is_active'],
                ])

        self.stdout.write(self.style.SUCCESS(
            f'Exported {len(instruments)} instruments ({len(tx_links)} linked transactions) to:\n'
            f'  {json_path}\n  {csv_path}'
        ))
