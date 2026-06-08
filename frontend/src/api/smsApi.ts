import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { SmsApiKey, SmsMessage } from '../types/domain'

export type SmsMessageListParams = {
  status?: string
  sender?: string
  category?: string
  search?: string
  ordering?: string
  received_after?: string
  received_before?: string
}

export const smsApi = {
  listApiKeys: (householdId: number) =>
    getJson<SmsApiKey[]>(`/api/sms-api-keys/?${toQueryString({ household: householdId })}`).then(unwrapList),

  /** Returns the plaintext token — only present in this create response, masked everywhere else */
  createApiKey: (data: { household: number; label: string }) =>
    postJson<SmsApiKey>('/api/sms-api-keys/', data),

  updateApiKey: (id: number, data: Partial<Pick<SmsApiKey, 'label' | 'is_active'>>) =>
    patchJson<SmsApiKey>(`/api/sms-api-keys/${id}/`, data),

  deleteApiKey: (id: number) =>
    deleteJson(`/api/sms-api-keys/${id}/`),

  listMessages: (householdId: number, params: SmsMessageListParams = {}) =>
    getJson<SmsMessage[]>(`/api/sms-messages/?${toQueryString({ household: householdId, ...params })}`).then(unwrapList),
}
