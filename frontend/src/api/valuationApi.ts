import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, ValuationSnapshot } from '../types/domain'

export const valuationApi = {
  async listValuations(householdId: number) {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<ValuationSnapshot>>(`/api/valuations/?${q}`)
    return unwrapList(data)
  },
  async listForInvestment(householdId: number, investmentId: number) {
    const q = toQueryString({ household: householdId, investment: investmentId, page_size: 200 })
    const data = await getJson<ApiListResponse<ValuationSnapshot>>(`/api/valuations/?${q}`)
    return unwrapList(data)
  },
  async listForInstrument(householdId: number, instrumentId: number) {
    const q = toQueryString({ household: householdId, instrument: instrumentId, page_size: 200 })
    const data = await getJson<ApiListResponse<ValuationSnapshot>>(`/api/valuations/?${q}`)
    // Instrument-level holdings are keyed without an investment (see compute_holdings),
    // so drop per-fund snapshots that share a shell instrument.
    return unwrapList(data).filter((v) => v.investment === null)
  },
  async createValuation(payload: Omit<ValuationSnapshot, 'id' | 'investment'> & { investment?: number | null }) {
    return postJson<ValuationSnapshot>('/api/valuations/', payload)
  },
  async updateValuation(id: number, payload: Partial<Omit<ValuationSnapshot, 'id'>>) {
    return patchJson<ValuationSnapshot>(`/api/valuations/${id}/`, payload)
  },
  async deleteValuation(id: number) { return deleteJson(`/api/valuations/${id}/`) },
}
