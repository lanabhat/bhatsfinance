import { getJson, toQueryString } from './http'
import type { DiversificationPayload, FundHoldingsSnapshot } from '../types/domain'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
let csrfInitPromise: Promise<void> | null = null

function getCsrfTokenFromCookie() {
  const name = 'csrftoken='
  for (const rawPart of document.cookie.split(';')) {
    const part = rawPart.trim()
    if (part.startsWith(name)) return decodeURIComponent(part.slice(name.length))
  }
  return ''
}

async function ensureCsrfCookie() {
  if (getCsrfTokenFromCookie()) return
  if (!csrfInitPromise) {
    csrfInitPromise = fetch(`${API_BASE}/api/csrf/`, { method: 'GET', credentials: 'include' })
      .then(() => undefined)
      .finally(() => { csrfInitPromise = null })
  }
  await csrfInitPromise
}

export const diversificationApi = {
  get: (householdId: number, asOf: string): Promise<DiversificationPayload> => {
    const q = toQueryString({ household_id: householdId, as_of: asOf })
    return getJson(`/api/diversification?${q}`)
  },

  uploadHoldings: async (
    instrumentId: number,
    file: File,
    asOfDate?: string,
    sourceUrl?: string,
  ): Promise<FundHoldingsSnapshot> => {
    await ensureCsrfCookie()
    const fd = new FormData()
    fd.append('file', file)
    if (asOfDate) fd.append('as_of_date', asOfDate)
    if (sourceUrl) fd.append('source_url', sourceUrl)
    const response = await fetch(`${API_BASE}/api/instruments/${instrumentId}/upload-holdings/`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers: { 'X-CSRFToken': getCsrfTokenFromCookie() },
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: `Request failed (${response.status})` }))
      throw err
    }
    return response.json()
  },
}
