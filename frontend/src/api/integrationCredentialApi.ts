import { deleteJson, getJson, patchJson, postJson, unwrapList } from './http'
import type { ApiListResponse } from '../types/domain'

export type IntegrationCredential = {
  id: number
  key: string
  scope: 'global' | 'household' | 'user'
  household: number | null
  user: number | null
  description: string
  has_value: boolean
  created_at: string
  updated_at: string
}

type CredentialPayload = {
  key: string
  scope: IntegrationCredential['scope']
  household?: number | null
  user?: number | null
  description?: string
  value: string
}

export const integrationCredentialApi = {
  list: async (): Promise<IntegrationCredential[]> => {
    const data = await getJson<ApiListResponse<IntegrationCredential>>('/api/admin/integration-credentials/')
    return unwrapList(data)
  },

  create: (payload: CredentialPayload): Promise<IntegrationCredential> =>
    postJson('/api/admin/integration-credentials/', payload),

  update: (id: number, payload: Partial<CredentialPayload>): Promise<IntegrationCredential> =>
    patchJson(`/api/admin/integration-credentials/${id}/`, payload),

  delete: (id: number): Promise<void> =>
    deleteJson(`/api/admin/integration-credentials/${id}/`),
}
