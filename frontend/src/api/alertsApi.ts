import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, RDMandate, SIPMandate } from '../types/domain'

export const alertsApi = {
  async listSipMandates(householdId: number) {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<SIPMandate>>(`/api/sip-mandates/?${q}`)
    return unwrapList(data)
  },
  async createSipMandate(payload: Omit<SIPMandate, 'id'>) {
    return postJson<SIPMandate>('/api/sip-mandates/', payload)
  },
  async updateSipMandate(id: number, payload: Partial<Omit<SIPMandate, 'id'>>) {
    return patchJson<SIPMandate>(`/api/sip-mandates/${id}/`, payload)
  },
  async deleteSipMandate(id: number) { return deleteJson(`/api/sip-mandates/${id}/`) },
  async markSipPaid(mandateId: number, payload: {
    due_date: string
    paid_on?: string
    account_id?: number
    amount?: string
    quantity?: string | null
    update_holding: boolean
    deduct: boolean
  }) {
    return postJson<{
      transaction_id?: number
      ack_id?: number
      cleared_due_date: string
      mode: 'transaction' | 'ack'
    }>(`/api/sip-mandates/${mandateId}/mark-paid/`, payload)
  },
  async markAllSipsPaid(payload: {
    items: Array<{ mandate_id: number; due_date: string; amount?: string; account_id?: number }>
    deduct: boolean
    update_holding?: boolean
    paid_on?: string
    account_id?: number
  }) {
    return postJson<{
      processed: number
      succeeded: number
      results: Array<{ mandate_id?: number; due_date?: string; ok: boolean; mode?: string; error?: unknown }>
    }>(`/api/sip-mandates/mark-all-paid/`, payload)
  },

  async listRDMandates(householdId: number) {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<RDMandate>>(`/api/rd-mandates/?${q}`)
    return unwrapList(data)
  },
  async markRDPaid(mandateId: number, payload: {
    due_date: string
    paid_on?: string
    account_id?: number
    amount?: string
    deduct: boolean
  }) {
    return postJson<{
      transaction_id?: number
      ack_id?: number
      cleared_due_date: string
      mode: 'transaction' | 'ack'
    }>(`/api/rd-mandates/${mandateId}/mark-paid/`, payload)
  },
  async markAllRDsPaid(payload: {
    items: Array<{ mandate_id: number; due_date: string; amount?: string; account_id?: number }>
    deduct: boolean
    paid_on?: string
    account_id?: number
  }) {
    return postJson<{
      processed: number
      succeeded: number
      results: Array<{ mandate_id?: number; due_date?: string; ok: boolean; mode?: string; error?: unknown }>
    }>(`/api/rd-mandates/mark-all-paid/`, payload)
  },
}
