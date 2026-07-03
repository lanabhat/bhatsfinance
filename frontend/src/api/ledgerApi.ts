import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, DashboardAccount, DashboardPayload, Transaction, TransactionCorrectionInput } from '../types/domain'

type TransactionCreatePayload = Omit<
  Transaction,
  'id' | 'source' | 'classification' | 'spend_category' | 'description' | 'for_members' | 'notes'
> &
  Partial<Pick<Transaction, 'classification' | 'spend_category' | 'description' | 'for_members' | 'notes'>>

export const ledgerApi = {
  async listTransactions(householdId: number) {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<Transaction>>(`/api/transactions/?${q}`)
    return unwrapList(data)
  },
  async listTransactionsForInstrument(householdId: number, instrumentId: number) {
    const q = toQueryString({ household: householdId, instrument: instrumentId })
    const data = await getJson<ApiListResponse<Transaction>>(`/api/transactions/?${q}`)
    return unwrapList(data)
  },
  async listTransactionsForAccount(householdId: number, accountId: number) {
    const q = toQueryString({ household: householdId, account: accountId })
    const data = await getJson<ApiListResponse<Transaction>>(`/api/transactions/?${q}`)
    return unwrapList(data)
  },
  async createTransaction(payload: TransactionCreatePayload) {
    return postJson<Transaction>('/api/transactions/', { ...payload, source: 'manual' })
  },
  async updateTransaction(id: number, payload: Partial<Omit<Transaction, 'id' | 'source'>>) {
    return patchJson<Transaction>(`/api/transactions/${id}/`, payload)
  },
  async correctTransaction(input: TransactionCorrectionInput) {
    const transactions = await this.listTransactions(input.corrected.household)
    const original = transactions.find((item) => item.id === input.originalTransactionId)
    if (!original) {
      throw { detail: ['Original transaction not found for correction.'] }
    }

    const reverseDirection = original.direction === 'inflow' ? 'outflow' : 'inflow'

    await this.createTransaction({
      household: original.household,
      member: original.member,
      account: original.account,
      instrument: original.instrument,
      tx_date: input.corrected.tx_date,
      amount: original.amount,
      quantity: original.quantity || null,
      price_per_unit: original.price_per_unit || null,
      fees: original.fees,
      taxes: original.taxes,
      currency: original.currency,
      direction: reverseDirection,
      transaction_type: original.transaction_type,
      external_reference: `Correction reverse of #${original.id}`,
      idempotency_key: `correction-reverse-${original.id}-${Date.now()}`,
      metadata: {},
    })

    await this.createTransaction({
      household: input.corrected.household,
      member: input.corrected.member ?? null,
      account: input.corrected.account,
      instrument: input.corrected.instrument ?? null,
      tx_date: input.corrected.tx_date,
      amount: input.corrected.amount,
      quantity: input.corrected.quantity || null,
      price_per_unit: input.corrected.price_per_unit || null,
      fees: original.fees,
      taxes: original.taxes,
      currency: original.currency,
      direction: input.corrected.direction,
      transaction_type: input.corrected.transaction_type,
      external_reference: input.corrected.external_reference || `Correction replace of #${original.id}`,
      idempotency_key: `correction-replace-${original.id}-${Date.now()}`,
      metadata: { corrected_from: original.id },
      classification: input.corrected.classification ?? original.classification,
      spend_category: input.corrected.spend_category ?? original.spend_category,
      description: input.corrected.description ?? original.description,
      notes: input.corrected.notes ?? original.notes,
    })
  },
  async deleteTransaction(id: number) { return deleteJson(`/api/transactions/${id}/`) },
  async fetchDashboard(householdId: number, asOf: string): Promise<DashboardPayload> {
    const q = toQueryString({ household_id: householdId, as_of: asOf })
    const [holdings, networth, allocation, xirr, missed, missedRD, missedPremiums, history, catBreakdown, membersNw, accts] = await Promise.all([
      getJson<{ holdings: DashboardPayload['holdings'] }>(`/api/holdings?${q}`),
      getJson<{ networth: string }>(`/api/networth?${q}`),
      getJson<{ allocation: DashboardPayload['allocation'] }>(`/api/allocation?${q}`),
      getJson<{ xirr: number | null }>(`/api/xirr?${q}`),
      getJson<{ missed: DashboardPayload['missedSip'] }>(`/api/alerts/missed-sip?${q}`),
      getJson<{ missed: DashboardPayload['missedRD'] }>(`/api/alerts/missed-rd-installments?${q}`),
      getJson<{ missed: DashboardPayload['missedPremiums'] }>(`/api/alerts/missed-premiums?${q}`),
      getJson<{ history: DashboardPayload['networthHistory'] }>(`/api/networth/history?${q}`),
      getJson<{ breakdown: DashboardPayload['categoryBreakdown'] }>(`/api/category-breakdown?${q}`),
      getJson<{ members: DashboardPayload['membersNetworth'] }>(`/api/members-networth?${q}`),
      getJson<{ accounts: DashboardAccount[] }>(`/api/household-accounts?${q}`),
    ])

    return {
      holdings: holdings.holdings,
      networth: networth.networth,
      allocation: allocation.allocation,
      xirr: xirr.xirr,
      missedSip: missed.missed,
      missedRD: missedRD.missed,
      missedPremiums: missedPremiums.missed,
      networthHistory: history.history,
      categoryBreakdown: catBreakdown.breakdown,
      membersNetworth: membersNw.members,
      accounts: accts.accounts,
    }
  },
}
