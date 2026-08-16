import { getJson as httpGet, postJson as httpPost } from './http'
import type { ImportApplyPayload, ImportPreviewResult, ImportResult, ImportSchema } from '../types/domain'

export type GrowwMemberPreview = { id: number; name: string; relation?: string }
export type GrowwFilePreview = {
  filename: string
  source?: 'groww' | 'upstox'
  investor_name: string
  valuation_date: string
  stocks_count: number
  mf_count: number
  holdings_count?: number
  matched_member: { id: number; name: string; relation?: string; confidence: number } | null
  members: GrowwMemberPreview[]
  error?: string
}
export type GrowwFileResult = {
  filename: string
  member_name: string
  investor_name: string
  stocks_created: number
  mf_created: number
  valuations_created: number
  errors: { section: string; row: number; name: string; reason: string }[]
  error?: string
}

export type FDAdviceMemberPreview = { id: number; name: string; relation?: string }

export type FDAdviceFilePreview = {
  filename: string
  doc_type: 'fd_advice' | 'rd_statement' | ''
  bank_name: string
  account_number: string
  member_name_raw: string
  annual_rate: string
  investment_date: string
  parser_used: string
  warnings: string[]
  // FD-only
  principal: string
  maturity_date: string
  maturity_value: string
  compounding: 'simple' | 'monthly' | 'quarterly' | 'half_yearly' | 'annually'
  tenure_days: number | null
  // RD-only
  installment_amount: string
  current_balance: string
  installment_count_observed: number
  statement_date: string
  matched_member: { id: number; name: string; relation?: string; confidence: number } | null
  members: FDAdviceMemberPreview[]
  error?: string
  error_code?: 'bad_password' | string
}

export type FDAdviceConfirmedItem = {
  filename: string
  doc_type: 'fd_advice' | 'rd_statement'
  member_id: number | null
  bank_name: string
  account_number: string
  instrument_name?: string
  annual_rate: string
  investment_date: string
  compounding: string
  // FD-only
  principal?: string
  maturity_date?: string
  maturity_value?: string
  // RD-only — account_id is required for RD statements: it's the real
  // account future installments will be debited from via RDMandate. It is
  // NOT used for the historical backfilled installments, which are recorded
  // without an account link to avoid double-counting money that already
  // left the account in the past.
  installment_amount?: string
  current_balance?: string
  tenure_months?: number
  installment_count_observed?: number
  account_id?: number
}

export type FDAdviceFileResult = {
  filename: string
  instrument_id?: number
  instrument_name?: string
  mandate_id?: number
  installments_backfilled?: number
  created?: boolean
  fd_details_created?: boolean
  error?: string
}

export type NpsMemberPreview = { id: number; name: string; relation?: string }

export type NpsSchemeTransaction = {
  tx_date: string
  description: string
  amount: string
  nav: string
  units: string
  kind: 'contribution' | 'billing' | 'other'
}

export type NpsSchemePreview = {
  scheme: string
  fund_manager: string
  tier: string
  closing_units: string
  transactions: NpsSchemeTransaction[]
}

export type NpsFilePreview = {
  filename: string
  pran: string
  subscriber_name: string
  tier: string
  statement_date: string
  total_value: string
  total_contribution: string
  total_withdrawal: string
  schemes: NpsSchemePreview[]
  matched_member: { id: number; name: string; relation?: string; confidence: number } | null
  members: NpsMemberPreview[]
  error?: string
}

export type NpsConfirmedItem = {
  filename: string
  pran: string
  tier: string
  statement_date: string
  total_value: string
  total_contribution: string
  schemes: NpsSchemePreview[]
  member_id: number | null
  account_id?: number | null
  affects_balance: boolean
}

export type NpsFileResult = {
  filename: string
  instrument_id?: number
  instrument_name?: string
  created?: boolean
  contributions_created?: number
  fees_created?: number
  opening_contribution_backfilled?: boolean
  error?: string
}

export type EpfMemberPreview = { id: number; name: string; relation?: string }

export type EpfTransactionPreview = {
  tx_date: string
  wage_month: string
  tx_type: string
  description: string
  wages: string
  eps_wages: string
  employee: string
  employer: string
  pension: string
}

export type EpfFilePreview = {
  filename: string
  uan: string
  member_id: string
  member_name: string
  establishment_id: string
  establishment_name: string
  fy_start_year: number
  fy_end_year: number
  opening_date: string
  opening_employee: string
  opening_employer: string
  opening_pension: string
  closing_date: string
  closing_employee: string
  closing_employer: string
  closing_pension: string
  total_contribution_employee: string
  total_contribution_employer: string
  total_contribution_pension: string
  total_withdrawal_employee: string
  total_withdrawal_employer: string
  total_withdrawal_pension: string
  transactions: EpfTransactionPreview[]
  matched_member: { id: number; name: string; relation?: string; confidence: number } | null
  members: EpfMemberPreview[]
  error?: string
}

