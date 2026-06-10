import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'

export type ConditionLeaf = {
  field: 'sender' | 'body'
  op: 'contains' | 'not_contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex'
  value: string
}

export type ConditionGroup = {
  op: 'and' | 'or'
  conditions: (ConditionLeaf | ConditionGroup)[]
}

export type ConditionNode = ConditionLeaf | ConditionGroup

export function isGroup(node: ConditionNode): node is ConditionGroup {
  return 'conditions' in node
}

export type SmsRule = {
  id: number
  household: number
  name: string
  is_active: boolean
  priority: number
  conditions: ConditionGroup
  account: number | null
  account_name: string
  member: number | null
  member_name: string
  direction: string
  transaction_type: string
  classification: string
  spend_category: string
  amount_regex: string
  merchant_regex: string
  reference_regex: string
  notes_regex: string
  created_at: string
}

export type SmsRuleFormData = Omit<SmsRule, 'id' | 'created_at' | 'account_name' | 'member_name'>

export type SmsRuleTestResult = {
  matched: boolean
  extractions: { amount?: string; merchant?: string; reference?: string; notes?: string }
}

export type SmsRuleSuggestion = {
  id: number
  household: number
  sender: string
  observation_count: number
  status: 'pending' | 'dismissed' | 'accepted'
  account: number | null
  account_name: string
  member: number | null
  member_name: string
  direction: string
  classification: string
  spend_category: string
  transaction_type: string
  body_samples: string[]
  created_at: string
}

export type SmsRuleSuggestionAcceptResult = {
  suggestion: SmsRuleSuggestion
  prefill: SmsRuleFormData
}

export const smsRulesApi = {
  list: (householdId: number) =>
    getJson<SmsRule[]>(`/api/sms-rules/?${toQueryString({ household: householdId })}`).then(unwrapList),

  create: (data: SmsRuleFormData) =>
    postJson<SmsRule>('/api/sms-rules/', data),

  update: (id: number, data: Partial<SmsRuleFormData>) =>
    patchJson<SmsRule>(`/api/sms-rules/${id}/`, data),

  delete: (id: number) =>
    deleteJson(`/api/sms-rules/${id}/`),

  /** Test a saved rule against a sample SMS. */
  test: (id: number, sender: string, body: string) =>
    postJson<SmsRuleTestResult>(`/api/sms-rules/${id}/test/`, { sender, body }),

  /** Test an unsaved rule definition (called while editing, before saving). */
  testNew: (rule: Partial<SmsRuleFormData>, sender: string, body: string) =>
    postJson<SmsRuleTestResult>('/api/sms-rules/test-new/', { rule, sender, body }),

  /** Run all active household rules against a sample sender+body, returns first match + parsed_tx. */
  detect: (householdId: number, sender: string, body: string) =>
    postJson<{
      matched_rule: { id: number; name: string } | null
      parsed_tx: Record<string, string>
      all_rules: { id: number; name: string; matched: boolean }[]
    }>(`/api/sms-rules/detect/?household=${householdId}`, { sender, body }),

  /** Returns a URL that triggers a JSON download of all household rules. */
  exportUrl: (householdId: number) =>
    `/api/sms-rules/export/?household=${householdId}`,

  /** Import rules from a parsed JSON export. Pass rules array directly. */
  importRules: (rules: SmsRuleExportRow[]) =>
    postJson<{ created: number; errors: { index: number; name?: string; detail: string }[] }>(
      '/api/sms-rules/import/', { rules }
    ),
}

export type SmsRuleExportRow = {
  name: string
  is_active: boolean
  priority: number
  conditions: ConditionGroup
  account_name: string
  member_name: string
  direction: string
  transaction_type: string
  classification: string
  spend_category: string
  amount_regex: string
  merchant_regex: string
  reference_regex: string
  notes_regex: string
}

export const smsRuleSuggestionsApi = {
  list: (householdId: number) =>
    getJson<SmsRuleSuggestion[]>(`/api/sms-rule-suggestions/?${toQueryString({ household: householdId })}`).then(unwrapList),

  dismiss: (id: number) =>
    postJson<{ status: string }>(`/api/sms-rule-suggestions/${id}/dismiss/`, {}),

  /** Returns prefill data and leaves suggestion status unchanged — safe to cancel. */
  accept: (id: number) =>
    postJson<SmsRuleSuggestionAcceptResult>(`/api/sms-rule-suggestions/${id}/accept/`, {}),

  /** Call after the rule is actually saved to mark the suggestion accepted. */
  confirmAccepted: (id: number) =>
    postJson<{ status: string }>(`/api/sms-rule-suggestions/${id}/confirm-accepted/`, {}),

  /** Permanently delete — won't resurface unlike dismiss. */
  deleteSuggestion: (id: number) =>
    deleteJson(`/api/sms-rule-suggestions/${id}/delete/`),
}
