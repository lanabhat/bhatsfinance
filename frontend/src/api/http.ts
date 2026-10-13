import type { ApiErrorMap, ApiListResponse } from '../types/domain'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
let csrfInitPromise: Promise<void> | null = null

/** Per-call options. `signal` cancels the request (e.g. when a page unmounts or its inputs change). */
export type RequestOptions = { signal?: AbortSignal }

export function toQueryString(params: Record<string, string | number | boolean | undefined>) {
  const url = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') {
      url.set(k, String(v))
    }
  })
  return url.toString()
}

async function parseError(response: Response): Promise<ApiErrorMap> {
  try {
    return (await response.json()) as ApiErrorMap
  } catch {
    return { detail: [`Request failed (${response.status})`] }
  }
}

export function getCsrfTokenFromCookie() {
  const name = 'csrftoken='
  for (const rawPart of document.cookie.split(';')) {
    const part = rawPart.trim()
    if (part.startsWith(name)) return decodeURIComponent(part.slice(name.length))
  }
  return ''
}

/** Make sure Django has set the csrftoken cookie (GET /api/csrf/), once at a time. */
export async function ensureCsrfCookie() {
  if (getCsrfTokenFromCookie()) return
  if (!csrfInitPromise) {
    csrfInitPromise = fetch(`${API_BASE}/api/csrf/`, { method: 'GET', credentials: 'include' })
      .then(() => undefined)
      .finally(() => { csrfInitPromise = null })
  }
  await csrfInitPromise
}

type Body = { json?: unknown; form?: FormData }

/**
 * Every API call goes through here: session cookie on every request, CSRF token on
 * every write, and a non-2xx response thrown as the server's error body (ApiErrorMap).
 */
async function request(method: string, path: string, body: Body = {}, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {}
  if (method !== 'GET') {
    await ensureCsrfCookie()
    headers['X-CSRFToken'] = getCsrfTokenFromCookie()
  }
  let payload: BodyInit | undefined
  if (body.form) {
    payload = body.form  // the browser sets the multipart boundary itself
  } else if (body.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body.json)
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method, credentials: 'include', headers, body: payload, signal: options.signal,
  })
  if (!response.ok) throw await parseError(response)
  return response
}

const jsonOrEmpty = async <T>(response: Response): Promise<T> =>
  (response.status === 204 ? {} : await response.json()) as T

export async function getJson<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await request('GET', path, {}, options)).json()
}

export async function postJson<T>(path: string, payload: unknown, options?: RequestOptions): Promise<T> {
  return jsonOrEmpty<T>(await request('POST', path, { json: payload }, options))
}

/** POST multipart form data (file uploads). */
export async function postForm<T>(path: string, form: FormData, options?: RequestOptions): Promise<T> {
  return jsonOrEmpty<T>(await request('POST', path, { form }, options))
}

export async function patchJson<T>(path: string, payload: unknown, options?: RequestOptions): Promise<T> {
  return jsonOrEmpty<T>(await request('PATCH', path, { json: payload }, options))
}

export async function deleteJson(path: string, payload?: unknown, options?: RequestOptions): Promise<void> {
  await request('DELETE', path, payload === undefined ? {} : { json: payload }, options)
}

export async function deleteJsonResult<T>(path: string, options?: RequestOptions): Promise<T> {
  return jsonOrEmpty<T>(await request('DELETE', path, {}, options))
}

export function unwrapList<T>(payload: ApiListResponse<T>): T[] {
  return Array.isArray(payload) ? payload : payload.results
}

export async function postJsonForBlob(path: string, payload: unknown): Promise<{ blob: Blob; filename: string }> {
  const response = await request('POST', path, { json: payload })
  const disposition = response.headers.get('Content-Disposition') || ''
  const match = /filename="?([^"]+)"?/.exec(disposition)
  return { blob: await response.blob(), filename: match ? match[1] : 'statement' }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
