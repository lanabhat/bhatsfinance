import { useState, useRef, useEffect, type ReactNode } from 'react'
import { MoreSheet } from './MoreSheet'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { useApp } from '../../context/AppContext'
import { useTheme } from '../../context/ThemeContext'
import { useTerms } from '../../context/TermsContext'
import { BarChart3, ChevronLeft, ChevronRight, Eye, EyeOff, Home, Landmark, LineChart, Monitor, Moon, MoreHorizontal, PieChart, Receipt, RefreshCw, Sun } from 'lucide-react'
import { usePageChrome } from '../../context/PageChromeContext'
import { MemberSwitcher } from './MemberSwitcher'
import { AvatarUpload } from '../common/AvatarUpload'

type Breadcrumb = { parentLabel: string; current: string; onBack: () => void }

type Props = {
  route: string
  onRouteChange: (route: string) => void
  householdName?: string
  breadcrumb?: Breadcrumb
  children: ReactNode
}

type Tab = { key: string; label: string; icon: ReactNode }

const ICON = 'h-5 w-5'
const TABS: Tab[] = [
  { key: 'home', label: 'Home', icon: <Home className={ICON} aria-hidden /> },
  { key: 'holdings', label: 'Investments', icon: <LineChart className={ICON} aria-hidden /> },
  { key: 'accounts', label: 'Accounts', icon: <Landmark className={ICON} aria-hidden /> },
  { key: 'expenses', label: 'Transactions', icon: <Receipt className={ICON} aria-hidden /> },
  { key: 'spend-trends', label: 'Trends', icon: <BarChart3 className={ICON} aria-hidden /> },
  { key: 'analytics', label: 'Analytics', icon: <PieChart className={ICON} aria-hidden /> },
]

const MOBILE_TABS: Tab[] = TABS.filter((t) => t.key !== 'spend-trends' && t.key !== 'analytics')

const MORE_ICON = <MoreHorizontal className={ICON} aria-hidden />
const CHEVRON_LEFT = <ChevronLeft className="h-4 w-4" aria-hidden />
const CHEVRON_RIGHT = <ChevronRight className="h-4 w-4" aria-hidden />

const SECONDARY_KEYS = new Set(['instruments', 'ledger', 'alerts', 'tax', 'valuation', 'insurance', 'reports', 'household', 'maintenance', 'help', 'import', 'admin', 'gmail', 'sms', 'settings', 'analytics'])
const MOBILE_SECONDARY_KEYS = new Set([...SECONDARY_KEYS, 'spend-trends'])

const PAGE_TITLES: Record<string, string> = {
  home: 'Home', holdings: 'Investments', accounts: 'Accounts', expenses: 'Transactions', settings: 'Settings',
  instruments: 'Instruments', ledger: 'Ledger', 'spend-trends': 'Spend Trends', analytics: 'Analytics', alerts: 'Alerts', tax: 'Tax',
  valuation: 'Valuation', insurance: 'Insurance', reports: 'Reports', household: 'Household & Members', maintenance: 'Maintenance',
  help: 'Help', import: 'Import', admin: 'User Management', gmail: 'Gmail', sms: 'SMS',
}

const SIDEBAR_PREF_KEY = 'sidebar:expanded'

