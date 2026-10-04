import { deleteJson, getJson, postJson, toQueryString } from './http'
import type { FundComparisonPayload, FundMatchSuggestion, FundRefreshResult, MarketPriceRefreshResult, MfApiSearchResult } from '../types/domain'

export const fundDataApi = {
  search: async (query: string): Promise<MfApiSearchResult[]> => {
    const q = toQueryString({ q: query })
    const data = await getJson<{ results: MfApiSearchResult[] }>(`/api/fund-data/search?${q}`)
    return data.results
  },

  /** Suggested NAV scheme for every fund not yet linked. Slow-ish: searches mfapi.in per fund. */
  matchSuggestions: async (householdId: number): Promise<FundMatchSuggestion[]> => {
    const data = await getJson<{ suggestions: FundMatchSuggestion[] }>(`/api/fund-data/match-suggestions?${toQueryString({ household_id: householdId })}`)
    return data.suggestions
  },

  linkBulk: (householdId: number, links: { investment: number; scheme_code: string; scheme_name: string }[]): Promise<{ linked: number }> =>
    postJson('/api/fund-data/link-bulk', { household_id: householdId, links }),

  /** Fetch latest NAVs for linked funds and value them now. */
  refresh: (householdId: number): Promise<FundRefreshResult> =>
    postJson('/api/fund-data/refresh', { household_id: householdId }),

  /** Bring all market-priced holdings up to date now: link demat funds by ISIN,
   *  fund NAVs, and listed equities at the latest NSE close. */
  refreshPrices: (householdId: number): Promise<MarketPriceRefreshResult> =>
    postJson('/api/fund-data/refresh-prices', { household_id: householdId }),

  unlink: (id: number): Promise<void> =>
    deleteJson(`/api/external-funds/${id}/`),

  getComparison: (householdId: number, asOf: string): Promise<FundComparisonPayload> => {
    const q = toQueryString({ household_id: householdId, as_of: asOf })
    return getJson(`/api/fund-comparison?${q}`)
  },
}
