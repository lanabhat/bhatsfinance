import { getJson as httpGet, postJson as httpPost } from './http'
import type { ImportApplyPayload, ImportPreviewResult, ImportResult, ImportSchema } from '../types/domain'

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
}
