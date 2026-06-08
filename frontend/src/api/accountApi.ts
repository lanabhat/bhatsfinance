import { getJson, postJson } from './http'
import type { AccountBalance, CashWithdrawalResult } from '../types/domain'

export const accountApi = {
  getBalance: (accountId: number) =>
    getJson<AccountBalance>(`/api/accounts/${accountId}/balance/`),

  cashWithdrawal: (data: { source_account: number; cash_account: number; amount: string; date: string; household: number; reason?: string }) =>
    postJson<CashWithdrawalResult>('/api/cash-withdrawal/', data),
}
