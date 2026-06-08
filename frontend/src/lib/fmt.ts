const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

/** Format a number as ₹1,23,456.78 */
export function fmtINR(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!isFinite(n)) return '—'
  return INR.format(n)
}
