import { deleteJson, getJson, postJson, toQueryString, unwrapList } from './http'
import type { Tag } from '../types/domain'

export const tagApi = {
  list: (householdId: number) =>
    getJson<Tag[]>(`/api/tags/?${toQueryString({ household: householdId })}`).then(unwrapList),

  create: (data: { household: number; name: string }) =>
    postJson<Tag>('/api/tags/', data),

  delete: (id: number) => deleteJson(`/api/tags/${id}/`),

  /** Delete every currently-unused tag for the household in one sweep. */
  cleanup: (householdId: number) =>
    postJson<{ deleted: number }>('/api/tags/cleanup/', { household: householdId }),

  /** Find an existing tag by (case-insensitive) name, or create it. Used by
   * "type to create" tag pickers so the same tag isn't duplicated with
   * different casing. Strips any leading '#' the user may have typed —
   * tags are displayed with a '#' prefix but stored without one, so
   * "#groceries" and "groceries" resolve to the same tag. */
  async findOrCreate(householdId: number, name: string, existing: Tag[]): Promise<Tag> {
    const trimmed = name.trim().replace(/^#+/, '').trim()
    const match = existing.find(t => t.name.toLowerCase() === trimmed.toLowerCase())
    if (match) return match
    return this.create({ household: householdId, name: trimmed })
  },
}
