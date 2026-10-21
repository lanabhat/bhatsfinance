/**
 * The one category → colour mapping, shared by every chart, legend and swatch.
 *
 * Eight validated categorical slots (CSS vars --series-1…8, see index.css) plus a grey
 * "other". Colour follows the entity, never its rank: an asset type or spend category
 * gets the same slot on every page and keeps it when filters change. There is no
 * ninth hue — anything beyond the families below folds into "other".
 *
 * User-defined asset categories carry their own colour from the database (AssetCategory.color);
 * use that as-is, it is equally stable across pages.
 */

export type SeriesSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 'other'

export const seriesVar = (slot: SeriesSlot): string =>
  slot === 'other' ? 'var(--series-other)' : `var(--series-${slot})`

/** Asset families — 18 instrument types fold into 8 slots. */
export const ASSET_FAMILIES: { key: string; label: string; slot: SeriesSlot; types: string[] }[] = [
  { key: 'mutual_funds', label: 'Mutual funds', slot: 1, types: ['mutual_fund', 'sip'] },
  { key: 'equity', label: 'Stocks & ETFs', slot: 2, types: ['equity', 'etf'] },
  { key: 'cash', label: 'Cash & savings', slot: 3, types: ['cash', 'savings'] },
  { key: 'gold', label: 'Gold', slot: 4, types: ['gold'] },
  { key: 'physical', label: 'Property & vehicles', slot: 5, types: ['real_estate', 'vehicle'] },
  { key: 'retirement', label: 'Retirement & insurance', slot: 6, types: ['epf', 'ppf', 'nps', 'insurance'] },
  { key: 'fixed_income', label: 'Fixed income', slot: 7, types: ['fd', 'rd', 'bond', 'lending'] },
  { key: 'liabilities', label: 'Liabilities', slot: 8, types: ['liability', 'liability_cc'] },
]

const SLOT_BY_TYPE: Record<string, SeriesSlot> = Object.fromEntries(
  ASSET_FAMILIES.flatMap((f) => f.types.map((t) => [t, f.slot])),
)

export function assetTypeSlot(instrumentType: string): SeriesSlot {
  return SLOT_BY_TYPE[instrumentType] ?? 'other'
}

/** CSS colour (a var()) for an instrument type. */
export function assetTypeColor(instrumentType: string): string {
  return seriesVar(assetTypeSlot(instrumentType))
}

/** Built-in spend categories (expenses.models.BUILTIN_CATEGORIES). Rent and EMI share
 *  the housing slot; custom categories and "other" are grey. */
const SPEND_SLOT: Record<string, SeriesSlot> = {
  food: 1, transport: 2, shopping: 3, utilities: 4, health: 5,
  entertainment: 6, education: 7, rent: 8, emi: 8,
}

export function spendCategoryColor(key: string): string {
  return seriesVar(SPEND_SLOT[key] ?? 'other')
}

/** Resolve a CSS var() to a concrete colour — for SVG libraries that can't take var(). */
export function resolveCssColor(color: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(color)
  if (!m || typeof window === 'undefined') return color
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || color
}

/** Money flows (transaction classification) — fixed slots, used by Trends and Cash flow. */
export const FLOW_COLOR: Record<string, string> = {
  internal_transfer: seriesVar(1),
  spend: seriesVar(2),
  income: seriesVar(3),
  tracking: seriesVar(7),
}

/** Cash-flow buckets (compute_cashflow). */
export const CASHFLOW_COLOR: Record<'income' | 'expense' | 'investment' | 'savings', string> = {
  investment: seriesVar(1),
  expense: seriesVar(2),
  income: seriesVar(3),
  savings: seriesVar(4),
}

export const CASHFLOW_SERIES: { key: 'income' | 'expense' | 'investment' | 'savings'; label: string }[] = [
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expense' },
  { key: 'investment', label: 'Investment' },
  { key: 'savings', label: 'Savings' },
]
