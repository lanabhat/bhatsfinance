/**
 * Drill-through links into Investments / Accounts with filters applied.
 *
 * Format: `#/holdings?type=FD&owner=Anushree%20L&open=inv:12` — a key may repeat for several
 * values. Values are the same display labels the page's filter accessors produce (type label,
 * category name, member label, NONE for "no value"), so they match the FilterBar exactly.
 * `open` selects one row and opens its DetailDrawer.
 */
import type { FilterState } from '../hooks/useFilters'

export type HoldingsFilterKey = 'type' | 'category' | 'owner' | 'fund_category' | 'sub_category' | 'valuation'
export type AccountsFilterKey = 'type' | 'owner' | 'institution' | 'status'

function build(route: string, filters: Partial<Record<string, string[]>>, open?: string | number): string {
  const q = new URLSearchParams()
  for (const [key, values] of Object.entries(filters)) for (const v of values ?? []) q.append(key, v)
  if (open !== undefined) q.set('open', String(open))
  const qs = q.toString()
  return `#/${route}${qs ? `?${qs}` : ''}`
}

export function holdingsLink(filters: Partial<Record<HoldingsFilterKey, string[]>> = {}, open?: string): string {
  return build('holdings', filters, open)
}

export function accountsLink(filters: Partial<Record<AccountsFilterKey, string[]>> = {}, open?: number): string {
  return build('accounts', filters, open)
}

/** Parse the current hash query. Null when there's no query; unknown keys are ignored. */
export function readDeepLink(validKeys: string[], hash = window.location.hash): { filters: FilterState; open: string | null } | null {
  const query = hash.split('?')[1]
  if (!query) return null
  const params = new URLSearchParams(query)
  const filters: FilterState = {}
  for (const key of validKeys) {
    const values = params.getAll(key).filter(Boolean)
    if (values.length) filters[key] = values
  }
  return { filters, open: params.get('open') }
}

/** Drop the query from the address bar (so a reload doesn't re-apply the link). */
export function clearDeepLink(route: string) {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/${route}`)
}
