import { deleteJson, deleteJsonResult, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type {
  Account,
  AccountOwnership,
  ApiListResponse,
  BondDetails,
  FDDetails,
  Instrument,
  InstrumentOwnership,
  MutualFundDetails,
} from '../types/domain'

export const portfolioApi = {
  async listAccounts(householdId: number) {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<Account>>(`/api/accounts/?${q}`)
    return unwrapList(data)
  },
  async createAccount(payload: Omit<Account, 'id'>) {
    return postJson<Account>('/api/accounts/', payload)
  },
  async updateAccount(id: number, payload: Partial<Omit<Account, 'id'>>) {
    return patchJson<Account>(`/api/accounts/${id}/`, payload)
  },
  async listAccountOwnerships(accountId?: number, householdId?: number) {
    const q = toQueryString({ account: accountId, household: householdId })
    const data = await getJson<ApiListResponse<AccountOwnership>>(`/api/account-ownerships/?${q}`)
    return unwrapList(data)
  },
  async createAccountOwnership(payload: Omit<AccountOwnership, 'id'>) {
    return postJson<AccountOwnership>('/api/account-ownerships/', payload)
  },
  async updateAccountOwnership(id: number, payload: Partial<Omit<AccountOwnership, 'id'>>) {
    return patchJson<AccountOwnership>(`/api/account-ownerships/${id}/`, payload)
  },
  async listInstruments(householdId: number) {
    const q = toQueryString({ household: householdId, page_size: 200 })
    const data = await getJson<ApiListResponse<Instrument>>(`/api/instruments/?${q}`)
    return unwrapList(data)
  },
  async createInstrument(payload: Omit<Instrument, 'id'>) {
    return postJson<Instrument>('/api/instruments/', payload)
  },
  async updateInstrument(id: number, payload: Partial<Omit<Instrument, 'id'>>) {
    return patchJson<Instrument>(`/api/instruments/${id}/`, payload)
  },
  async listInstrumentOwnerships(instrumentId?: number, pageSize?: number) {
    const q = toQueryString({ instrument: instrumentId, page_size: pageSize })
    const data = await getJson<ApiListResponse<InstrumentOwnership>>(`/api/instrument-ownerships/?${q}`)
    return unwrapList(data)
  },
  async createInstrumentOwnership(payload: Omit<InstrumentOwnership, 'id'>) {
    return postJson<InstrumentOwnership>('/api/instrument-ownerships/', payload)
  },
  async updateInstrumentOwnership(id: number, payload: Partial<Omit<InstrumentOwnership, 'id'>>) {
    return patchJson<InstrumentOwnership>(`/api/instrument-ownerships/${id}/`, payload)
  },
  async deleteAccount(id: number) { return deleteJson(`/api/accounts/${id}/`) },
  async deleteInstrument(id: number) { return deleteJson(`/api/instruments/${id}/`) },
  async bulkDeleteInstruments(householdId: number, instrumentTypes: string[]) {
    const q = new URLSearchParams({ household_id: String(householdId) })
    for (const t of instrumentTypes) q.append('instrument_type', t)
    return deleteJsonResult<{ deleted: number }>(`/api/instruments/bulk-delete/?${q.toString()}`)
  },
  async deleteAccountOwnership(id: number) { return deleteJson(`/api/account-ownerships/${id}/`) },
  async deleteInstrumentOwnership(id: number) { return deleteJson(`/api/instrument-ownerships/${id}/`) },
  async getFDDetails(instrumentId: number) {
    const q = toQueryString({ instrument: instrumentId })
    const data = await getJson<ApiListResponse<FDDetails>>(`/api/fd-details/?${q}`)
    return unwrapList(data)[0] ?? null
  },
  async createFDDetails(payload: Omit<FDDetails, 'id'>) {
    return postJson<FDDetails>('/api/fd-details/', payload)
  },
  async updateFDDetails(id: number, payload: Partial<Omit<FDDetails, 'id'>>) {
    return patchJson<FDDetails>(`/api/fd-details/${id}/`, payload)
  },
  async getBondDetails(instrumentId: number) {
    const q = toQueryString({ instrument: instrumentId })
    const data = await getJson<ApiListResponse<BondDetails>>(`/api/bond-details/?${q}`)
    return unwrapList(data)[0] ?? null
  },
  async createBondDetails(payload: Omit<BondDetails, 'id'>) {
    return postJson<BondDetails>('/api/bond-details/', payload)
  },
  async updateBondDetails(id: number, payload: Partial<Omit<BondDetails, 'id'>>) {
    return patchJson<BondDetails>(`/api/bond-details/${id}/`, payload)
  },
  async listMutualFundDetails() {
    const q = toQueryString({ page_size: 500 })
    const data = await getJson<ApiListResponse<MutualFundDetails>>(`/api/mf-details/?${q}`)
    return unwrapList(data)
  },
  async getMutualFundDetails(instrumentId: number) {
    const q = toQueryString({ instrument: instrumentId })
    const data = await getJson<ApiListResponse<MutualFundDetails>>(`/api/mf-details/?${q}`)
    return unwrapList(data)[0] ?? null
  },
  async createMutualFundDetails(payload: Omit<MutualFundDetails, 'id'>) {
    return postJson<MutualFundDetails>('/api/mf-details/', payload)
  },
  async updateMutualFundDetails(id: number, payload: Partial<Omit<MutualFundDetails, 'id'>>) {
    return patchJson<MutualFundDetails>(`/api/mf-details/${id}/`, payload)
  },
  async bulkUpdateInstrumentCategory(instrumentIds: number[], assetCategoryId: number | null) {
    return patchJson<{ updated: number }>('/api/instruments/bulk-update-category/', {
      instrument_ids: instrumentIds,
      asset_category: assetCategoryId,
    })
  },
}
