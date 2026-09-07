import { getJson, toQueryString } from './http'
import type { FundPerformancePayload } from '../types/domain'

export const fundPerformanceApi = {
  get: (householdId: number, asOf: string): Promise<FundPerformancePayload> =>
    getJson(`/api/fund-performance?${toQueryString({ household_id: householdId, as_of: asOf })}`),
}