export function AppLayout({ route, onRouteChange, householdName, breadcrumb, children }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [householdMenuOpen, setHouseholdMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return window.localStorage.getItem(SIDEBAR_PREF_KEY) === '1' } catch { return false }
  })
  const menuRef = useRef<HTMLDivElement>(null)
  const householdMenuRef = useRef<HTMLDivElement>(null)
  const { user, logout, selectHousehold, updatePhoto } = useAuth()
  const { households, householdId, refreshOptions, refreshAll, dashboardLoading } = useApp()
  const [refreshing, setRefreshing] = useState(false)
  const { hidden, toggle: togglePrivacy } = usePrivacy()
  const { theme, setTheme } = useTheme()
  const { t, isSimple } = useTerms()
  const { hasPageHeader } = usePageChrome()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
      if (householdMenuRef.current && !householdMenuRef.current.contains(e.target as Node)) setHouseholdMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_PREF_KEY, expanded ? '1' : '0') } catch { /* ignore */ }
  }, [expanded])

  const isSecondaryDesktop = SECONDARY_KEYS.has(route)
  const isSecondaryMobile = MOBILE_SECONDARY_KEYS.has(route)
  const pageTitle = PAGE_TITLES[route] ?? 'Wealth'

  const sidebarWidth = expanded ? 'w-56' : 'w-16'
  const mainOffset = expanded ? 'md:ml-56' : 'md:ml-16'

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light')
    else if (theme === 'light') setTheme('dark')
    else setTheme('system')
  }

  const themeIcon = theme === 'dark' ? <Moon className="h-4 w-4" aria-hidden /> : theme === 'light' ? <Sun className="h-4 w-4" aria-hidden /> : <Monitor className="h-4 w-4" aria-hidden />
  const themeTitle = theme === 'dark' ? 'Dark mode (click for system)' : theme === 'light' ? 'Light mode (click for dark)' : 'System theme (click for light)'

  // Tab labels adapt to simple mode
  const tabLabel = (key: string, fallback: string) => {
    const map: Record<string, string> = {
      holdings: isSimple ? t('holdings') : 'Investments',
      accounts: isSimple ? t('accounts') : 'Accounts',
      expenses: isSimple ? t('expense') : 'Transactions',
      home: 'Home',
      'spend-trends': isSimple ? t('spend_trends') : 'Trends',
      settings: 'Settings',
    }
    return map[key] ?? fallback
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--bg)]">
      {/* ── Desktop sidebar ── */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden ${sidebarWidth} flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out md:flex`}>
        {/* Logo */}
        <div className={`flex h-14 shrink-0 items-center border-b border-line ${expanded ? 'gap-3 px-4' : 'justify-center'}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-xs font-bold text-on-accent shadow-sm">W</span>
          {expanded && <span className="font-serif truncate text-sm font-semibold tracking-tight text-ink">Wealth</span>}
        </div>
        {/* Nav items */}
        <nav className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-3 ${expanded ? 'px-2' : 'items-center'}`}>
          {TABS.map((tab) => {
            const active = route === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                title={expanded ? undefined : tabLabel(tab.key, tab.label)}
                onClick={() => onRouteChange(tab.key)}
                className={
                  expanded
                    ? `flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-accent-subtle text-accent'
                          : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                      }`
                    : `group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                        active
                          ? 'bg-accent-subtle text-accent'
                          : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                      }`
                }
              >
                <span className="shrink-0">{tab.icon}</span>
                {expanded ? (
                  <span className="truncate">{tabLabel(tab.key, tab.label)}</span>
                ) : (
                  <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs text-surface group-hover:block">
                    {tabLabel(tab.key, tab.label)}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
        {/* Sidebar footer */}
        <div className={`shrink-0 flex flex-col gap-1 pb-3 ${expanded ? 'px-2' : 'items-center'}`}>
          <button
            type="button"
            title={expanded ? undefined : 'More'}
            onClick={() => setMoreOpen(true)}
            className={
              expanded
                ? `flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                    isSecondaryDesktop
                      ? 'bg-accent-subtle text-accent'
                      : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                  }`
                : `group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    isSecondaryDesktop
                      ? 'bg-accent-subtle text-accent'
                      : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                  }`
            }
          >
            <span className="shrink-0">{MORE_ICON}</span>
            {expanded ? (
              <span className="truncate">More</span>
            ) : (
              <span className="pointer-events-none absolute left-full ml-2 hidden rounded-lg bg-ink px-2 py-1 text-xs text-surface group-hover:block">More</span>
            )}
          </button>
          <button
            type="button"
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={() => setExpanded((v) => !v)}
            className={`text-ink-muted transition-colors hover:text-ink ${
              expanded
                ? 'mt-1 flex h-9 w-full items-center gap-2 rounded-lg border border-line px-3 text-xs font-medium hover:bg-surface-2'
                : 'mt-1 flex h-9 w-9 items-center justify-center rounded-lg border border-line hover:bg-surface-2'
            }`}
          >
            {expanded ? CHEVRON_LEFT : CHEVRON_RIGHT}
            {expanded && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className={`relative z-10 transition-[margin] duration-200 ease-out ${mainOffset}`}>
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-14 min-w-0 items-center justify-between border-b border-line bg-surface px-4 pt-safe md:px-6 md:pt-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold text-on-accent md:hidden">W</span>
            {breadcrumb ? (
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={breadcrumb.onBack}
                  title={`Back to ${breadcrumb.parentLabel}`}
                  className="tap -ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
                >
                  {CHEVRON_LEFT}
                </button>
                <h1 className="font-serif min-w-0 truncate text-base font-semibold tracking-tight text-ink">
                  <button type="button" onClick={breadcrumb.onBack} className="text-ink-muted hover:text-ink">{breadcrumb.parentLabel}</button>
                  <span className="text-ink-muted"> / </span>
                  {breadcrumb.current}
                </h1>
              </div>
            ) : (
              hasPageHeader
                ? <span className="hidden text-sm font-semibold text-ink md:inline">{householdName || 'Wealth'}</span>
                : <h1 className="text-base font-semibold tracking-tight text-ink">{pageTitle}</h1>
            )}
          </div>
          <div className="flex items-center gap-1">
            <MemberSwitcher />
            {/* Manual refresh — re-syncs holdings/accounts/dropdowns after an
                import or an add made elsewhere, without a full page reload */}
            <button
              type="button"
              onClick={async () => {
                if (refreshing) return
                setRefreshing(true)
                try { await refreshAll() } finally { setRefreshing(false) }
              }}
              disabled={refreshing || dashboardLoading}
              title="Refresh data"
              aria-label="Refresh data"
              className="tap flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50 md:h-8 md:w-8"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing || dashboardLoading ? 'animate-spin' : ''}`} aria-hidden />
            </button>
            {/* Theme toggle */}
            <button
              type="button"
              onClick={cycleTheme}
              title={themeTitle}
              aria-label={themeTitle}
              className="tap flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink md:h-8 md:w-8"
            >
              {themeIcon}
            </button>
            {/* Privacy toggle */}
            <button
              type="button"
              onClick={togglePrivacy}
              title={hidden ? 'Show amounts' : 'Hide amounts'}
              aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
              aria-pressed={hidden}
              className="tap flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink md:h-8 md:w-8"
            >
              {hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
            {/* Household picker */}
            {user.authenticated ? (
              <div className="relative" ref={householdMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    if (user.role === 'admin' || user.role === 'super_admin') setHouseholdMenuOpen(v => !v)
                  }}
                  title={user.role === 'admin' || user.role === 'super_admin' ? 'Change household' : undefined}
                  className="max-w-[6rem] truncate rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-3"
                >
                  {householdName || 'Select'}
                </button>
                {(user.role === 'admin' || user.role === 'super_admin') && householdMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-[var(--shadow-modal)]">
                    <p className="px-2 pb-2 text-xs font-semibold text-ink-muted">Household</p>
                    <div className="max-h-72 overflow-auto">
                      {households.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-ink-muted">No households found.</p>
                      ) : households.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={async () => {
                            try { await selectHousehold(h.id); refreshOptions() } finally { setHouseholdMenuOpen(false) }
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface-2 ${
                            h.id === householdId ? 'font-semibold text-ink' : 'text-ink-2'
                          }`}
                        >
                          <span className="truncate">{h.label}</span>
                          {h.id === householdId && <span className="text-xs text-accent">Selected</span>}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 border-t border-line pt-2">
                      <button
                        type="button"
                        onClick={() => { setHouseholdMenuOpen(false); onRouteChange('household') }}
                        className="w-full rounded-lg px-2 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-surface-2"
                      >
                        Manage households…
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            {/* User menu */}
            {user.authenticated && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-2 ring-[var(--border)] transition-all hover:ring-accent"
                >
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-accent-subtle text-xs font-semibold text-accent">
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-line bg-surface py-1 shadow-[var(--shadow-modal)]">
                    <div className="flex items-center gap-3 border-b border-line px-3 py-3">
                      <AvatarUpload
                        photo={user.picture}
                        name={user.name || user.email}
                        size={44}
                        onChange={(photo) => updatePhoto(photo)}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">{user.name || user.email}</p>
                        <p className="truncate text-xs text-ink-muted">{user.email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={logout}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-surface-2"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="main-content min-w-0 overflow-x-clip mx-auto max-w-7xl px-4 pt-6 md:px-8 md:pt-8">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-line bg-surface pb-safe md:hidden">
        {MOBILE_TABS.map((tab) => {
          const active = route === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onRouteChange(tab.key)}
              aria-current={active ? 'page' : undefined}
              className={`tap flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
                active ? 'text-accent' : 'text-ink-muted'
              }`}
            >
              {tab.icon}
              {tabLabel(tab.key, tab.label)}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`tap flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
            isSecondaryMobile ? 'text-accent' : 'text-ink-muted'
          }`}
        >
          {MORE_ICON}
          More
        </button>
      </nav>

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onNavigate={onRouteChange}
        currentRoute={route}
        role={user.authenticated ? user.role : undefined}
      />
    </div>
  )
}
