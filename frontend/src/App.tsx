import React, { useEffect, useState } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { AppProvider, useApp } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PrivacyProvider } from './context/PrivacyContext'
import { TermsProvider, hasModePreference } from './context/TermsContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/ui/Toast'
import type { Mode } from './lib/terms'
import { AlertsPage } from './pages/AlertsPage'
import { AssetsPage } from './pages/AssetsPage'
import { HoldingsPage } from './pages/HoldingsPage'
import { AccountsPage } from './pages/AccountsPage'
import { InstrumentsPage } from './pages/InstrumentsPage'
import { CashFlowPage } from './pages/CashFlowPage'
import { ExpensePage } from './pages/ExpensePage'
import { SpendTrendsPage } from './pages/SpendTrendsPage'
import { HelpPage } from './pages/HelpPage'
import { HomePage } from './pages/HomePage'
import { HouseholdPage } from './pages/HouseholdPage'
import { ImportWizard } from './pages/ImportWizard'
import { InsurancePage } from './pages/InsurancePage'
import { LedgerPage } from './pages/LedgerPage'
import { SettingsPage } from './pages/SettingsPage'
import { TaxPage } from './pages/TaxPage'
import { ValuationPage } from './pages/ValuationPage'
import { MaintenancePage } from './pages/MaintenancePage'
import { AdminPage } from './pages/AdminPage'
import { GmailSyncPage } from './pages/GmailSyncPage'
import { GmailRulesPage } from './pages/GmailRulesPage'
import { GmailStagingPage } from './pages/GmailStagingPage'
import { SmsDevicesPage } from './pages/SmsDevicesPage'
import { SmsTestPage } from './pages/SmsTestPage'
import { SmsMessagesPage } from './pages/SmsMessagesPage'
import { SmsRulesPage } from './pages/SmsRulesPage'
import { LoginPage } from './pages/LoginPage'
import { PendingPage } from './pages/PendingPage'
import { DeniedPage } from './pages/DeniedPage'

type RouteKey = 'home' | 'holdings' | 'accounts' | 'assets' | 'expenses' | 'spend-trends' | 'settings' | 'instruments' | 'ledger' | 'cashflow' | 'alerts' | 'tax' | 'valuation' | 'insurance' | 'help' | 'import' | 'household' | 'maintenance' | 'admin' | 'gmail-sync' | 'gmail-rules' | 'gmail-staging' | 'sms-devices' | 'sms-test' | 'sms-messages' | 'sms-rules'

const VALID_ROUTES = new Set<RouteKey>(['home', 'holdings', 'accounts', 'assets', 'expenses', 'spend-trends', 'settings', 'instruments', 'ledger', 'cashflow', 'alerts', 'tax', 'valuation', 'insurance', 'help', 'import', 'household', 'maintenance', 'admin', 'gmail-sync', 'gmail-rules', 'gmail-staging', 'sms-devices', 'sms-test', 'sms-messages', 'sms-rules'])

function routeFromHash(): RouteKey {
  const value = window.location.hash.replace('#/', '') as RouteKey
  return VALID_ROUTES.has(value) ? value : 'home'
}

function setRouteHash(route: RouteKey) {
  window.location.hash = `/${route}`
}

