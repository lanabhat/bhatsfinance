import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ParsedSmsTransaction, PaginatedResponse, SmsApiKey, SmsMessage } from '../types/domain'

export type SmsApprovalOverrides = Partial<ParsedSmsTransaction>

export type SmsApprovalResult = SmsMessage & { transaction_id?: number }

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

  /** Save edits to the parsed-transaction suggestion before approving (also re-opens a rejected item). */
  updateStaged: (id: number, overrides: SmsApprovalOverrides) =>
    patchJson<SmsMessage>(`/api/sms-messages/${id}/edit/`, overrides),

  /** Approve a staged message — creates the ledger Transaction with any field overrides applied on top of the parsed suggestion. */
  approveStaged: (id: number, overrides: SmsApprovalOverrides = {}) =>
    postJson<SmsApprovalResult>(`/api/sms-messages/${id}/approve/`, overrides),

  rejectStaged: (id: number) =>
    postJson<SmsMessage>(`/api/sms-messages/${id}/reject/`, {}),

  /** Re-run rules on a list of staged messages and update their parsed_tx. */
  reapplyRules: (ids: number[]) =>
    postJson<{ updated: number; results: { id: number; matched_rule_name: string | null; parsed_tx: Partial<ParsedSmsTransaction> }[] }>(
      '/api/sms-messages/reapply-rules/', { ids }
    ),

  /**
   * Export messages as a JSON blob URL. Pass ids to export selected rows only,
   * or omit to export all messages matching the current filters.
   */
  exportUrl: (householdId: number, options: { ids?: number[] } & SmsBulkDeleteFilters = {}) => {
    const { ids, ...filters } = options
    const params: Record<string, string | number | boolean | undefined> = { household: householdId, ...filters }
    if (ids && ids.length > 0) params['ids'] = ids.join(',')
    return `/api/sms-messages/export/?${toQueryString(params)}`
  },

  /** Import messages from a parsed JSON export. */
  importMessages: (householdId: number, messages: { sender: string; body: string; timestamp: string }[]) =>
    postJson<{ created: number; skipped: number; errors: { index: number; detail: unknown }[] }>(
      `/api/sms-messages/import/?household=${householdId}`, { messages }
    ),
}
