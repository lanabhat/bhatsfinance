/**
 * Shared instrument-type color palette, grouped into families so related
 * asset types read as shades of the same hue instead of unrelated colors.
 * Used by MemberWealthBreakdown, AllocationDonutChart, CategoryBreakdownCard
 * fallbacks so the same instrument type always renders the same color.
 */
export const TYPE_COLOR: Record<string, string> = {
  // Liquid / cash-like — green family
  cash: '#16a34a',
  savings: '#22c55e',
  rd: '#4ade80',

  // Growth / market-linked — blue family
  equity: '#0ea5e9',
  mutual_fund: '#2563eb',
  sip: '#60a5fa',

  // Protected / retirement — purple family
  epf: '#7c3aed',
  ppf: '#9333ea',
  nps: '#a78bfa',
  insurance: '#c4b5fd',

  // Fixed income — amber/teal
  fd: '#f59e0b',
  lending: '#0d9488',

  // Physical / alternative — gold/pink/lime family
  gold: '#eab308',
  real_estate: '#ec4899',
  vehicle: '#84cc16',

  // Liabilities — red family
  liability: '#ef4444',
  liability_cc: '#dc2626',

  other: '#94a3b8',
}

export function typeColor(instrumentType: string): string {
  return TYPE_COLOR[instrumentType] ?? TYPE_COLOR.other
}
