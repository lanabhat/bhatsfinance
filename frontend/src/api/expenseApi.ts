import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ExpenseCategory, SpendAnalytics, Transaction, TransactionClassification, UnmappedExpenseInfo } from '../types/domain'

export type RecordTransactionPayload = {
  household: number
  member?: number | null
  account?: number | null
  tx_date: string
  amount: string
  direction: 'inflow' | 'outflow'
  transaction_type: string
  classification: TransactionClassification
  spend_category?: string
  description?: string
  for_members?: number[]
  notes?: string
  currency?: string
  fees?: string
  taxes?: string
}

export const expenseApi = {
  /** List all spend transactions for the household */
  listSpends: (householdId: number) =>
    getJson<Transaction[]>(`/api/transactions/?${toQueryString({ household: householdId, classification: 'spend' })}`).then(unwrapList),

  /** List all transactions for the household with a specific classification (or all if omitted) */
  listRecorded: (householdId: number, classification?: TransactionClassification) => {
    const params: Record<string, string | number | boolean | undefined> = { household: householdId }
    if (classification) params.classification = classification
    return getJson<Transaction[]>(`/api/transactions/?${toQueryString(params)}`).then(unwrapList)
  },

  /** Record a new transaction (spend / income / transfer / tracking) */
  createRecorded: (data: RecordTransactionPayload) =>
    postJson<Transaction>('/api/transactions/', data),

  fetchSpendAnalytics: (householdId: number, months: number = 12, classification?: string) =>
    getJson<SpendAnalytics>(`/api/spend-analytics?${toQueryString({ household_id: householdId, months, ...(classification ? { classification } : {}) })}`),

  listCategories: (householdId: number) =>
    getJson<ExpenseCategory[]>(`/api/expense-categories/?${toQueryString({ household: householdId })}`).then(unwrapList),

  createCategory: (data: Omit<ExpenseCategory, 'id' | 'is_builtin'>) =>
    postJson<ExpenseCategory>('/api/expense-categories/', data),

  updateCategory: (id: number, data: Pick<ExpenseCategory, 'label' | 'icon'>) =>
    patchJson<ExpenseCategory>(`/api/expense-categories/${id}/`, data),

  deleteCategory: (id: number, reassignTo: string) =>
    deleteJson(`/api/expense-categories/${id}/`, { reassign_to: reassignTo }),

  fetchUnmapped: (householdId: number) =>
    getJson<UnmappedExpenseInfo>(`/api/expense-categories/unmapped?${toQueryString({ household_id: householdId })}`),
}
