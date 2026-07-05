import { deleteJson, getJson, postJson, toQueryString, unwrapList } from './http'
import type { Tag } from '../types/domain'

export const tagApi = {
  list: (householdId: number) =>
    getJson<Tag[]>(`/api/tags/?${toQueryString({ household: householdId })}`).then(unwrapList),

  create: (data: { household: number; name: string }) =>
    postJson<Tag>('/api/tags/', data),

  delete: (id: number) => deleteJson(`/api/tags/${id}/`),

  /** Find an existing tag by (case-insensitive) name, or create it. Used by
   * "type to create" tag pickers so the same tag isn't duplicated with
   * different casing. */
  async findOrCreate(householdId: number, name: string, existing: Tag[]): Promise<Tag> {
    const trimmed = name.trim()
    const match = existing.find(t => t.name.toLowerCase() === trimmed.toLowerCase())
    if (match) return match
    return this.create({ household: householdId, name: trimmed })
  },
}
