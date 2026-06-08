import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, ValuationSnapshot } from '../types/domain'

export const valuationApi = {
  async listValuations(householdId: number) {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<ValuationSnapshot>>(`/api/valuations/?${q}`)
    return unwrapList(data)
  },
  async createValuation(payload: Omit<ValuationSnapshot, 'id'>) {
    return postJson<ValuationSnapshot>('/api/valuations/', payload)
  },
  async updateValuation(id: number, payload: Partial<Omit<ValuationSnapshot, 'id'>>) {
    return patchJson<ValuationSnapshot>(`/api/valuations/${id}/`, payload)
  },
  async deleteValuation(id: number) { return deleteJson(`/api/valuations/${id}/`) },
}