export type EpfConfirmedItem = {
  filename: string
  uan: string
  opening_date: string
  opening_employee: string
  opening_employer: string
  opening_pension: string
  closing_date: string
  closing_employee: string
  closing_employer: string
  closing_pension: string
  transactions: EpfTransactionPreview[]
  member_id: number | null
}

export type EpfFileResult = {
  filename: string
  instrument_id?: number
  instrument_name?: string
  created?: boolean
  contributions_created?: number
  opening_balance_backfilled?: boolean
  error?: string
}

export type PpfMemberPreview = { id: number; name: string; relation?: string }

export type PpfTransactionPreview = {
  tx_date: string
  description: string
  amount: string
  kind: 'deposit' | 'interest' | 'other'
  direction: 'deposit' | 'withdrawal'
}

export type PpfFilePreview = {
  filename: string
  account_no: string
  open_date: string
  statement_from: string
  statement_to: string
  holder_name: string
  opening_balance: string
  closing_balance: string
  transactions: PpfTransactionPreview[]
  matched_member: { id: number; name: string; relation?: string; confidence: number } | null
  members: PpfMemberPreview[]
  error?: string
}

export type PpfConfirmedItem = {
  filename: string
  account_no: string
  open_date: string
  statement_from: string
  statement_to: string
  opening_balance: string
  closing_balance: string
  transactions: PpfTransactionPreview[]
  member_id: number | null
  estimated_prior_principal: string
}

export type PpfFileResult = {
  filename: string
  instrument_id?: number
  instrument_name?: string
  created?: boolean
  contributions_created?: number
  interest_created?: number
  opening_balance_backfilled?: boolean
  estimated_prior_interest?: string
  error?: string
}

export type SbiMemberPreview = { id: number; name: string; relation?: string }

export type SbiSavingsAccountPreview = {
  account_number: string
  account_type: string
  branch: string
  roi: string
  currency: string
  mode_of_operation: string
  available_balance: string
}

export type SbiDepositPreview = {
  account_number: string
  deposit_type: string
  branch: string
  mode_of_operation: string
  bank_name: string
  annual_rate: string
  currency: string
  investment_date: string
  maturity_date: string
  tenor_raw: string
  tenure_days: number | null
  compounding: 'simple' | 'monthly' | 'quarterly' | 'half_yearly' | 'annually'
  warnings: string[]
  doc_type: 'fd_advice' | 'rd_statement'
  // fd_advice-only
  principal?: string
  maturity_value?: string
  // rd_statement-only
  installment_amount?: string
  current_balance?: string
  installment_count_observed?: number
  statement_date?: string
}

export type SbiExistingAccount = { id: number; name: string; institution_name: string }

export type SbiStatementFilePreview = {
  filename: string
  savings_accounts: SbiSavingsAccountPreview[]
  deposits: SbiDepositPreview[]
  account_numbers: string[]
  members: SbiMemberPreview[]
  existing_accounts: SbiExistingAccount[]
  error?: string
  error_code?: 'bad_password' | string
}

export type SbiAccountMappingEntry =
  | { account_id: number }
  | { name: string; member_id?: number | null }

export type SbiConfirmedSavingsAccount = SbiSavingsAccountPreview & {
  member_id: number | null
  statement_date?: string
}

export type SbiConfirmedDeposit = SbiDepositPreview & {
  member_id: number | null
  // rd_statement-only, required before apply
  tenure_months?: number
}

export type SbiSavingsAccountResult = {
  account_number: string
  account_id?: number
  account_name?: string
  balance?: string
  valuation_date?: string
  snapshot_created?: boolean
  error?: string
}

export type SbiDepositResult = {
  account_number: string
  instrument_id?: number
  instrument_name?: string
  mandate_id?: number
  installments_backfilled?: number
  created?: boolean
  fd_details_created?: boolean
  error?: string
}

export type SbiStatementApplyResult = {
  savings_accounts: SbiSavingsAccountResult[]
  deposits: SbiDepositResult[]
}

const BASE = '/api'

async function getCsrf(): Promise<string> {
  const name = 'csrftoken='
  for (const part of document.cookie.split(';')) {
    const p = part.trim()
    if (p.startsWith(name)) return decodeURIComponent(p.slice(name.length))
  }
  // fetch the CSRF cookie if not yet set
  await fetch(`${BASE}/csrf/`, { credentials: 'include' })
  for (const part of document.cookie.split(';')) {
    const p = part.trim()
    if (p.startsWith(name)) return decodeURIComponent(p.slice(name.length))
  }
  return ''
}

