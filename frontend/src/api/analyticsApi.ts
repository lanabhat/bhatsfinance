import { getJson, toQueryString } from './http'
import type { DashboardAllocation, DashboardHolding, CategoryBreakdownItem, MemberNetWorth, NetWorthPoint } from '../types/domain'

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

export type AnalyticsPayload = {
  holdings: DashboardHolding[]
  allocation: DashboardAllocation[]
  categoryBreakdown: CategoryBreakdownItem[]
  xirr: number | null
  membersNetworth: MemberNetWorth[]
  networthHistory: NetWorthPoint[]
}

export async function fetchAnalytics(
  householdId: number,
  asOf: string,
  memberId?: number | null,
): Promise<AnalyticsPayload> {
  const base = { household_id: householdId, as_of: asOf }
  const memberParam = memberId ? { ...base, member_id: memberId } : base

  const [
    holdingsRes,
    allocationRes,
    categoryRes,
    xirrRes,
    membersRes,
    historyRes,
  ] = await Promise.all([
    getJson<{ holdings: DashboardHolding[] }>(`/api/holdings?${toQueryString(memberParam)}`),
    getJson<{ allocation: DashboardAllocation[] }>(`/api/allocation?${toQueryString(base)}`),
    getJson<{ breakdown: CategoryBreakdownItem[] }>(`/api/category-breakdown?${toQueryString(memberParam)}`),
    getJson<{ xirr: number | null }>(`/api/xirr?${toQueryString(base)}`),
    getJson<{ members: MemberNetWorth[] }>(`/api/members-networth?${toQueryString(base)}`),
    getJson<{ history: NetWorthPoint[] }>(`/api/networth/history?${toQueryString({ household_id: householdId })}`),
  ])

  return {
    holdings: holdingsRes.holdings ?? [],
    allocation: allocationRes.allocation ?? [],
    categoryBreakdown: categoryRes.breakdown ?? [],
    xirr: xirrRes.xirr ?? null,
    membersNetworth: membersRes.members ?? [],
    networthHistory: historyRes.history ?? [],
  }
}
