import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { assetCategoryApi } from '../api/assetCategoryApi'
import { ledgerApi } from '../api/ledgerApi'
import { normalizeApiError } from '../hooks/errorUtils'
import { type DeleteEntity, useDeleteConfig } from '../hooks/useDeleteConfig'
import { invalidateOptionCache, useOptionLoaders } from '../hooks/useOptionLoaders'
import type { AssetCategory, DashboardPayload, InstrumentOption, OptionItem } from '../types/domain'
import { useAuth } from './AuthContext'

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
  const [dashboard, setDashboard] = useState<DashboardPayload>(EMPTY_DASHBOARD)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [error, setError] = useState('')
  const [optionsRefreshKey, setOptionsRefreshKey] = useState(0)

  const { households, members, accounts, instruments, instrumentsFull } = useOptionLoaders(householdId, optionsRefreshKey)
  const { config: deleteConfig, toggle: toggleDelete, canDelete } = useDeleteConfig()

  const refreshDashboard = async () => {
    if (!householdId) {
      setDashboard(EMPTY_DASHBOARD)
      setError('Select a household to continue.')
      return
    }
    setDashboardLoading(true)
    try {
      setError('')
      setDashboard(await ledgerApi.fetchDashboard(householdId, asOf))
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setDashboardLoading(false)
    }
  }

  const refreshCategories = async () => {
    if (!householdId) {
      setCategories([])
      return
    }
    try {
      setCategories(await assetCategoryApi.list(householdId))
    } catch {
      // non-fatal
    }
  }

  const refreshOptions = () => {
    invalidateOptionCache('households')
    invalidateOptionCache('members:')
    invalidateOptionCache('accounts:')
    invalidateOptionCache('instruments:')
    // Bumping householdId to the same value is a no-op in React (Object.is
    // check), so useOptionLoaders' effects never re-ran despite the cache
    // being cleared — this counter is a real state change that does.
    setOptionsRefreshKey((k) => k + 1)
  }

  // Single entry point for "something changed elsewhere, re-sync everything
  // this page might be showing" — used by the header's manual refresh button
  // and by import/instrument-creation flows that don't already call
  // refreshDashboard/refreshOptions themselves.
  const refreshAll = async () => {
    refreshOptions()
    await Promise.all([refreshDashboard(), refreshCategories()])
  }

  useEffect(() => { void refreshDashboard() }, [householdId, asOf])
  useEffect(() => { void refreshCategories() }, [householdId])

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
