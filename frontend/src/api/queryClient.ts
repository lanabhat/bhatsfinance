import { QueryClient } from '@tanstack/react-query'

/**
 * Shared cache for server data. Identical requests made by several components at once
 * are sent once; data stays fresh for 30 s (navigating back shows it instantly), and is
 * refetched when the tab regains focus.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
})

/** Query keys, in one place so invalidation matches what was cached. */
export const queryKeys = {
  households: ['options', 'households'] as const,
  members: (householdId: number) => ['options', 'members', householdId] as const,
  accounts: (householdId: number) => ['options', 'accounts', householdId] as const,
  instruments: (householdId: number) => ['options', 'instruments', householdId] as const,
  assetCategories: (householdId: number) => ['asset-categories', householdId] as const,
  dashboard: (householdId: number, asOf?: string) =>
    (asOf ? ['dashboard', householdId, asOf] : ['dashboard', householdId]) as readonly unknown[],
  // Under the dashboard key, so refreshDashboard() refreshes member figures too.
  memberHoldings: (householdId: number, asOf: string, memberId: number) =>
    ['dashboard', householdId, asOf, 'member', memberId] as const,
}
