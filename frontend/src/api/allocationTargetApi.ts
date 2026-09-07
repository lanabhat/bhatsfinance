import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { AllocationSuggestion, ApiListResponse, AllocationTarget, RebalancingPayload } from '../types/domain'

type TargetPayload = Omit<AllocationTarget, 'id'>

export const allocationTargetApi = {
  list: async (householdId: number): Promise<AllocationTarget[]> => {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<AllocationTarget>>(`/api/allocation-targets/?${q}`)
    return unwrapList(data)
  },

  create: (payload: TargetPayload): Promise<AllocationTarget> =>
    postJson('/api/allocation-targets/', payload),

  update: (id: number, payload: Partial<TargetPayload>): Promise<AllocationTarget> =>
    patchJson(`/api/allocation-targets/${id}/`, payload),

  delete: (id: number): Promise<void> =>
    deleteJson(`/api/allocation-targets/${id}/`),

  getRebalancing: (householdId: number, asOf: string): Promise<RebalancingPayload> => {
    const q = toQueryString({ household_id: householdId, as_of: asOf })
    return getJson(`/api/rebalancing?${q}`)
  },

  getAgeSuggestion: (householdId: number, memberId: number, equityBase: 100 | 110 | 120, asOf: string): Promise<AllocationSuggestion> => {
    const q = toQueryString({ household_id: householdId, member_id: memberId, equity_base: equityBase, as_of: asOf })
    return getJson(`/api/allocation-suggestion?${q}`)
  },
}
