from __future__ import annotations

from datetime import date, timedelta

from ledger.models import Transaction


def _increment_date(base: date, frequency: str) -> date:
    if frequency == 'quarterly':
        months = 3
    else:
        months = 1

    month = base.month - 1 + months
    year = base.year + month // 12
    month = month % 12 + 1
    day = min(base.day, 28)
    return date(year, month, day)


def generate_missed_sip_alerts(household_id: int, as_of: date) -> list[dict]:
    from alerts.models import SIPMandate, SIPPaymentAck

    missed: list[dict] = []
    mandates = SIPMandate.objects.filter(household_id=household_id, is_active=True).select_related('instrument', 'account')

    # Preload acknowledgements for all mandates in this household — avoids N queries.
    acked = set(
        SIPPaymentAck.objects.filter(mandate__household_id=household_id).values_list('mandate_id', 'due_date')
    )

    for mandate in mandates:
        current = mandate.start_date
        end_date = mandate.effective_end_date(as_of)

        while current <= end_date:
            due = current.replace(day=min(mandate.due_day, 28))
            grace_end = due + timedelta(days=mandate.grace_days)
            tx_exists = Transaction.objects.filter(
                household_id=household_id,
                account=mandate.account,
                instrument=mandate.instrument,
                tx_date__gte=due,
                tx_date__lte=grace_end,
            ).exists()
            ack_exists = (mandate.id, due) in acked
            if not tx_exists and not ack_exists and due <= as_of:
                missed.append(
                    {
                        'mandate_id': mandate.id,
                        'instrument': mandate.instrument.name,
                        'instrument_id': mandate.instrument_id,
                        'account': mandate.account.name,
                        'account_id': mandate.account_id,
                        'due_date': due.isoformat(),
                        'expected_amount': str(mandate.expected_amount),
                        'grace_end': grace_end.isoformat(),
                    }
                )
            current = _increment_date(current, mandate.frequency)

    return missed


def generate_coupon_reminders(household_id: int, as_of: date) -> list[dict]:
    from instruments.models import BondCouponAck, BondDetails
    from instruments.services import coupon_amount, first_coupon_due_date, next_coupon_due_date

    reminders: list[dict] = []

    bonds = (
        BondDetails.objects
        .filter(
            instrument__household_id=household_id,
            instrument__is_active=True,
        )
        .exclude(coupon_frequency='cumulative')
        .select_related('instrument')
    )

    acked = set(
        BondCouponAck.objects.filter(bond__instrument__household_id=household_id)
        .values_list('bond_id', 'due_date')
    )

    for bond in bonds:
        current = first_coupon_due_date(bond)
        effective_end = min(bond.maturity_date, as_of)

        while current <= effective_end:
            grace_end = current + timedelta(days=bond.grace_days)

            tx_exists = Transaction.objects.filter(
                household_id=household_id,
                instrument=bond.instrument,
                tx_date__gte=current,
                tx_date__lte=grace_end,
                metadata__bond_details_id=bond.id,
            ).exists()

            ack_exists = (bond.id, current) in acked

            if not tx_exists and not ack_exists and current <= as_of:
                reminders.append({
                    'bond_id': bond.id,
                    'instrument_id': bond.instrument_id,
                    'instrument_name': bond.instrument.name,
                    'issuer_name': bond.issuer_name,
                    'due_date': current.isoformat(),
                    'grace_end': grace_end.isoformat(),
                    'coupon_amount': str(coupon_amount(bond)),
                })

            current = next_coupon_due_date(current, bond.coupon_frequency)

    return reminders


def generate_missed_rd_installments(household_id: int, as_of: date) -> list[dict]:
    from alerts.models import RDMandate, RDPaymentAck

    missed: list[dict] = []
    mandates = RDMandate.objects.filter(household_id=household_id, is_active=True).select_related('instrument', 'account')

    acked = set(
        RDPaymentAck.objects.filter(mandate__household_id=household_id).values_list('mandate_id', 'due_date')
    )

    for mandate in mandates:
        current = mandate.start_date
        end_date = mandate.effective_end_date(as_of)

        while current <= end_date:
            due = current.replace(day=min(mandate.due_day, 28))
            grace_end = due + timedelta(days=mandate.grace_days)
            tx_exists = Transaction.objects.filter(
                household_id=household_id,
                account=mandate.account,
                instrument=mandate.instrument,
                tx_date__gte=due,
                tx_date__lte=grace_end,
            ).exists()
            ack_exists = (mandate.id, due) in acked
            if not tx_exists and not ack_exists and due <= as_of:
                missed.append(
                    {
                        'mandate_id': mandate.id,
                        'instrument': mandate.instrument.name,
                        'instrument_id': mandate.instrument_id,
                        'account': mandate.account.name,
                        'account_id': mandate.account_id,
                        'due_date': due.isoformat(),
                        'expected_amount': str(mandate.installment_amount),
                        'grace_end': grace_end.isoformat(),
                    }
                )
            current = _increment_date(current, mandate.frequency)

    return missed