async function postForm<T>(url: string, formData: FormData): Promise<T> {
  const csrf = await getCsrf()
  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: { 'X-CSRFToken': csrf },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const importApi = {
  previewFile: async (file: File): Promise<ImportPreviewResult> => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const fileType = ext === 'xlsx' || ext === 'xls' ? 'excel' : ext
    const fd = new FormData()
    fd.append('file', file)
    fd.append('file_type', fileType)
    return postForm<ImportPreviewResult>(`${BASE}/imports/preview`, fd)
  },

  getSchemas: (): Promise<Record<string, ImportSchema>> =>
    httpGet(`${BASE}/imports/schemas`),

  applyImport: (payload: ImportApplyPayload): Promise<ImportResult> =>
    httpPost(`${BASE}/imports/apply`, payload),

  previewGrowwFiles: async (householdId: number, files: File[]): Promise<GrowwFilePreview[]> => {
    const fd = new FormData()
    fd.append('household_id', String(householdId))
    for (const f of files) fd.append('files', f)
    return postForm<GrowwFilePreview[]>(`${BASE}/imports/groww-preview`, fd)
  },

  applyGrowwImport: async (
    householdId: number,
    files: File[],
    assignments: { filename: string; member_id: number }[],
  ): Promise<GrowwFileResult[]> => {
    const fd = new FormData()
    fd.append('household_id', String(householdId))
    fd.append('assignments', JSON.stringify(assignments))
    for (const f of files) fd.append('files', f)
    return postForm<GrowwFileResult[]>(`${BASE}/imports/groww-apply`, fd)
  },

  previewFDAdviceFiles: async (
    householdId: number,
    files: File[],
    passwords?: Record<string, string>,
    savePasswords?: Record<string, boolean>,
  ): Promise<FDAdviceFilePreview[]> => {
    const fd = new FormData()
    fd.append('household_id', String(householdId))
    if (passwords && Object.keys(passwords).length > 0) fd.append('passwords', JSON.stringify(passwords))
    if (savePasswords && Object.keys(savePasswords).length > 0) fd.append('save_passwords', JSON.stringify(savePasswords))
    for (const f of files) fd.append('files', f)
    return postForm<FDAdviceFilePreview[]>(`${BASE}/imports/fd-advice-preview`, fd)
  },

  applyFDAdviceImport: (
    householdId: number,
    items: FDAdviceConfirmedItem[],
  ): Promise<FDAdviceFileResult[]> =>
    httpPost(`${BASE}/imports/fd-advice-apply`, { household_id: householdId, items }),

  previewNpsFiles: async (householdId: number, files: File[]): Promise<NpsFilePreview[]> => {
    const fd = new FormData()
    fd.append('household_id', String(householdId))
    for (const f of files) fd.append('files', f)
    return postForm<NpsFilePreview[]>(`${BASE}/imports/nps-preview`, fd)
  },

  applyNpsImport: (
    householdId: number,
    items: NpsConfirmedItem[],
  ): Promise<NpsFileResult[]> =>
    httpPost(`${BASE}/imports/nps-apply`, { household_id: householdId, items }),

  previewEpfPassbookFiles: async (householdId: number, files: File[]): Promise<EpfFilePreview[]> => {
    const fd = new FormData()
    fd.append('household_id', String(householdId))
    for (const f of files) fd.append('files', f)
    return postForm<EpfFilePreview[]>(`${BASE}/imports/epf-passbook-preview`, fd)
  },

  applyEpfPassbookImport: (
    householdId: number,
    items: EpfConfirmedItem[],
  ): Promise<EpfFileResult[]> =>
    httpPost(`${BASE}/imports/epf-passbook-apply`, { household_id: householdId, items }),

  previewPpfStatementFiles: async (householdId: number, files: File[]): Promise<PpfFilePreview[]> => {
    const fd = new FormData()
    fd.append('household_id', String(householdId))
    for (const f of files) fd.append('files', f)
    return postForm<PpfFilePreview[]>(`${BASE}/imports/ppf-statement-preview`, fd)
  },

  applyPpfStatementImport: (
    householdId: number,
    items: PpfConfirmedItem[],
  ): Promise<PpfFileResult[]> =>
    httpPost(`${BASE}/imports/ppf-statement-apply`, { household_id: householdId, items }),

  previewSBIStatementFiles: async (
    householdId: number,
    files: File[],
    passwords?: Record<string, string>,
    savePasswords?: Record<string, boolean>,
  ): Promise<SbiStatementFilePreview[]> => {
    const fd = new FormData()
    fd.append('household_id', String(householdId))
    if (passwords && Object.keys(passwords).length > 0) fd.append('passwords', JSON.stringify(passwords))
    if (savePasswords && Object.keys(savePasswords).length > 0) fd.append('save_passwords', JSON.stringify(savePasswords))
    for (const f of files) fd.append('files', f)
    return postForm<SbiStatementFilePreview[]>(`${BASE}/imports/sbi-statement-preview`, fd)
  },

  applySBIStatementImport: (
    householdId: number,
    accountMapping: Record<string, SbiAccountMappingEntry>,
    savingsAccounts: SbiConfirmedSavingsAccount[],
    deposits: SbiConfirmedDeposit[],
  ): Promise<SbiStatementApplyResult> =>
    httpPost(`${BASE}/imports/sbi-statement-apply`, {
      household_id: householdId,
      account_mapping: accountMapping,
      savings_accounts: savingsAccounts,
      deposits,
    }),
}
