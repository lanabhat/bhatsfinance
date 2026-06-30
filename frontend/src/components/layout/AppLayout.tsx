import { useState, useRef, useEffect, type ReactNode } from 'react'
import { MoreSheet } from './MoreSheet'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { useApp } from '../../context/AppContext'
import { useTheme } from '../../context/ThemeContext'
import { useTerms } from '../../context/TermsContext'

type Props = {
  route: string
  onRouteChange: (route: string) => void
  householdName?: string
  children: ReactNode
}

type Tab = { key: string; label: string; icon: ReactNode }

const TABS: Tab[] = [
  {
    key: 'home',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H15.75a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z" />
      </svg>
    ),
  },
  {
    key: 'holdings',
    label: 'Investments',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    key: 'accounts',
    label: 'Accounts',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
  },
  {
    key: 'expenses',
    label: 'Transactions',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.774 4.774zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'spend-trends',
    label: 'Trends',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
  },
]

const MOBILE_TABS: Tab[] = TABS.filter((t) => t.key !== 'spend-trends' && t.key !== 'analytics')

const MORE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
  </svg>
)

const CHEVRON_LEFT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
)

const CHEVRON_RIGHT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
)

const SECONDARY_KEYS = new Set(['instruments', 'ledger', 'cashflow', 'alerts', 'tax', 'valuation', 'insurance', 'household', 'maintenance', 'help', 'import', 'admin', 'gmail-sync', 'gmail-rules', 'gmail-staging', 'sms-devices', 'sms-test', 'sms-messages', 'sms-rules', 'settings', 'analytics'])
const MOBILE_SECONDARY_KEYS = new Set([...SECONDARY_KEYS, 'spend-trends'])

const PAGE_TITLES: Record<string, string> = {
  home: 'Home', holdings: 'Investments', accounts: 'Accounts', expenses: 'Transactions', settings: 'Settings',
  instruments: 'Instruments', ledger: 'Ledger', cashflow: 'Cash Flow', 'spend-trends': 'Spend Trends', analytics: 'Analytics', alerts: 'Alerts', tax: 'Tax',
  valuation: 'Valuation', insurance: 'Insurance', household: 'Household & Members', maintenance: 'Maintenance',
  help: 'Help', import: 'Import', admin: 'User Management', 'gmail-sync': 'Gmail Sync',
  'gmail-rules': 'Gmail Rules', 'gmail-staging': 'Gmail Transactions', 'sms-devices': 'SMS Devices', 'sms-test': 'SMS Test Sender', 'sms-messages': 'SMS Messages', 'sms-rules': 'SMS Rules',
}

const SIDEBAR_PREF_KEY = 'sidebar:expanded'

