import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, Investment } from '../types/domain'

export const investmentApi = {
  async listInvestments(params: { household?: number; instrument?: number; member?: number; is_active?: boolean }) {
    const q = toQueryString({ ...params, page_size: 500 })
    const data = await getJson<ApiListResponse<Investment>>(`/api/investments/?${q}`)
    return unwrapList(data)
  },
  async getInvestment(id: number) {
    return getJson<Investment>(`/api/investments/${id}/`)
  },
  async createInvestment(payload: Omit<Investment, 'id'>) {
    return postJson<Investment>('/api/investments/', payload)
  },
  async updateInvestment(id: number, payload: Partial<Omit<Investment, 'id'>>) {
    return patchJson<Investment>(`/api/investments/${id}/`, payload)
  },
  async deleteInvestment(id: number) {
    return deleteJson(`/api/investments/${id}/`)
  },
  /** Delete the fund/stock along with its transactions and valuations. */
  async purgeInvestment(id: number) {
    return postJson<{ transactions_deleted: number; valuations_deleted: number }>(`/api/investments/${id}/purge/`, {})
  },
  /** Get-or-create the household's shared MF/SIP shell Instrument plus an
   * Investment under it for the given fund name/folio — one round trip for
   * "record a mutual fund buy" instead of separately resolving the shell. */
  async getOrCreateMfInvestment(payload: {
    household: number
    name: string
    folio_no?: string
    member?: number | null
    symbol?: string
    isin?: string
    /** 'mutual_fund' (default), 'equity' or 'etf' — routes to the matching shared shell. */
    instrument_type?: string
  }) {
    return postJson<Investment>('/api/instruments/mf-investment/', payload)
  },
}