function AppInner() {
  const { user } = useAuth()
  const { householdId, households, members, accounts, instruments, canDelete, deleteConfig, toggleDelete, refreshOptions, error } = useApp()
  const [route, setRoute] = useState<RouteKey>(() => routeFromHash())

  useEffect(() => {
    const handler = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', handler)
    if (!window.location.hash) setRouteHash('home')
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const navigate = (r: string) => {
    setRouteHash(r as RouteKey)
  }

  const renderPage = () => {
    if (!householdId && route !== 'admin' && route !== 'household' && route !== 'settings' && route !== 'help' && route !== 'maintenance') {
      return (
        <div className="panel">
          <h2>Household Required</h2>
          <p className="text-sm text-slate-600">Select a household to continue. If you don't see one, create it under Household & Members.</p>
        </div>
      )
    }
    switch (route) {
      case 'home': return <HomePage onNavigate={navigate} />
      case 'holdings': return <HoldingsPage />
      case 'accounts': return <AccountsPage />
      case 'instruments': return <InstrumentsPage />
      case 'assets': return <AssetsPage />
      case 'expenses': return <ExpensePage householdId={householdId} memberOptions={members} accountOptions={accounts} canDelete={canDelete} />
      case 'spend-trends': return <SpendTrendsPage householdId={householdId} />
      case 'settings':
        return (
          <SettingsPage
            deleteConfig={deleteConfig}
            toggleDelete={toggleDelete}
            householdId={householdId}
            memberOptions={members}
            accountOptions={accounts}
            instrumentOptions={instruments}
          />
        )
      case 'household':
        return (
          <HouseholdPage
            householdId={householdId}
            householdOptions={households}
            onHouseholdsChanged={async () => refreshOptions()}
            canDelete={canDelete}
          />
        )
      case 'ledger':
        return (
          <LedgerPage
            householdId={householdId}
            memberOptions={members}
            accountOptions={accounts}
            instrumentOptions={instruments}
            onRefreshDashboard={async () => {}}
            canDelete={canDelete}
          />
        )
      case 'cashflow': return <CashFlowPage householdId={householdId} />
      case 'alerts': return <AlertsPage householdId={householdId} memberOptions={members} accountOptions={accounts} instrumentOptions={instruments} canDelete={canDelete} />
      case 'tax': return <TaxPage householdId={householdId} memberOptions={members} canDelete={canDelete} />
      case 'valuation': return <ValuationPage householdId={householdId} accountOptions={accounts} instrumentOptions={instruments} canDelete={canDelete} />
      case 'insurance': return <InsurancePage />
      case 'help': return <HelpPage />
      case 'import': return <ImportWizard householdId={householdId} memberOptions={members} accountOptions={accounts} instrumentOptions={instruments} />
      case 'maintenance': return <MaintenancePage />
      case 'gmail-sync': return <GmailSyncPage householdId={householdId} accountOptions={accounts} instrumentOptions={instruments} memberOptions={members} />
      case 'gmail-rules': return <GmailRulesPage householdId={householdId} accountOptions={accounts} memberOptions={members} />
      case 'gmail-staging': return <GmailStagingPage accountOptions={accounts} />
      case 'sms-devices': return <SmsDevicesPage householdId={householdId} />
      case 'sms-test': return <SmsTestPage />
      case 'sms-messages': return <SmsMessagesPage householdId={householdId} canDelete={canDelete} accountOptions={accounts} memberOptions={members} instrumentOptions={instruments} />
      case 'sms-rules': return <SmsRulesPage householdId={householdId} accountOptions={accounts} memberOptions={members} />
      case 'admin': return user.authenticated && user.role === 'super_admin' ? <AdminPage /> : <HomePage onNavigate={navigate} />
      default: return <HomePage onNavigate={navigate} />
    }
  }

  return (
    <AppLayout
      route={route}
      onRouteChange={navigate}
      householdName={householdId ? (households.find((h) => h.id === householdId)?.label || '') : ''}
    >
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
      ) : null}
      {renderPage()}
    </AppLayout>
  )
}

function OnboardingModal({ onSelect }: { onSelect: (m: Mode) => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-modal)]">
          <p className="mb-1 text-2xl font-bold text-[var(--text)]">How do you want to use this app?</p>
          <p className="mb-8 text-sm text-[var(--text-muted)]">You can change this any time in Settings.</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onSelect('simple')}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-[var(--border)] p-5 text-center transition-all hover:border-primary-500 hover:bg-[var(--surface-2)]"
            >
              <span className="text-3xl">🌱</span>
              <span className="font-semibold text-[var(--text)]">Simple</span>
              <span className="text-xs text-[var(--text-muted)]">Easy language, beginner-friendly</span>
            </button>
            <button
              type="button"
              onClick={() => onSelect('advanced')}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-[var(--border)] p-5 text-center transition-all hover:border-primary-500 hover:bg-[var(--surface-2)]"
            >
              <span className="text-3xl">📊</span>
              <span className="font-semibold text-[var(--text)]">Advanced</span>
              <span className="text-xs text-[var(--text-muted)]">Financial terms, detailed analytics</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function AuthGate() {
  const { user } = useAuth()
  if (user.authenticated === false && user.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    )
  }
  if (!user.authenticated) return <LoginPage />
  if (user.status === 'pending') return <PendingPage />
  if (user.status === 'denied') return <DeniedPage />
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [showOnboarding, setShowOnboarding] = useState(() => !hasModePreference())
  const [, forceUpdate] = useState(0)

  const handleSelect = (m: Mode) => {
    localStorage.setItem('ui:mode', m)
    setShowOnboarding(false)
    forceUpdate(n => n + 1)
  }

  return (
    <>
      {children}
      {showOnboarding && <OnboardingModal onSelect={handleSelect} />}
    </>
  )
}

function App() {
  return (
    <ThemeProvider>
      <TermsProvider>
        <ToastProvider>
          <PrivacyProvider>
            <AuthProvider>
              <OnboardingGate>
                <AuthGate />
              </OnboardingGate>
            </AuthProvider>
          </PrivacyProvider>
        </ToastProvider>
      </TermsProvider>
    </ThemeProvider>
  )
}

export default App
