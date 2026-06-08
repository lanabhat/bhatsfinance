import { deleteJson, getJson, patchJson, postJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, BulkSnapshotResult, FDDetails, MaturingFD } from '../types/domain'

export const fdDetailsApi = {
  async list(instrumentId?: number) {
    const q = toQueryString({ instrument: instrumentId })
    const data = await getJson<ApiListResponse<FDDetails>>(`/api/fd-details/?${q}`)
    return unwrapList(data)
  },
  async create(payload: Omit<FDDetails, 'id'>) {
    return postJson<FDDetails>('/api/fd-details/', payload)
  },
  async update(id: number, payload: Partial<Omit<FDDetails, 'id'>>) {
    return patchJson<FDDetails>(`/api/fd-details/${id}/`, payload)
  },
  async deleteFDDetails(id: number) { return deleteJson(`/api/fd-details/${id}/`) },
  async bulkSnapshot(householdId: number, asOf: string): Promise<BulkSnapshotResult> {
    return postJson<BulkSnapshotResult>('/api/valuations/bulk-snapshot', { household_id: householdId, as_of: asOf })
  },
  async listMaturing(householdId: number, days = 180): Promise<MaturingFD[]> {
    const q = toQueryString({ household_id: householdId, days })
    const data = await getJson<{ maturing: MaturingFD[] }>(`/api/fd-details/maturing?${q}`)
    return data.maturing
  },
}
