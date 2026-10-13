import { useQueries, useQuery } from '@tanstack/react-query'
import { getJson, toQueryString } from '../api/http'
import { queryKeys } from '../api/queryClient'
import type { DashboardHolding, MemberAccount } from '../types/domain'

type MemberHoldings = { holdings: DashboardHolding[]; accounts: MemberAccount[] }

/** One member's share of the household's holdings and accounts on a date. */
function fetchMemberHoldings(householdId: number, asOf: string, memberId: number, signal?: AbortSignal) {
  const q = toQueryString({ household_id: householdId, as_of: asOf, member_id: memberId })
  return getJson<MemberHoldings>(`/api/holdings?${q}`, { signal })
    .then((d) => ({ holdings: d.holdings ?? [], accounts: d.accounts ?? [] }))
}

const memberQuery = (householdId: number, asOf: string, memberId: number) => ({
  queryKey: queryKeys.memberHoldings(householdId, asOf, memberId),
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchMemberHoldings(householdId, asOf, memberId, signal),
  enabled: householdId > 0,
})

/** Every listed member's holdings/accounts, keyed by member id (absent until loaded). */
export function useAllMemberHoldings(householdId: number, asOf: string, memberIds: number[]) {
  return useQueries({
    queries: memberIds.map((id) => memberQuery(householdId, asOf, id)),
    combine: (results) => {
      const holdings: Record<number, DashboardHolding[]> = {}
      const accounts: Record<number, MemberAccount[]> = {}
      results.forEach((r, i) => {
        if (r.data) { holdings[memberIds[i]] = r.data.holdings; accounts[memberIds[i]] = r.data.accounts }
        else if (r.isError) { holdings[memberIds[i]] = []; accounts[memberIds[i]] = [] }
      })
      return { holdings, accounts }
    },
  })
}

/** A single member's holdings (null member = none requested). Shares the cache with Home. */
export function useMemberHoldings(householdId: number, asOf: string, memberId: number | null) {
  return useQuery({ ...memberQuery(householdId, asOf, memberId ?? 0), enabled: householdId > 0 && memberId !== null })
}
