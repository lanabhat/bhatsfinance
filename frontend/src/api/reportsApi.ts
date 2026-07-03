import { downloadBlob, postJson, postJsonForBlob } from './http'

export type StatementTransaction = {
  id: number
  tx_date: string
  description: string
  direction: 'inflow' | 'outflow'
  transaction_type: string
  amount: string
}

export type StatementAccountPreview = {
  account_id: number
  account_name: string
  institution_name: string
  current_balance: string
  transactions: StatementTransaction[]
}

export type StatementPreviewResponse = {
  accounts: StatementAccountPreview[]
}

export const reportsApi = {
  previewStatement: (payload: {
    household_id: number
    account_ids: number[]
    start_date: string
    end_date: string
  }): Promise<StatementPreviewResponse> =>
    postJson('/api/reports/statement-preview', payload),

  exportStatement: async (payload: {
    household_id: number
    account_ids: number[]
    start_date: string
    end_date: string
    excluded_transaction_ids: Record<number, number[]>
    opening_balance_overrides: Record<number, string>
    format: 'pdf' | 'xlsx'
  }): Promise<void> => {
    const { blob, filename } = await postJsonForBlob('/api/reports/statement-export', payload)
    downloadBlob(blob, filename)
  },
}
