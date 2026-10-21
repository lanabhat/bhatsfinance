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
  if (abs < 1000) return `${sign}₹${Math.round(abs)}`
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

/** Format an ISO date (YYYY-MM-DD) as "15 Mar 2027". */
export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Days from today until an ISO maturity date (negative if already past). */
export function daysUntil(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(iso + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

/** "Matures today" / "12 days left" / "~4 months left" / "Matured 15 Mar 2027". */
export function formatMaturity(iso: string): string {
  const days = daysUntil(iso)
  if (days < 0) return `Matured ${fmtDate(iso)}`
  if (days === 0) return 'Matures today'
  if (days === 1) return '1 day left'
  if (days < 30) return `${days} days left`
  const months = Math.round(days / 30)
  return months === 1 ? '~1 month left' : `~${months} months left`
}

// ── Shared display formats (use through <Amount>/<Delta>/<DateText>, not inline) ──

const INR_WHOLE = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const NUM_IN = new Intl.NumberFormat('en-IN')

const toNum = (value: number | string | null | undefined): number =>
  typeof value === 'string' ? parseFloat(value) : (value ?? NaN)

/** ₹12,34,567 — whole rupees, Indian grouping. */
export function fmtINRWhole(value: number | string | null | undefined): string {
  const n = toNum(value)
  if (!isFinite(n)) return '—'
  return INR_WHOLE.format(Math.round(n))
}

/** 12,34,567 — plain count with Indian grouping. */
export function fmtCount(value: number): string {
  return NUM_IN.format(value)
}

/** Compact for chart axes: ₹0, ₹50K, ₹12L, ₹1.2Cr (no spaces, short). */
export function fmtINRAxis(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`
  return `${sign}₹${Math.round(abs)}`
}

function trim(n: number): string {
  return n >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '')
}

/** 12.3% — one decimal; null/NaN → '—'. */
export function fmtPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

const parseIso = (iso: string): Date => new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)

/** "18 Oct" (current year) or "18 Oct 2025". */
export function fmtDateShort(iso: string): string {
  const d = parseIso(iso)
  if (isNaN(d.getTime())) return iso
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** "Oct 2026" from YYYY-MM or YYYY-MM-DD. */
export function fmtMonth(isoOrMonth: string): string {
  const d = parseIso(isoOrMonth.length === 7 ? `${isoOrMonth}-01` : isoOrMonth)
  if (isNaN(d.getTime())) return isoOrMonth
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

/** "Oct '26" — compact month for chart axes. */
export function fmtMonthAxis(isoOrMonth: string): string {
  const d = parseIso(isoOrMonth.length === 7 ? `${isoOrMonth}-01` : isoOrMonth)
  if (isNaN(d.getTime())) return isoOrMonth
  return `${d.toLocaleDateString('en-IN', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`
}

export type AmountFormat = 'full' | 'compact' | 'precise'

/** The string used wherever a masked number must be text (chart axes, tooltips). */
export const MASKED_TEXT = '••••••'

export function formatAmount(n: number, format: AmountFormat): string {
  if (format === 'compact') return fmtINRCompact(n)
  if (format === 'precise') return fmtINR(n)
  return fmtINRWhole(n)
}

/** "6.75%" from an API decimal string like "6.7500". */
export function fmtRate(rate: string | number): string {
  const n = typeof rate === 'string' ? parseFloat(rate) : rate
  return isFinite(n) ? `${Number(n.toFixed(2))}%` : '—'
}

/** "Tue, 21 Oct 2026" — date group headers. */
export function fmtDateWeekday(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
