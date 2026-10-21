import { fmtDateShort } from '../../lib/fmt'

/** The one control look: same height as buttons (--control-h), 14px text, one focus ring. */
export const controlClass =
  'h-[var(--control-h)] w-full min-w-0 rounded-[var(--radius-md)] border border-line-strong bg-surface px-3 text-sm text-ink ' +
  'placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50'

export type DateRange = { from: string; to: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const DATE_PRESETS: { key: string; label: string; range: () => DateRange }[] = [
  { key: 'this_month', label: 'This month', range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: '' } } },
  { key: 'last_month', label: 'Last month', range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) } } },
  { key: '3m', label: 'Last 3 months', range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth() - 3, n.getDate())), to: '' } } },
  { key: '1y', label: 'Last 12 months', range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear() - 1, n.getMonth(), n.getDate())), to: '' } } },
  { key: 'fy', label: 'This financial year', range: () => { const n = new Date(); const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1; return { from: `${y}-04-01`, to: '' } } },
]

export function describeDateRange({ from, to }: DateRange): string {
  if (!from && !to) return 'Any date'
  if (from && !to) return `From ${fmtDateShort(from)}`
  if (!from && to) return `Until ${fmtDateShort(to)}`
  return `${fmtDateShort(from)} – ${fmtDateShort(to)}`
}

export type AmountRange = { min: string; max: string }

export function describeAmountRange({ min, max }: AmountRange): string {
  const f = (v: string) => `₹${Number(v).toLocaleString('en-IN')}`
  if (min && max) return `${f(min)} – ${f(max)}`
  if (min) return `≥ ${f(min)}`
  if (max) return `≤ ${f(max)}`
  return 'Any amount'
}

