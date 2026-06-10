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
  networthHistory: [],
  categoryBreakdown: [],
  membersNetworth: [],
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
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10))
  const [dashboard, setDashboard] = useState<DashboardPayload>(EMPTY_DASHBOARD)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [error, setError] = useState('')

  const { households, members, accounts, instruments, instrumentsFull } = useOptionLoaders(householdId)
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
    setHouseholdId((prev) => Number(prev))
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
      refreshOptions,
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
