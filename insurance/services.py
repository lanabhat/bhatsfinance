from __future__ import annotations

from datetime import date, timedelta


def _next_due_date(base: date, frequency: str, anchor_day: int | None, anchor_month: int | None) -> date:
    """Advance base by one period according to frequency."""
    if frequency == 'monthly':
        month = base.month + 1
        year = base.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        day = min(anchor_day or base.day, 28)
        return date(year, month, day)
    if frequency in ('quarterly', 'half_yearly'):
        months = 3 if frequency == 'quarterly' else 6
        month = base.month - 1 + months
        year = base.year + month // 12
        month = month % 12 + 1
        day = min(anchor_day or base.day, 28)
        return date(year, month, day)
    if frequency == 'annual':
        return date(base.year + 1, base.month, base.day)
    return base  # should not be reached for single/na


def _first_due_date(policy) -> date:
    """Return the first due date anchored to start_date with optional day/month overrides."""
    base = policy.start_date
    freq = policy.premium_frequency
    if freq == 'monthly':
        day = min(policy.premium_due_day or base.day, 28)
        return base.replace(day=day)
    if freq in ('quarterly', 'half_yearly', 'annual'):
        day = min(policy.premium_due_day or base.day, 28)
        month = policy.premium_due_month or base.month
        try:
            return date(base.year, month, day)
        except ValueError:
            return date(base.year, month, 28)
    return base


def generate_missed_premium_reminders(household_id: int, as_of: date) -> list[dict]:
    from insurance.models import InsurancePolicy, InsurancePremiumAck
    from ledger.models import Transaction

    missed: list[dict] = []

    policies = (
        InsurancePolicy.objects.filter(
            household_id=household_id,
            is_active=True,
            is_employer_paid=False,
        )
        .exclude(premium_frequency__in=('single', 'na'))
        .select_related('member')
    )

    acked = set(
        InsurancePremiumAck.objects.filter(policy__household_id=household_id)
        .values_list('policy_id', 'due_date')
    )

    for policy in policies:
        current = _first_due_date(policy)
        effective_end = policy.end_date or policy.maturity_date or as_of
        if effective_end > as_of:
            effective_end = as_of

        while current <= effective_end:
            grace_end = current + timedelta(days=policy.grace_days)

            tx_exists = Transaction.objects.filter(
                household_id=household_id,
                transaction_type='premium',
                tx_date__gte=current,
                tx_date__lte=grace_end,
                metadata__insurance_policy_id=policy.id,
            ).exists()

            ack_exists = (policy.id, current) in acked

            if not tx_exists and not ack_exists and current <= as_of:
                missed.append({
                    'policy_id': policy.id,
                    'policy_name': policy.policy_name,
                    'policy_number': policy.policy_number,
                    'insurer_name': policy.insurer_name,
                    'member_name': policy.member.full_name if policy.member else None,
                    'due_date': current.isoformat(),
                    'grace_end': grace_end.isoformat(),
                    'premium_amount': str(policy.premium_amount) if policy.premium_amount else '0',
                })

            current = _next_due_date(current, policy.premium_frequency, policy.premium_due_day, policy.premium_due_month)

    return missed
