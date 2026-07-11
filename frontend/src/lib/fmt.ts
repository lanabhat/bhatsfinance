const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

/** Format a number as ₹1,23,456.78 */
export function fmtINR(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!isFinite(n)) return '—'
  return INR.format(n)
}

/** Format a number in compact Indian units: ₹8.3 L, ₹1.2 Cr, ₹45.0 K. Below ₹1,000, falls back to fmtINR. */
export function fmtINRCompact(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs < 1000) return fmtINR(n)
  if (abs < 1e5) return `${sign}₹${(abs / 1e3).toFixed(1)} K`
  if (abs < 1e7) return `${sign}₹${(abs / 1e5).toFixed(1)} L`
  return `${sign}₹${(abs / 1e7).toFixed(1)} Cr`
}

/**
 * Gain/loss for a holding. Cash never appreciates/depreciates — any
 * market_value/net_invested mismatch there is a rounding or timing artifact,
 * not real gain, so cash holdings always report flat (gain 0, gainPct null).
 */
export function computeGain(marketValue: number, netInvested: number, instrumentType?: string): { gain: number; gainPct: number | null } {
  if (instrumentType === 'cash') return { gain: 0, gainPct: null }
  const gain = marketValue - netInvested
  const gainPct = netInvested > 0 ? (gain / netInvested) * 100 : null
  return { gain, gainPct }
}
