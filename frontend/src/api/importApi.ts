import { getJson as httpGet, postJson as httpPost } from './http'
import type { ImportApplyPayload, ImportPreviewResult, ImportResult, ImportSchema } from '../types/domain'

export type GrowwMemberPreview = { id: number; name: string; relation?: string }
export type GrowwFilePreview = {
  filename: string
  source?: 'groww' | 'upstox'
  investor_name: string
  valuation_date: string
  stocks_count: number
  mf_count: number
  holdings_count?: number
  matched_member: { id: number; name: string; relation?: string; confidence: number } | null
  members: GrowwMemberPreview[]
  error?: string
}
export type GrowwFileResult = {
  filename: string
  member_name: string
  investor_name: string
  stocks_created: number
  mf_created: number
  valuations_created: number
  errors: { section: string; row: number; name: string; reason: string }[]
  error?: string
}

const BASE = '/api'

async function getCsrf(): Promise<string> {
  const name = 'csrftoken='
  for (const part of document.cookie.split(';')) {
    const p = part.trim()
    if (p.startsWith(name)) return decodeURIComponent(p.slice(name.length))
  }
  // fetch the CSRF cookie if not yet set
  await fetch(`${BASE}/csrf/`, { credentials: 'include' })
  for (const part of document.cookie.split(';')) {
    const p = part.trim()
    if (p.startsWith(name)) return decodeURIComponent(p.slice(name.length))
  }
  return ''
}

async function postForm<T>(url: string, formData: FormData): Promise<T> {
  const csrf = await getCsrf()
  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: { 'X-CSRFToken': csrf },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const importApi = {
  previewFile: async (file: File): Promise<ImportPreviewResult> => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const fileType = ext === 'xlsx' || ext === 'xls' ? 'excel' : ext
    const fd = new FormData()
    fd.append('file', file)
    fd.append('file_type', fileType)
    return postForm<ImportPreviewResult>(`${BASE}/imports/preview`, fd)
  },

  getSchemas: (): Promise<Record<string, ImportSchema>> =>
    httpGet(`${BASE}/imports/schemas`),

  applyImport: (payload: ImportApplyPayload): Promise<ImportResult> =>
    httpPost(`${BASE}/imports/apply`, payload),

  previewGrowwFiles: async (householdId: number, files: File[]): Promise<GrowwFilePreview[]> => {
    const fd = new FormData()
    fd.append('household_id', String(householdId))
    for (const f of files) fd.append('files', f)
    return postForm<GrowwFilePreview[]>(`${BASE}/imports/groww-preview`, fd)
  },

  applyGrowwImport: async (
    householdId: number,
    files: File[],
    assignments: { filename: string; member_id: number }[],
  ): Promise<GrowwFileResult[]> => {
    const fd = new FormData()
    fd.append('household_id', String(householdId))
    fd.append('assignments', JSON.stringify(assignments))
    for (const f of files) fd.append('files', f)
    return postForm<GrowwFileResult[]>(`${BASE}/imports/groww-apply`, fd)
  },
}
