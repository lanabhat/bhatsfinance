import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type {
  Account,
  AccountOwnership,
  ApiListResponse,
  Instrument,
  InstrumentOwnership,
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
  async deleteAccountOwnership(id: number) { return deleteJson(`/api/account-ownerships/${id}/`) },
  async deleteInstrumentOwnership(id: number) { return deleteJson(`/api/instrument-ownerships/${id}/`) },
}
