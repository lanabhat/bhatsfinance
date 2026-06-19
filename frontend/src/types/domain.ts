export type Id = number

export type ApiListResponse<T> = T[] | { results: T[] }

export type PaginatedResponse<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type ApiErrorMap = Record<string, string[] | string>

export type OptionItem = {
  id: number
  label: string
}

export type InstrumentOption = OptionItem & {
  instrument_type: string
  default_account: number | null
}

export type Household = {
  id: number
  name: string
  base_currency: string
}

export type Member = {
  id: number
  household: number
  full_name: string
  email: string
  relation_type: 'self' | 'spouse' | 'child' | 'parent' | 'other'
  is_active: boolean
  include_in_networth: boolean
}

export type Account = {
  id: number
  household: number
  name: string
  account_type: 'bank' | 'broker' | 'pf' | 'loan' | 'credit_card' | 'insurance' | 'cash' | 'other'
  institution_name: string
  primary_member: number | null
  opening_balance: string
  credit_limit: string | null
  statement_due_day: number | null
  is_active: boolean
}

export type ExpenseCategory = {
  id: number
  household: number
  key: string
  label: string
  icon: string
  is_builtin: boolean
}

export type SmsApiKey = {
  id: number
  household: number
  label: string
  token: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

export type ParsedSmsTransaction = {
  account?: string
  member?: string
  amount?: string
  direction?: 'inflow' | 'outflow' | ''
  transaction_type?: string
  tx_date?: string
  currency?: string
  fees?: string
  taxes?: string
  external_reference?: string
  classification?: TransactionClassification
  spend_category?: string
  merchant?: string
  description?: string
  notes?: string
  instrument?: string
  quantity?: string
}

export type SmsMessage = {
  id: number
  household: number
  owner: number | null
  sender: string
  body: string
  received_at: string
  status: 'pending' | 'approved' | 'rejected'
  template_key: string
  confidence: number | null
  parsed_tx: ParsedSmsTransaction
  imported_transaction_id: number | null
  created_at: string
  categories: string[]
}

export type UnmappedExpenseInfo = {
  count: number
  expenses: { id: number; tx_date: string; amount: string; spend_category: string; description: string }[]
}

export type TransactionClassification = 'spend' | 'income' | 'internal_transfer' | 'tracking' | ''

/** A manually-recorded enriched transaction (spend, income, transfer, or tracking entry). */
export type RecordedTransaction = {
  id: number
  household: number
  member: number | null
  account: number | null
  tx_date: string
  amount: string
  direction: 'inflow' | 'outflow'
  transaction_type: string
  classification: TransactionClassification
  spend_category: string
  description: string
  for_members: number[]
  notes: string
  source: string
  created_at?: string
  updated_at?: string
}

/** @deprecated Use RecordedTransaction instead. Kept for backwards compat during migration. */
export type Expense = RecordedTransaction & {
  expense_date: string
  category: string
  paid_by: number | null
  payment_account: number
}

export type SpendAnalytics = {
  by_month: { month: string; amount: number }[]
  by_category: { category: string; label: string; amount: number }[]
  by_member: { member_id: number | null; name: string; amount: number }[]
  by_month_category: { month: string; category: string; amount: number }[]
  total: number
  window: { start: string; end: string; months: number }
}

export type AccountBalance = {
  account_id: number
  account_name: string
  account_type: string
  opening_balance: number
  total_inflow: number
  total_outflow: number
  current_balance: number
  credit_limit?: number
  outstanding?: number
  available?: number | null
  statement_due_day?: number | null
}

export type CashWithdrawalResult = {
  withdrawal_id: number
  deposit_id: number
  amount: string
}

export type AccountOwnership = {
  id: number
  account: number
  member: number
  allocation_percent: string
}

export type AssetCategory = {
  id: number
  household: number
  name: string
  color: string
  icon_name: string
  sort_order: number
  instrument_count: number
}

export type CategoryBreakdownItem = {
  category_id: number | null
  category_name: string
  color: string
  icon_name: string
  market_value: string
  allocation_percent: string
}

export type Instrument = {
  id: number
  household: number
  asset_category: number | null
  default_account: number | null
  name: string
  instrument_type:
    | 'cash'
    | 'equity'
    | 'mutual_fund'
    | 'sip'
    | 'fd'
    | 'rd'
    | 'epf'
    | 'ppf'
    | 'nps'
    | 'real_estate'
    | 'gold'
    | 'vehicle'
    | 'liability'
    | 'insurance'
    | 'lending'
    | 'other'
  symbol: string
  metadata: Record<string, unknown>
  is_active: boolean
}

export type InstrumentOwnership = {
  id: number
  instrument: number
  member: number
  allocation_percent: string
}

export type Transaction = {
  id: number
  household: number
  member: number | null
  account: number | null
  instrument: number | null
  tx_date: string
  amount: string
  quantity: string | null
  price_per_unit: string | null
  fees: string
  taxes: string
  currency: string
  direction: 'inflow' | 'outflow'
  transaction_type:
    | 'deposit'
    | 'withdrawal'
    | 'buy'
    | 'sell'
    | 'dividend'
    | 'interest'
    | 'salary'
    | 'tax_payment'
    | 'tax_refund'
    | 'emi'
    | 'loan_disbursal'
    | 'premium'
    | 'other'
  source: 'manual' | 'csv' | 'api'
  external_reference: string
  idempotency_key: string
  metadata: Record<string, unknown>
  classification: TransactionClassification
  spend_category: string
  description: string
  for_members: number[]
  notes: string
  created_at?: string
  updated_at?: string
}

export type ValuationSnapshot = {
  id: number
  household: number
  valuation_date: string
  account: number | null
  instrument: number | null
  unit_price: string | null
  market_value: string | null
  balance: string
  source: 'manual' | 'csv' | 'api'
  notes: string
}

export type SIPMandate = {
  id: number
  household: number
  member: number | null
  account: number
  instrument: number
  expected_amount: string
  frequency: 'monthly' | 'quarterly'
  due_day: number
  start_date: string
  end_date: string | null
  grace_days: number
  is_active: boolean
}

export type TaxRecord = {
  id: number
  household: number
  member: number | null
  transaction_date: string
  financial_year: string
  record_type: 'paid' | 'tds' | 'refund'
  amount: string
  notes: string
}

export type TaxProjection = {
  id: number
  household: number
  member: number | null
  financial_year: string
  projected_total_income: string
  declared_deductions: string
  projected_tax: string
  notes: string
}

export type DashboardHolding = {
  instrument_id: number
  instrument_name: string
  instrument_type: string
  asset_category: number | null
  quantity: string
  market_value: string
  net_invested: string
}

export type MemberAccount = {
  account_id: number
  account_name: string
  account_type: string
  balance: string
  allocation_percent: string
}

export type DashboardAllocation = {
  instrument_type: string
  market_value: string
  allocation_percent: string
}

export type MissedSipAlert = {
  mandate_id: number
  instrument: string
  instrument_id: number
  account: string
  account_id: number
  due_date: string
  expected_amount: string
  grace_end: string
}

export type NetWorthPoint = {
  date: string
  networth: number
}

export type MemberNetWorth = {
  member_id: number
  member_name: string
  relation_type: string
  networth: string
  include_in_networth: boolean
}

export type DashboardPayload = {
  holdings: DashboardHolding[]
  allocation: DashboardAllocation[]
  networth: string
  xirr: number | null
  missedSip: MissedSipAlert[]
  networthHistory: NetWorthPoint[]
  categoryBreakdown: CategoryBreakdownItem[]
  membersNetworth: MemberNetWorth[]
}

export type FDDetails = {
  id: number
  instrument: number
  principal: string
  annual_rate: string
  investment_date: string
  maturity_date: string
  compounding: 'simple' | 'monthly' | 'quarterly' | 'half_yearly' | 'annually'
  maturity_value: string | null
}

export type MaturingFD = {
  instrument_id: number
  instrument_name: string
  instrument_type: string
  principal: string
  annual_rate: string
  investment_date: string
  maturity_date: string
  days_remaining: number
  total_tenure_days: number
  elapsed_days: number
  current_value: string
  maturity_value: string
}

export type BulkSnapshotResult = {
  as_of: string
  net_worth: number
  total_assets: number
  total_liabilities: number
  auto_computed: Array<{ name: string; type: string; value: number }>
  carried_forward: Array<{ name: string; type: string; value: number }>
  needs_manual: Array<{ name: string; type: string }>
}

export type ImportFieldDef = {
  key: string
  label: string
  type: 'string' | 'date' | 'decimal' | 'integer' | 'choice' | 'fk_account' | 'fk_member' | 'fk_instrument'
  choices?: string[]
  note?: string
}

export type ImportSchema = {
  label: string
  description: string
  required: ImportFieldDef[]
  optional: ImportFieldDef[]
  system_defaults: Record<string, string>
}

export type ImportPreviewResult = {
  columns: string[]
  preview: Record<string, string>[]
  total_rows: number
  all_rows: Record<string, string>[]
}

export type ImportApplyPayload = {
  household_id: number
  import_type: string
  rows: Record<string, string>[]
  mapping: Record<string, string | null>
  defaults: Record<string, string | number>
}

export type ImportRowError = {
  row: number
  reason: string
  data: Record<string, string>
}

export type ImportResult = {
  created: number
  skipped: number
  errors: ImportRowError[]
}

export type TransactionCorrectionInput = {
  originalTransactionId: number
  corrected: {
    household: number
    member?: number | null
    account: number
    instrument?: number
    tx_date: string
    amount: string
    quantity?: string
    price_per_unit?: string
    direction: 'inflow' | 'outflow'
    transaction_type: Transaction['transaction_type']
    external_reference?: string
    classification?: TransactionClassification
    spend_category?: string
    description?: string
    notes?: string
  }
}