export function AppLayout({ route, onRouteChange, householdName, children }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [householdMenuOpen, setHouseholdMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return window.localStorage.getItem(SIDEBAR_PREF_KEY) === '1' } catch { return false }
  })
  const menuRef = useRef<HTMLDivElement>(null)
  const householdMenuRef = useRef<HTMLDivElement>(null)
  const { user, logout, selectHousehold } = useAuth()
  const { households, householdId, refreshOptions } = useApp()
  const { hidden, toggle: togglePrivacy } = usePrivacy()
  const { theme, setTheme } = useTheme()
  const { t, isSimple } = useTerms()

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

  const themeIcon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '💻'
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
      <aside className={`fixed inset-y-0 left-0 z-30 hidden ${sidebarWidth} flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width] duration-200 ease-out md:flex`}>
        {/* Logo */}
        <div className={`flex h-14 shrink-0 items-center border-b border-[var(--border)] ${expanded ? 'gap-2.5 px-4' : 'justify-center'}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-xs font-bold text-white shadow-sm">W</span>
          {expanded && <span className="font-serif truncate text-sm font-semibold tracking-tight text-[var(--text)]">Wealth</span>}
        </div>
        {/* Nav items */}
        <nav className={`flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-3 ${expanded ? 'px-2' : 'items-center'}`}>
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
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                          : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                      }`
                    : `group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                        active
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                          : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                      }`
                }
              >
                <span className="shrink-0">{tab.icon}</span>
                {expanded ? (
                  <span className="truncate">{tabLabel(tab.key, tab.label)}</span>
                ) : (
                  <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-lg bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-700 group-hover:block">
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
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                  }`
                : `group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    isSecondaryDesktop
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                  }`
            }
          >
            <span className="shrink-0">{MORE_ICON}</span>
            {expanded ? (
              <span className="truncate">More</span>
            ) : (
              <span className="pointer-events-none absolute left-full ml-2 hidden rounded-lg bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-700 group-hover:block">More</span>
            )}
          </button>
          <button
            type="button"
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={() => setExpanded((v) => !v)}
            className={`text-[var(--text-muted)] transition-colors hover:text-[var(--text)] ${
              expanded
                ? 'mt-1 flex h-9 w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-xs font-medium hover:bg-[var(--surface-2)]'
                : 'mt-1 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)]'
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
        <header className="sticky top-0 z-20 flex h-14 min-w-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 pt-safe md:px-6 md:pt-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-xs font-bold text-white md:hidden">W</span>
            <h1 className="font-serif text-base font-semibold tracking-tight text-[var(--text)]">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={cycleTheme}
              title={themeTitle}
              className="tap flex h-10 w-10 items-center justify-center rounded-full text-base transition-colors hover:bg-[var(--surface-2)] md:h-8 md:w-8"
            >
              {themeIcon}
            </button>
            {/* Privacy toggle */}
            <button
              type="button"
              onClick={togglePrivacy}
              title={hidden ? 'Show amounts' : 'Hide amounts'}
              aria-pressed={hidden}
              className="tap flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] md:h-8 md:w-8"
            >
              {hidden ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
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
                  className="max-w-[6rem] truncate rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-3)]"
                >
                  {householdName || 'Select'}
                </button>
                {(user.role === 'admin' || user.role === 'super_admin') && householdMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-modal)]">
                    <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Household</p>
                    <div className="max-h-72 overflow-auto">
                      {households.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-[var(--text-muted)]">No households found.</p>
                      ) : households.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={async () => {
                            try { await selectHousehold(h.id); refreshOptions() } finally { setHouseholdMenuOpen(false) }
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-[var(--surface-2)] ${
                            h.id === householdId ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-2)]'
                          }`}
                        >
                          <span className="truncate">{h.label}</span>
                          {h.id === householdId && <span className="text-xs text-primary-600 dark:text-primary-400">Selected</span>}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 border-t border-[var(--border)] pt-2">
                      <button
                        type="button"
                        onClick={() => { setHouseholdMenuOpen(false); onRouteChange('household') }}
                        className="w-full rounded-lg px-2 py-2 text-left text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]"
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
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-2 ring-[var(--border)] transition-all hover:ring-primary-400"
                >
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-primary-100 text-xs font-semibold text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[var(--shadow-modal)]">
                    <div className="border-b border-[var(--border)] px-3 py-2">
                      <p className="truncate text-xs font-medium text-[var(--text)]">{user.name || user.email}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={logout}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)]"
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
        <main className="main-content min-w-0 overflow-x-clip mx-auto max-w-7xl px-4 pt-5 md:px-6">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-[var(--border)] bg-[var(--surface)] pb-safe md:hidden">
        {MOBILE_TABS.map((tab) => {
          const active = route === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onRouteChange(tab.key)}
              className={`tap flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active ? 'text-primary-600 dark:text-primary-400' : 'text-[var(--text-faint)]'
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
          className={`tap flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
            isSecondaryMobile ? 'text-primary-600 dark:text-primary-400' : 'text-[var(--text-faint)]'
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
        sidebarWidthClass={sidebarWidth}
      />
    </div>
  )
}
