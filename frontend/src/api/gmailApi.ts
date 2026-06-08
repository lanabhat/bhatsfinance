import { deleteJsonResult, getJson, patchJson, postJson } from './http'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type GmailConnectedAccount = {
  id: number
  email: string
  label: string
}

export type GmailAccountRule = {
  sender: string
  account_id: number
  keyword?: string
  template?: string
  recipient?: string
  card_suffix?: string
}

export type GmailConfig = {
  enabled: boolean
  query_override: string
  account_rules: GmailAccountRule[]
  excluded_recipients: string[]
  excluded_senders: string[]
  last_synced_at: string | null
}

export type GmailStatusResponse = {
  connected_accounts: GmailConnectedAccount[]
  client_configured: boolean
  household_id: number | null
  config: GmailConfig
}

export type GmailSyncResponse = {
  created_transactions: number
  created_valuations: number
  skipped_duplicates: number
  errors: Array<{ message_id?: string; row?: number; error: string }>
  last_synced_at: string | null
}

// ---------------------------------------------------------------------------
// Preview types
// ---------------------------------------------------------------------------

export type GmailParsedResult = {
  amount: string | null
  direction: string | null
  template_matched: string | null
}

export type GmailExtractedField = {
  label: string
  value: string
}

export type GmailEmailRow = {
  message_id: string
  date: string
  from: string
  to: string
  subject: string
  snippet: string
  parsed: GmailParsedResult
  extracted_fields: Record<string, GmailExtractedField>
  auto_account_id: number | null
  existing_rule: GmailAccountRule | null
  already_imported: boolean
}

export type GmailGroup = {
  group_key: string          // stable unique key: domain|recipient|subject_bucket[|fund:name]
  sender_domain: string
  sender_display: string
  recipient: string          // normalised To address for this sub-group ('' if unknown)
  subject_bucket: string     // normalised subject pattern
  scheme_name: string | null // fund/scheme name for instrument sub-groups
  email_count: number
  already_imported_count: number
  sample_subjects: string[]
  detected_template: string | null
  confidence: number
  recipients: string[]
  suggested_rule: {
    sender: string
    account_id: number | null
    keyword: string | null
    template: string | null
    recipient: string | null
    card_suffix: string | null
  }
  emails: GmailEmailRow[]
}

export type GmailRecipient = {
  email: string
  label: string
}

export type GmailInstrumentProposal = {
  scheme_name: string
  folio_no: string | null
  instrument_type: string
  nav: string | null
  units: string | null
  exists: boolean
  email_count: number
  recipients: string[]   // normalised To: addresses from the emails for this proposal
}

export type GmailPreviewResponse = {
  groups: GmailGroup[]
  total_fetched: number
  unmatched_count: number
  recipients: GmailRecipient[]
  instrument_proposals: GmailInstrumentProposal[]
}

// ---------------------------------------------------------------------------
// Import-groups types
// ---------------------------------------------------------------------------

export type GmailImportGroupRule = {
  sender: string
  account_id: number
  keyword?: string | null
  template?: string | null
  recipient?: string | null
  card_suffix?: string | null
}

export type GmailImportGroup = {
  sender_domain: string
  rule: GmailImportGroupRule
  message_ids: string[]
}

export type GmailImportGroupsRequest = {
  groups: GmailImportGroup[]
  save_rules: boolean
}

export type GmailGroupImportResult = {
  sender_domain: string
  created_transactions?: number
  created_valuations?: number
  errors?: Array<{ error: string }>
  email_log?: Array<{ message_id: string; date?: string; subject?: string; amount?: string | null; status: string; error?: string }>
  skipped?: boolean
  reason?: string
  error?: string
}

export type GmailImportGroupsResponse = {
  group_results: GmailGroupImportResult[]
  rules_saved: boolean
}

// ---------------------------------------------------------------------------
// Staged transaction types
// ---------------------------------------------------------------------------

export type StagedTransactionRaw = {
  from?: string
  subject?: string
  snippet?: string
  parsed_tx?: {
    tx_date?: string
    amount?: string
    direction?: string
    account?: string
    transaction_type?: string
    currency?: string
    fees?: string
    taxes?: string
    external_reference?: string
    idempotency_key?: string
    _gmail_meta?: Record<string, unknown>
  }
  parsed_valuation?: {
    valuation_date?: string
    balance?: string
    account_name?: string
    account_id?: number
    notes?: string
  }
}

