import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, TaxProjection, TaxRecord } from '../types/domain'

export const taxApi = {
  async listTaxRecords(householdId: number) {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<TaxRecord>>(`/api/tax-records/?${q}`)
    return unwrapList(data)
  },
  async createTaxRecord(payload: Omit<TaxRecord, 'id'>) {
    return postJson<TaxRecord>('/api/tax-records/', payload)
  },
  async updateTaxRecord(id: number, payload: Partial<Omit<TaxRecord, 'id'>>) {
    return patchJson<TaxRecord>(`/api/tax-records/${id}/`, payload)
  },
  async listTaxProjections(householdId: number) {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<TaxProjection>>(`/api/tax-projections/?${q}`)
    return unwrapList(data)
  },
  async createTaxProjection(payload: Omit<TaxProjection, 'id'>) {
    return postJson<TaxProjection>('/api/tax-projections/', payload)
  },
  async updateTaxProjection(id: number, payload: Partial<Omit<TaxProjection, 'id'>>) {
    return patchJson<TaxProjection>(`/api/tax-projections/${id}/`, payload)
  },
  async deleteTaxRecord(id: number) { return deleteJson(`/api/tax-records/${id}/`) },
  async deleteTaxProjection(id: number) { return deleteJson(`/api/tax-projections/${id}/`) },
}
