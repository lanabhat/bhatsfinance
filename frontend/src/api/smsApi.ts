import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { PaginatedResponse, SmsApiKey, SmsMessage } from '../types/domain'

export type SmsMessageListParams = {
  status?: string
  sender?: string
  category?: string
  search?: string
  ordering?: string
  received_after?: string
  received_before?: string
  page?: number
  page_size?: number
}

export type SmsBulkDeleteFilters = Omit<SmsMessageListParams, 'page' | 'page_size' | 'ordering'>

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

  /** Returns the raw paginated page (count/next/previous/results) so the UI can show page controls. */
  listMessagesPage: (householdId: number, params: SmsMessageListParams = {}) =>
    getJson<PaginatedResponse<SmsMessage>>(`/api/sms-messages/?${toQueryString({ household: householdId, ...params })}`),

  deleteMessage: (id: number) =>
    deleteJson(`/api/sms-messages/${id}/`),

  /** Delete a specific set of messages by id. */
  bulkDeleteByIds: (ids: number[]) =>
    postJson<{ deleted: number }>('/api/sms-messages/bulk-delete/', { ids }),

  /** Delete every message matching the given filters (e.g. "delete all rejected"). */
  bulkDeleteAllMatching: (householdId: number, filters: SmsBulkDeleteFilters = {}) =>
    postJson<{ deleted: number }>(
      `/api/sms-messages/bulk-delete/?${toQueryString({ household: householdId, ...filters })}`,
      { all_matching_filters: true },
    ),
}
