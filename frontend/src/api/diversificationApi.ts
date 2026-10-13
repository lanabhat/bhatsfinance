import { getJson, postForm, toQueryString } from './http'
import type { DiversificationPayload, FundHoldingsSnapshot } from '../types/domain'

export const diversificationApi = {
  get: (householdId: number, asOf: string): Promise<DiversificationPayload> => {
    const q = toQueryString({ household_id: householdId, as_of: asOf })
    return getJson(`/api/diversification?${q}`)
  },

  uploadHoldings: (
    instrumentId: number,
    file: File,
    asOfDate?: string,
    sourceUrl?: string,
  ): Promise<FundHoldingsSnapshot> => {
    const fd = new FormData()
    fd.append('file', file)
    if (asOfDate) fd.append('as_of_date', asOfDate)
    if (sourceUrl) fd.append('source_url', sourceUrl)
    return postForm<FundHoldingsSnapshot>(`/api/instruments/${instrumentId}/upload-holdings/`, fd)
  },
}
