import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../api/queryClient'
import { assetCategoryApi } from '../api/assetCategoryApi'
import { ledgerApi } from '../api/ledgerApi'
import { normalizeApiError } from '../hooks/errorUtils'
import { type DeleteEntity, useDeleteConfig } from '../hooks/useDeleteConfig'
import { useOptionLoaders } from '../hooks/useOptionLoaders'
import type { AssetCategory, DashboardPayload, InstrumentOption, OptionItem } from '../types/domain'
import { useAuth } from './AuthContext'
import { useErrorToast } from '../hooks/useErrorToast'

const EMPTY_DASHBOARD: DashboardPayload = {
  holdings: [],
  allocation: [],
  networth: '0.00',
  xirr: null,
  missedSip: [],
  missedRD: [],
  missedPremiums: [],
  networthHistory: [],
  categoryBreakdown: [],
  membersNetworth: [],
  accounts: [],
}

type AppContextValue = {
  householdId: number
  setHouseholdId: (id: number) => void
  asOf: string
  setAsOf: (d: string) => void
  dashboard: DashboardPayload
  refreshDashboard: () => Promise<void>
  dashboardLoading: boolean
  households: OptionItem[]
  members: OptionItem[]
  accounts: OptionItem[]
  instruments: OptionItem[]
  instrumentsFull: InstrumentOption[]
  categories: AssetCategory[]
  refreshOptions: () => void
  refreshCategories: () => Promise<void>
  refreshAll: () => Promise<void>
  canDelete: (e: DeleteEntity) => boolean
  deleteConfig: Record<DeleteEntity, boolean>
  toggleDelete: (e: DeleteEntity) => void
  error: string
}

const AppContext = createContext<AppContextValue>(null!)
const NO_CATEGORIES: AssetCategory[] = []

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const authHouseholdId = user.authenticated ? (user.household_id ?? 0) : 0
  const [householdId, setHouseholdId] = useState(authHouseholdId)

  useEffect(() => {
    setHouseholdId(authHouseholdId)
  }, [authHouseholdId])
  const [asOf, setAsOf] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const queryClient = useQueryClient()
  const errorToast = useErrorToast()

  const { households, members, accounts, instruments, instrumentsFull } = useOptionLoaders(householdId)
  const { config: deleteConfig, toggle: toggleDelete, canDelete } = useDeleteConfig()

  // Cached per household + date; changing the date keeps showing the previous figures
  // until the new ones arrive instead of flashing an empty dashboard.
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(householdId, asOf),
    queryFn: ({ signal }) => ledgerApi.fetchDashboard(householdId, asOf, signal),
    enabled: householdId > 0,
    placeholderData: keepPreviousData,
  })
  const dashboard = dashboardQuery.data ?? EMPTY_DASHBOARD
  const dashboardLoading = dashboardQuery.isFetching
  const error = !householdId
    ? 'Select a household to continue.'
    : dashboardQuery.error ? normalizeApiError(dashboardQuery.error) : ''

  const categoriesQuery = useQuery({
    queryKey: queryKeys.assetCategories(householdId),
    queryFn: () => assetCategoryApi.list(householdId),
    enabled: householdId > 0,
  })
  const categories = categoriesQuery.data ?? NO_CATEGORIES
  useEffect(() => {
    if (categoriesQuery.error) errorToast('Couldn’t load categories')(categoriesQuery.error)
  }, [categoriesQuery.error, errorToast])

  // Callers await these after a change, then read fresh data from context.
  const refreshDashboard = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(householdId) }), [queryClient, householdId])
  const refreshCategories = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.assetCategories(householdId) }), [queryClient, householdId])
  const refreshOptions = useCallback(() => { void queryClient.invalidateQueries({ queryKey: ['options'] }) }, [queryClient])

  // Single entry point for "something changed elsewhere, re-sync everything this page
  // might be showing" — the header's refresh button and import/instrument-creation flows.
  const refreshAll = useCallback(async () => {
    await queryClient.invalidateQueries()
  }, [queryClient])

  return (
    <AppContext.Provider value={{
      householdId, setHouseholdId,
      asOf, setAsOf,
      dashboard, refreshDashboard, dashboardLoading,
      households, members, accounts, instruments, instrumentsFull,
      categories, refreshCategories,
      refreshOptions, refreshAll,
      canDelete, deleteConfig, toggleDelete,
      error,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