export type StagedTransaction = {
  id: number
  message_id: string
  status: 'pending' | 'approved' | 'rejected' | 'valuation_only'
  confidence: number | null
  template_key: string
  template_classification: string
  template_default_spend_category: string
  suggestions: string[]
  raw: StagedTransactionRaw
  imported_transaction_id: number | null
  imported_valuation_id: number | null
  created_at: string | null
}

export type StagedTransactionPatch = Partial<{
  account: string
  direction: string
  amount: string
  transaction_type: string
  tx_date: string
  currency: string
  fees: string
  taxes: string
  external_reference: string
  classification: string
  spend_category: string
}>

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

export type GmailRuleTemplate = {
  key: string
  label: string
  description: string
  direction: string | null
  tx_type: string | null
  target: 'account' | 'instrument'
  amount_re?: string
  confidence_signals?: string[]
  negative_signals?: string[]
  is_builtin?: boolean
  classification?: string
  default_spend_category?: string
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const gmailApi = {
  status: () =>
    getJson<GmailStatusResponse>('/api/gmail/status'),

  disconnect: (credential_id?: number) =>
    postJson<{ connected_accounts: GmailConnectedAccount[] }>(
      '/api/gmail/disconnect',
      credential_id ? { credential_id } : {},
    ),

  sync: () =>
    postJson<GmailSyncResponse>('/api/gmail/sync', {}),

  saveConfig: (payload: Partial<GmailConfig>) =>
    patchJson<GmailConfig>('/api/gmail/config', payload),

  getTemplates: () =>
    getJson<GmailRuleTemplate[]>('/api/gmail/templates'),

  fetchPreview: (payload: { query: string; max_results: number }) =>
    postJson<GmailPreviewResponse>('/api/gmail/fetch-preview', payload),

  importGroups: (payload: GmailImportGroupsRequest) =>
    postJson<GmailImportGroupsResponse>('/api/gmail/import-groups', payload),

  createInstrument: (payload: {
    scheme_name: string
    folio_no?: string | null
    instrument_type?: string
    member_id?: number | null
    default_account_id?: number | null
  }) =>
    postJson<{ instrument: { id: number; name: string }; created: boolean }>(
      '/api/gmail/approve-proposals',
      payload,
    ),

  getMessageFields: (message_id: string) =>
    getJson<{
      fields: Record<string, GmailExtractedField>
      body_preview: string
      template_matched: string | null
      confidence: number
      parsed_amount: string | null
    }>(`/api/gmail/message-fields?message_id=${encodeURIComponent(message_id)}`),

  resetImportHistory: (reset_sync_time = true) =>
    postJson<{ deleted: number; sync_time_reset: boolean }>(
      '/api/gmail/reset-import-history',
      { reset_sync_time },
    ),

  saveTemplate: (tmpl: GmailRuleTemplate) =>
    postJson<GmailRuleTemplate>('/api/gmail/templates', tmpl),

  deleteTemplate: (key: string) =>
    deleteJsonResult<{ deleted: string }>(`/api/gmail/templates/${key}`),

  getStaged: (status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending') =>
    getJson<{ results: StagedTransaction[] }>(`/api/gmail/staged?status=${status}`),

  approveStaged: (id: number, overrides?: StagedTransactionPatch) =>
    postJson<StagedTransaction & { transaction_id: number | null; valuation_id: number | null }>(
      `/api/gmail/staged/${id}/approve`,
      overrides ?? {},
    ),

  rejectStaged: (id: number) =>
    postJson<StagedTransaction>(`/api/gmail/staged/${id}/reject`, {}),

  updateStaged: (id: number, patch: StagedTransactionPatch) =>
    patchJson<StagedTransaction>(`/api/gmail/staged/${id}`, patch),

  bulkApproveStaged: (ids: number[]) =>
    postJson<{ results: Array<{ id: number; status?: string; transaction_id?: number | null; error?: string }> }>(
      '/api/gmail/staged/bulk-approve',
      { ids },
    ),

  deleteStaged: (id: number) =>
    deleteJsonResult<{ deleted: number }>(`/api/gmail/staged/${id}`),

  bulkDeleteStaged: (status?: 'pending' | 'approved' | 'rejected') =>
    postJson<{ deleted: number }>('/api/gmail/staged/bulk-delete', status ? { status } : {}),
}
