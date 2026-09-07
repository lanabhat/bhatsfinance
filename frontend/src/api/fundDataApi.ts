import { deleteJson, getJson, postJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, ExternalFund, FundComparisonPayload, MfApiSearchResult } from '../types/domain'

export const fundDataApi = {
  search: async (query: string): Promise<MfApiSearchResult[]> => {
    const q = toQueryString({ q: query })
    const data = await getJson<{ results: MfApiSearchResult[] }>(`/api/fund-data/search?${q}`)
    return data.results
  },

  listLinks: async (instrumentId?: number): Promise<ExternalFund[]> => {
    const q = toQueryString({ instrument: instrumentId })
    const data = await getJson<ApiListResponse<ExternalFund>>(`/api/external-funds/?${q}`)
    return unwrapList(data)
  },

  link: (payload: { instrument: number; mfapi_scheme_code: string; scheme_name: string; fund_house: string }): Promise<ExternalFund> =>
    postJson('/api/external-funds/', payload),

  unlink: (id: number): Promise<void> =>
    deleteJson(`/api/external-funds/${id}/`),

  getComparison: (householdId: number, asOf: string): Promise<FundComparisonPayload> => {
    const q = toQueryString({ household_id: householdId, as_of: asOf })
    return getJson(`/api/fund-comparison?${q}`)
  },
}
