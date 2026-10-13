import type { ApiErrorMap } from '../types/domain'

export function normalizeApiError(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message

  const map = error as ApiErrorMap
  const firstKey = Object.keys(map)[0]
  if (!firstKey) return 'Request failed'
  const val = map[firstKey]
  if (Array.isArray(val)) return `${firstKey}: ${val.join(', ')}`
  return `${firstKey}: ${String(val)}`
}

/**
 * The message to show for a failed call, from whichever shape the server used —
 * `{ error }`, `{ detail }` (string or list), a field error like `{ balance: ["…"] }`,
 * or a thrown Error — else `fallback`.
 */
export function apiErrorText(error: unknown, fallback: string): string {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message || fallback
  if (typeof error !== 'object') return fallback
  const body = error as Record<string, unknown>
  if (typeof body.error === 'string' && body.error) return body.error
  const first = (v: unknown) => (Array.isArray(v) ? (v.length ? String(v[0]) : '') : typeof v === 'string' ? v : '')
  return first(body.detail) || first(Object.values(body)[0]) || fallback
}
