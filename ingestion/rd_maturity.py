"""
Standard Indian-bank RD maturity value projection.

Each monthly installment earns compound interest from the month it's
deposited until the RD matures. This mirrors the formula banks use for
quarterly-compounded RDs (the overwhelmingly common case) and offers a
simpler monthly-compounding variant for banks that state monthly compounding.
"""
from decimal import ROUND_HALF_UP, Decimal


def compute_rd_maturity(installment_amount: Decimal, annual_rate: Decimal, tenure_months: int, compounding: str = 'quarterly') -> Decimal:
    installment_amount = Decimal(str(installment_amount))
    annual_rate = Decimal(str(annual_rate))
    total = Decimal('0')

    if compounding == 'monthly':
        monthly_rate = annual_rate / Decimal('1200')
        for installment_index in range(tenure_months):
            months_invested = tenure_months - installment_index
            total += installment_amount * (1 + monthly_rate) ** months_invested
    else:
        # Quarterly compounding: each installment accrues interest for the
        # number of quarters remaining until maturity (partial final quarter
        # counted as a full quarter, matching standard bank RD calculators).
        quarterly_rate = annual_rate / Decimal('400')
        for installment_index in range(tenure_months):
            months_invested = tenure_months - installment_index
            quarters_invested = -(-months_invested // 3)  # ceiling division
            total += installment_amount * (1 + quarterly_rate) ** quarters_invested

    return total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
