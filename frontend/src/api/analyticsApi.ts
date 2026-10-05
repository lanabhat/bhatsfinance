import { getJson, toQueryString } from './http'

export type HoldingsTrendPoint = { date: string; invested: number; current: number }

export async function fetchHoldingsHistory(
  householdId: number,
  instrumentType?: string | null,
  memberId?: number | null,
): Promise<HoldingsTrendPoint[]> {
  const params: Record<string, string | number | boolean | undefined> = { household_id: householdId }
  if (instrumentType) params.instrument_type = instrumentType
  if (memberId) params.member_id = memberId
  const res = await getJson<{ history: HoldingsTrendPoint[] }>(`/api/holdings/history?${toQueryString(params)}`)
  return res.history ?? []
}
