import type { InstrumentOption, Investment } from '../../types/domain'

function shellType(investment: Pick<Investment, 'instrument'>, instruments: InstrumentOption[]) {
  return instruments.find((i) => i.id === investment.instrument)?.instrument_type
}

/** True for a stock or ETF holding — an Investment under the household's "Equity"
 *  or "ETF" shell (exchange-traded, with a market cap) rather than the "Mutual Fund" shell. */
export function isEquityInvestment(investment: Pick<Investment, 'instrument'>, instruments: InstrumentOption[]): boolean {
  const type = shellType(investment, instruments)
  return type === 'equity' || type === 'etf'
}

export function isEtfInvestment(investment: Pick<Investment, 'instrument'>, instruments: InstrumentOption[]): boolean {
  return shellType(investment, instruments) === 'etf'
}

export function investmentEditTitle(investment: Pick<Investment, 'instrument'>, instruments: InstrumentOption[]): string {
  if (isEtfInvestment(investment, instruments)) return 'Edit ETF'
  return isEquityInvestment(investment, instruments) ? 'Edit Stock' : 'Edit Fund'
}
