import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, InsurancePolicy, MissedPremiumAlert, VehicleClaim } from '../types/domain'

export const insuranceApi = {
  async listPolicies(householdId: number) {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<InsurancePolicy>>(`/api/insurance-policies/?${q}`)
    return unwrapList(data)
  },
  async createPolicy(payload: Omit<InsurancePolicy, 'id' | 'member_name' | 'account_name' | 'covered_member_names' | 'vehicle_claims' | 'created_at' | 'updated_at'>) {
    return postJson<InsurancePolicy>('/api/insurance-policies/', payload)
  },
  async updatePolicy(id: number, payload: Partial<Omit<InsurancePolicy, 'id' | 'member_name' | 'account_name' | 'covered_member_names' | 'vehicle_claims' | 'created_at' | 'updated_at'>>) {
    return patchJson<InsurancePolicy>(`/api/insurance-policies/${id}/`, payload)
  },
  async deletePolicy(id: number) {
    return deleteJson(`/api/insurance-policies/${id}/`)
  },
  async markPremiumPaid(policyId: number, payload: {
    due_date: string
    paid_on?: string
    account_id?: number
    amount?: string
    deduct: boolean
    note?: string
  }) {
    return postJson<{
      transaction_id?: number
      ack_id?: number
      cleared_due_date: string
      mode: 'transaction' | 'ack'
    }>(`/api/insurance-policies/${policyId}/mark-paid/`, payload)
  },
  async listMissedPremiums(householdId: number, asOf?: string) {
    const q = toQueryString({ household_id: householdId, ...(asOf ? { as_of: asOf } : {}) })
    const data = await getJson<{ as_of: string; missed: MissedPremiumAlert[] }>(`/api/alerts/missed-premiums?${q}`)
    return data.missed
  },

  // Vehicle claims
  async listClaims(policyId: number) {
    const q = toQueryString({ policy: policyId })
    const data = await getJson<ApiListResponse<VehicleClaim>>(`/api/vehicle-claims/?${q}`)
    return unwrapList(data)
  },
  async createClaim(payload: Omit<VehicleClaim, 'id' | 'created_at' | 'updated_at'>) {
    return postJson<VehicleClaim>('/api/vehicle-claims/', payload)
  },
  async updateClaim(id: number, payload: Partial<Omit<VehicleClaim, 'id' | 'created_at' | 'updated_at'>>) {
    return patchJson<VehicleClaim>(`/api/vehicle-claims/${id}/`, payload)
  },
  async deleteClaim(id: number) {
    return deleteJson(`/api/vehicle-claims/${id}/`)
  },
}
