import { deleteJson, getJson, postJson, patchJson, toQueryString, unwrapList } from './http'
import type { ApiListResponse, AssetCategory } from '../types/domain'

type CategoryPayload = Omit<AssetCategory, 'id' | 'instrument_count' | 'created_at' | 'updated_at'>

export const assetCategoryApi = {
  list: async (householdId: number): Promise<AssetCategory[]> => {
    const q = toQueryString({ household: householdId })
    const data = await getJson<ApiListResponse<AssetCategory>>(`/api/asset-categories/?${q}`)
    return unwrapList(data)
  },

  create: (payload: CategoryPayload): Promise<AssetCategory> =>
    postJson('/api/asset-categories/', payload),

  update: (id: number, payload: Partial<CategoryPayload>): Promise<AssetCategory> =>
    patchJson(`/api/asset-categories/${id}/`, payload),

  delete: (id: number): Promise<void> =>
    deleteJson(`/api/asset-categories/${id}/`),
}
