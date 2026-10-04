import type { InstrumentOption, Investment } from '../../types/domain'

/** True for a stock/ETF holding — an Investment under an equity Instrument (the
 *  household's "Equity" shell) rather than under the "Mutual Fund" shell. */
export function isEquityInvestment(investment: Pick<Investment, 'instrument'>, instruments: InstrumentOption[]): boolean {
  return instruments.find((i) => i.id === investment.instrument)?.instrument_type === 'equity'
}

export function investmentEditTitle(investment: Pick<Investment, 'instrument'>, instruments: InstrumentOption[]): string {
  return isEquityInvestment(investment, instruments) ? 'Edit Stock' : 'Edit Fund'
}
