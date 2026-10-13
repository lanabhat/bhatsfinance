// Display labels for API enum values, shared so every page names things the same way.
// Instrument types live in ./instrumentTypes.

/** Ledger transaction_type → label. */
export const TX_TYPE_LABELS: Record<string, string> = {
  deposit: 'Deposit', withdrawal: 'Withdrawal', buy: 'Buy', sell: 'Sell',
  dividend: 'Dividend', interest: 'Interest', salary: 'Salary',
  tax_payment: 'Tax Payment', tax_refund: 'Tax Refund', emi: 'EMI',
  loan_disbursal: 'Loan Disbursal', premium: 'Premium', cc_bill_payment: 'CC Bill Payment', other: 'Other',
}

/** Account.account_type → label. */
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: 'Bank Account', broker: 'Broker', pf: 'PF', loan: 'Loan',
  credit_card: 'Credit Card', insurance: 'Insurance', cash: 'Cash', other: 'Other',
}

/** Instrument.sub_category (asset class) → label. */
export const SUB_CATEGORY_LABELS: Record<string, string> = {
  debt: 'Debt', equity: 'Equity', liquid: 'Liquid', retirement: 'Retirement',
  hybrid: 'Hybrid', gold: 'Gold', real_asset: 'Real Asset', other: 'Other',
}

/** AI fund classification bucket and allocation rule (ai_insights.FundClassification). */
export const FUND_BUCKET_LABELS: Record<string, string> = { equity: 'Equity', debt: 'Debt', hybrid: 'Hybrid' }
export const ALLOCATION_RULE_LABELS: Record<string, string> = { growth: 'Growth (60%)', stability: 'Stability (40%)' }
