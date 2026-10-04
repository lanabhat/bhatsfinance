"""Daily valuation of listed equities (NSE close) and ISIN-based NAV links for demat funds.

write_equity_snapshots() values each stock/ETF holding at units x the latest NSE
closing price, the equity counterpart of navs.write_nav_snapshots().
link_funds_by_isin() links mutual funds that carry an ISIN (e.g. held in demat) to
their mfapi.in scheme — an exact identity, so unlike name-based suggestions
(fund_data/matching.py) it needs no confirmation.
"""
from __future__ import annotations

from datetime import date

from fund_data.mfapi_client import fetch_schemes_by_isin
from fund_data.models import ExternalFund
from fund_data.navs import UNITS_MISMATCH_TOLERANCE, ledger_units_as_of
from fund_data.nse_client import fetch_close_prices


def link_funds_by_isin(household_id: int | None = None) -> dict:
    from instruments.models import Instrument, Investment
    from instruments.services import holding_isin

    unlinked = Investment.objects.filter(
        instrument__instrument_type__in=[Instrument.InstrumentType.MUTUAL_FUND, Instrument.InstrumentType.SIP],
        instrument__is_active=True, external_fund__isnull=True,
    )
    if household_id is not None:
        unlinked = unlinked.filter(instrument__household_id=household_id)
    candidates = [(inv, holding_isin(inv)) for inv in unlinked]
    candidates = [(inv, isin) for inv, isin in candidates if isin.startswith('INF')]
    if not candidates:
        return {'linked': []}

    by_isin = fetch_schemes_by_isin()
    linked = []
    for inv, isin in candidates:
        scheme = by_isin.get(isin)
        if scheme:
            ExternalFund.objects.create(
                investment=inv, mfapi_scheme_code=scheme['scheme_code'], scheme_name=scheme['scheme_name'][:255],
            )
            linked.append(inv.name)
    return {'linked': linked}


def _equity_holdings(household_id: int | None):
    """(household_id, instrument, investment-or-None, name, isin) for every active equity holding:
    Investments under equity shells, plus standalone equity Instruments with no Investments."""
    from instruments.models import Instrument, Investment
    from instruments.services import holding_isin

    instruments = Instrument.objects.filter(instrument_type=Instrument.InstrumentType.EQUITY, is_active=True)
    if household_id is not None:
        instruments = instruments.filter(household_id=household_id)
    for instrument in instruments.prefetch_related('investments'):
        investments = [inv for inv in instrument.investments.all() if inv.is_active]
        if not investments and not Investment.objects.filter(instrument=instrument).exists():
            yield instrument.household_id, instrument, None, instrument.name, holding_isin(instrument)
        for inv in investments:
            yield instrument.household_id, instrument, inv, inv.name, holding_isin(inv)


def _units_out_of_date(instrument, investment) -> bool:
    """True when the user's latest uploaded valuation implies a different unit count
    (value / price) than the ledger held then — e.g. a bonus or split, or buys
    since the import that weren't recorded — so units x close would be wrong."""
    from valuations.models import ValuationSnapshot

    reference = (
        ValuationSnapshot.objects
        .filter(instrument=instrument, investment=investment, market_value__gt=0, unit_price__gt=0)
        .exclude(source=ValuationSnapshot.SourceType.API)
        .order_by('-valuation_date', '-id')
        .first()
    )
    if reference is None:
        return False
    units_then = ledger_units_as_of(reference.valuation_date, investment=investment, instrument=instrument)
    if not units_then:
        return False
    implied = reference.market_value / reference.unit_price
    return abs(float(units_then / implied) - 1) > UNITS_MISMATCH_TOLERANCE


def write_equity_snapshots(household_id: int | None = None, as_of: date | None = None) -> dict:
    """Value every listed equity holding at the latest NSE close on or before as_of.

    The snapshot is dated on the trading day. A user-entered value for that date
    is left alone (see _upsert_auto_snapshot). Skipped, keeping their existing
    value: holdings priced from NAV (linked funds), with no units, with units that
    don't match their latest uploaded value, or with no NSE price (no ISIN, unlisted).
    """
    from insights.services import compute_holdings
    from valuations.models import ValuationSnapshot
    from valuations.services import _upsert_auto_snapshot

    as_of = as_of or date.today()
    bhavcopy = fetch_close_prices(as_of)
    prices = bhavcopy['prices']

    units_by_household: dict[int, dict] = {}
    written = skipped_no_units = 0
    units_out_of_date: list[str] = []
    not_priced: list[str] = []
    for hh, instrument, investment, name, isin in _equity_holdings(household_id):
        if investment is not None and ExternalFund.objects.filter(investment=investment).exists():
            continue
        price = prices.get(isin) if isin else None
        if price is None:
            not_priced.append(name)
            continue
        if hh not in units_by_household:
            units_by_household[hh] = {
                (h['instrument_id'], h['investment_id']): h['quantity'] for h in compute_holdings(hh, as_of)
            }
        units = units_by_household[hh].get((instrument.id, investment.id if investment else None))
        if not units:
            skipped_no_units += 1
            continue
        if _units_out_of_date(instrument, investment):
            units_out_of_date.append(name)
            continue
        if _upsert_auto_snapshot(
            {'household_id': hh, 'instrument': instrument, 'investment': investment, 'valuation_date': price['date']},
            {'unit_price': price['close'], 'market_value': None, 'source': ValuationSnapshot.SourceType.API,
             'notes': f"NSE close ({price['symbol']})"},
        ):
            written += 1
    return {
        'price_date': bhavcopy['date'],
        'written': written,
        'skipped_no_units': skipped_no_units,
        'units_out_of_date': units_out_of_date,
        'not_priced': not_priced,
    }
