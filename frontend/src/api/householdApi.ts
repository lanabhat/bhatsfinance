import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, Household, Member } from '../types/domain'

export const householdApi = {
  async listHouseholds() {
    const data = await getJson<ApiListResponse<Household>>('/api/households/')
    return unwrapList(data)
  },
  async createHousehold(payload: Pick<Household, 'name' | 'base_currency'>) {
    return postJson<Household>('/api/households/', payload)
  },
  async updateHousehold(id: number, payload: Partial<Pick<Household, 'name' | 'base_currency'>>) {
    return patchJson<Household>(`/api/households/${id}/`, payload)
  },
  async deleteHousehold(id: number) { return deleteJson(`/api/households/${id}/`) },
  async listMembers(householdId: number) {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<Member>>(`/api/members/?${q}`)
    return unwrapList(data)
  },
  async createMember(payload: Omit<Member, 'id'>) {
    return postJson<Member>('/api/members/', payload)
  },
  async updateMember(id: number, payload: Partial<Omit<Member, 'id'>>) {
    return patchJson<Member>(`/api/members/${id}/`, payload)
  },
  async deleteMember(id: number) { return deleteJson(`/api/members/${id}/`) },
}
