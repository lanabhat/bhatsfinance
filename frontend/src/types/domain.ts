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
  risk_free_rate_percent: string
}

export type Member = {
  id: number
  household: number
  full_name: string
  email: string
  date_of_birth: string | null
  relation_type: 'self' | 'spouse' | 'child' | 'parent' | 'other'
  is_active: boolean
  include_in_networth: boolean
  photo: string
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
  affects_balance?: boolean
  spend_category?: string
  merchant?: string
  description?: string
  notes?: string
  instrument?: string
  quantity?: string
  tags?: number[]
}

export type SmsMessage = {
  id: number
  household: number
  owner: number | null
  sender: string
  body: string
  received_at: string
  device_id: string
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
  window: { start: string; end: string; months: number; granularity: 'day' | 'week' | 'month'; periods: number }
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
  include_in_rebalancing: boolean
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
  affects_balance: boolean
  spend_category: string
  description: string
  for_members: number[]
  tags: number[]
  notes: string
  created_at?: string
  updated_at?: string
}

export type Tag = {
  id: number
  household: number
  name: string
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

export type RDMandate = {
  id: number
  household: number
  member: number | null
  account: number
  instrument: number
  installment_amount: string
  frequency: 'monthly' | 'quarterly'
  due_day: number
  start_date: string
  tenure_months: number
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

export type MissedRDAlert = {
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
  photo: string
}

export type DashboardAccount = {
  account_id: number
  account_name: string
  account_type: string
  balance: string
}

export type DashboardPayload = {
  holdings: DashboardHolding[]
  allocation: DashboardAllocation[]
  networth: string
  xirr: number | null
  missedSip: MissedSipAlert[]
  missedRD: MissedRDAlert[]
  missedPremiums: MissedPremiumAlert[]
  networthHistory: NetWorthPoint[]
  categoryBreakdown: CategoryBreakdownItem[]
  membersNetworth: MemberNetWorth[]
  accounts: DashboardAccount[]
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

export type BondDetails = {
  id: number
  instrument: number
  issuer_name: string
  bond_type: 'government' | 'corporate' | 'tax_free' | 'sgb' | 'ncd' | 'other'
  isin: string
  face_value: string
  quantity: number
  coupon_rate: string
  coupon_frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'annual' | 'cumulative'
  investment_date: string
  maturity_date: string
  first_coupon_date: string | null
  grace_days: number
  maturity_value: string | null
  credit_rating: string
  notes: string
}

export type MaturingBond = {
  instrument_id: number
  instrument_name: string
  instrument_type: string
  issuer_name: string
  face_value: string
  quantity: number
  coupon_rate: string
  investment_date: string
  maturity_date: string
  days_remaining: number
  total_tenure_days: number
  elapsed_days: number
  maturity_value: string
  owners: MaturingFDOwner[]
}

export type BondCouponDue = {
  bond_id: number
  instrument_id: number
  instrument_name: string
  issuer_name: string
  due_date: string
  grace_end: string
  coupon_amount: string
}

export type MutualFundDetails = {
  id: number
  instrument: number
  amc: string
  fund_category: string
  fund_sub_category: string
  folio_no: string
  expense_ratio: string | null
}

export type AllocationTarget = {
  id: number
  household: number
  asset_category: number
  target_percent: string
}

export type RebalancingRow = {
  category_id: number | null
  category_name: string
  color: string
  current_value: string
  current_percent: string
  target_percent: string
  target_value: string
  drift_percent: string
  suggested_action: 'buy' | 'sell' | 'hold'
  suggested_amount: string
}

export type RebalancingPayload = {
  as_of: string
  total_portfolio_value: string
  excluded_value: string
  rows: RebalancingRow[]
}

export type MaturingFDOwner = {
  member_id: number
  member_name: string
  allocation_percent: string
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
  owners: MaturingFDOwner[]
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

export type InsurancePolicy = {
  id: number
  household: number
  member: number | null
  member_name: string | null
  nominee_name: string
  nominee_relation: string
  policy_type: 'life' | 'health' | 'vehicle' | 'govt_scheme' | 'other'
  policy_subtype: string
  policy_name: string
  policy_number: string
  insurer_name: string
  sum_insured: string | null
  premium_amount: string | null
  premium_frequency: 'annual' | 'half_yearly' | 'quarterly' | 'monthly' | 'single' | 'na'
  premium_due_day: number | null
  premium_due_month: number | null
  start_date: string
  maturity_date: string | null
  end_date: string | null
  grace_days: number
  is_active: boolean
  is_employer_paid: boolean
  account: number | null
  account_name: string | null
  notes: string
  is_family_floater: boolean
  covered_members: number[]
  covered_member_names: string[]
  vehicle_instrument: number | null
  vehicle_type: 'car' | 'two_wheeler' | 'other' | ''
  coverage_type: 'comprehensive' | 'third_party' | 'own_damage' | ''
  idv_amount: string | null
  ncb_percent: string | null
  add_on_covers: string
  vehicle_claims: VehicleClaim[]
  created_at: string
  updated_at: string
}

export type VehicleClaim = {
  id: number
  policy: number
  claim_date: string
  description: string
  claim_amount: string
  status: 'filed' | 'approved' | 'rejected' | 'settled'
  settled_amount: string | null
  notes: string
  created_at: string
  updated_at: string
}

export type MissedPremiumAlert = {
  policy_id: number
  policy_name: string
  policy_number: string
  insurer_name: string
  member_name: string | null
  due_date: string
  grace_end: string
  premium_amount: string
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
    tags?: number[]
    notes?: string
  }
}

export type InsuranceSummary = {
  total_active: number
  by_type: Record<string, number>
  total_sum_insured: string
  total_annual_premium: string
  upcoming_renewals: {
    policy_id: number
    policy_name: string
    policy_type: string
    insurer_name: string
    due_date: string
    premium_amount: string
  }[]
}

// ── Age-based allocation suggestion ─────────────────────────────────────────

export type AllocationSuggestionCategory = {
  category_id: number
  category_name: string
  color: string
  classification: 'equity' | 'debt' | 'mixed' | 'empty'
  suggested_target_percent: string | null
}

export type AllocationSuggestion = {
  age: number
  equity_base: number
  rule_label: string
  equity_percent: number
  debt_percent: number
  categories: AllocationSuggestionCategory[]
}

// ── Fund holdings upload / overlap-diversification ─────────────────────────

export type FundHolding = {
  id: number
  isin: string
  instrument_name: string
  industry: string
  weight_percent: string
}

export type FundHoldingsSnapshot = {
  id: number
  instrument: number
  as_of_date: string
  source_url: string
  uploaded_file_name: string
  holding_count: number
  holdings: FundHolding[]
}

export type OverlapPair = {
  instrument_a_id: number
  instrument_a_name: string
  instrument_b_id: number
  instrument_b_name: string
  overlap_percent: string
  shared_holdings: { isin: string; name: string; weight_a: string; weight_b: string; min_weight: string }[]
}

export type PortfolioTopHolding = {
  isin: string
  name: string
  portfolio_weight_percent: string
  via_funds: string[]
}

export type DiversificationPayload = {
  as_of: string
  pairs: OverlapPair[]
  top_holdings: PortfolioTopHolding[]
  covered_instrument_ids: number[]
  uncovered_instrument_ids: number[]
}

// ── Fund NAV / risk metrics (Sharpe, alpha, beta) ───────────────────────────

export type ExternalFund = {
  id: number
  instrument: number
  mfapi_scheme_code: string
  scheme_name: string
  fund_house: string
  last_synced_at: string | null
}

export type MfApiSearchResult = {
  schemeCode: number
  schemeName: string
}

export type FundRiskMetrics = {
  available: boolean
  reason?: string
  date_range?: { start: string; end: string }
  data_points?: number
  benchmark_name?: string
  risk_free_rate_percent?: string
  annualized_return_percent?: number
  standard_deviation_percent?: number
  beta?: number | null
  alpha_percent?: number | null
  sharpe_ratio?: number | null
}

export type BenchmarkPeriodComparison = {
  fund_cagr: number | null
  benchmark_cagr: number | null
  gap_percent: number | null
}

export type BenchmarkComparison = {
  available: boolean
  reason?: string
  benchmark_name?: string
  benchmark_category_match?: string
  periods?: { '1Y': BenchmarkPeriodComparison; '3Y': BenchmarkPeriodComparison; '5Y': BenchmarkPeriodComparison }
  underperforming?: boolean
}

export type FundComparisonRow = {
  instrument_id: number
  instrument_name: string
  fund_category: string
  expense_ratio: string | null
  xirr_percent: number | null
  max_overlap_percent: number
  linked_to_nav_source: boolean
  risk_metrics: FundRiskMetrics | null
  benchmark_comparison: BenchmarkComparison | null
}

export type FundComparisonPayload = {
  as_of: string
  rows: FundComparisonRow[]
}

export type CagrByPeriod = {
  '3M': number | null
  '6M': number | null
  '1Y': number | null
  '3Y': number | null
  '5Y': number | null
}

export type FundPerformanceRow = {
  instrument_id: number
  instrument_name: string
  fund_category: string
  fund_sub_category: string
  market_value: string
  net_invested: string
  allocation_percent: string
  xirr: number | null
  cagr: CagrByPeriod
}

export type FundPerformancePayload = {
  as_of: string
  funds: FundPerformanceRow[]
}

// ── AI-assisted insights (manual trigger, cached results) ──────────────────

export type FundClassification = {
  id: number
  instrument: number
  bucket: 'equity' | 'debt' | 'hybrid'
  rule_60_40_category: 'growth' | 'stability'
  reasoning: string
  model_used: string
  generated_at: string
}

export type FundClassificationProposal = {
  instrument_id: number
  instrument_name: string
  current_bucket?: 'equity' | 'debt' | 'hybrid' | null
  current_rule_60_40_category?: 'growth' | 'stability' | null
  bucket?: 'equity' | 'debt' | 'hybrid'
  rule_60_40_category?: 'growth' | 'stability'
  reasoning?: string
  error?: string
}

export type FundReturnsComparison = {
  id: number
  instrument: number
  summary: string
  input_snapshot: Record<string, unknown>
  model_used: string
  generated_at: string
}

export type RebalancingExplanation = {
  id: number
  household: number
  as_of_date: string
  explanation: string
  input_snapshot: Record<string, unknown>
  model_used: string
  generated_at: string
}
