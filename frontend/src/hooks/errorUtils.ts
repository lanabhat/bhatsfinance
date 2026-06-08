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
