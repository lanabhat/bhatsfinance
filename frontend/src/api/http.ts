import type { ApiErrorMap, ApiListResponse } from '../types/domain'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
let csrfInitPromise: Promise<void> | null = null

export function toQueryString(params: Record<string, string | number | boolean | undefined>) {
  const url = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') {
      url.set(k, String(v))
    }
  })
  return url.toString()
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as ApiErrorMap
    return body
  } catch {
    return { detail: [`Request failed (${response.status})`] }
  }
}

function getCsrfTokenFromCookie() {
  const name = 'csrftoken='
  const parts = document.cookie.split(';')
  for (const rawPart of parts) {
    const part = rawPart.trim()
    if (part.startsWith(name)) {
      return decodeURIComponent(part.slice(name.length))
    }
  }
  return ''
}

async function ensureCsrfCookie() {
  if (getCsrfTokenFromCookie()) return
  if (!csrfInitPromise) {
    csrfInitPromise = fetch(`${API_BASE}/api/csrf/`, {
      method: 'GET',
      credentials: 'include',
    }).then(() => undefined).finally(() => {
      csrfInitPromise = null
    })
  }
  await csrfInitPromise
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' })
  if (!response.ok) {
    const err = await parseError(response)
    throw err
  }
  return response.json()
}

export async function postJson<T>(path: string, payload: unknown): Promise<T> {
  await ensureCsrfCookie()
  const csrfToken = getCsrfTokenFromCookie()
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const err = await parseError(response)
    throw err
  }
  return response.json()
}

export async function patchJson<T>(path: string, payload: unknown): Promise<T> {
  await ensureCsrfCookie()
  const csrfToken = getCsrfTokenFromCookie()
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const err = await parseError(response)
    throw err
  }
  return response.json()
}

export async function deleteJson(path: string, payload?: unknown): Promise<void> {
  await ensureCsrfCookie()
  const csrfToken = getCsrfTokenFromCookie()
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: payload
      ? { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken }
      : { 'X-CSRFToken': csrfToken },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  if (!response.ok && response.status !== 204) {
    const err = await parseError(response)
    throw err
  }
}

export async function deleteJsonResult<T>(path: string): Promise<T> {
  await ensureCsrfCookie()
  const csrfToken = getCsrfTokenFromCookie()
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-CSRFToken': csrfToken },
  })
  if (!response.ok) {
    const err = await parseError(response)
    throw err
  }
  return response.status === 204 ? ({} as T) : response.json()
}

export function unwrapList<T>(payload: ApiListResponse<T>): T[] {
  return Array.isArray(payload) ? payload : payload.results
}

export async function postJsonForBlob(path: string, payload: unknown): Promise<{ blob: Blob; filename: string }> {
  await ensureCsrfCookie()
  const csrfToken = getCsrfTokenFromCookie()
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const err = await parseError(response)
    throw err
  }
  const disposition = response.headers.get('Content-Disposition') || ''
  const match = /filename="?([^"]+)"?/.exec(disposition)
  const filename = match ? match[1] : 'statement'
  const blob = await response.blob()
  return { blob, filename }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
