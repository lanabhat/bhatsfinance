import { Suspense, useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './api/queryClient'
import { lazyPage } from './lib/lazyPage'
import { PageErrorBoundary } from './components/PageErrorBoundary'
import { AppLayout } from './components/layout/AppLayout'
import { AppProvider, useApp } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PrivacyProvider } from './context/PrivacyContext'
import { TermsProvider } from './context/TermsContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/ui/Toast'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { PendingPage } from './pages/PendingPage'
import { DeniedPage } from './pages/DeniedPage'
import { CoinSpinner } from './components/common/CoinSpinner'

// Each page is its own chunk, loaded when first visited (Home stays in the main bundle).
const AlertsPage = lazyPage(() => import('./pages/AlertsPage'), 'AlertsPage')
const AssetAllocationPage = lazyPage(() => import('./pages/AssetAllocationPage'), 'AssetAllocationPage')
const DiversificationPage = lazyPage(() => import('./pages/DiversificationPage'), 'DiversificationPage')
const FundPerformancePage = lazyPage(() => import('./pages/FundPerformancePage'), 'FundPerformancePage')
const HoldingsPage = lazyPage(() => import('./pages/HoldingsPage'), 'HoldingsPage')
const AddHoldingPage = lazyPage(() => import('./pages/AddHoldingPage'), 'AddHoldingPage')
const SmsReviewPage = lazyPage(() => import('./pages/SmsReviewPage'), 'SmsReviewPage')
const AccountsPage = lazyPage(() => import('./pages/AccountsPage'), 'AccountsPage')
const InstrumentsPage = lazyPage(() => import('./pages/InstrumentsPage'), 'InstrumentsPage')
const InstrumentDetailPage = lazyPage(() => import('./pages/InstrumentDetailPage'), 'InstrumentDetailPage')
const ExpensePage = lazyPage(() => import('./pages/ExpensePage'), 'ExpensePage')
const SpendTrendsPage = lazyPage(() => import('./pages/SpendTrendsPage'), 'SpendTrendsPage')
const HelpPage = lazyPage(() => import('./pages/HelpPage'), 'HelpPage')
const HouseholdPage = lazyPage(() => import('./pages/HouseholdPage'), 'HouseholdPage')
const ImportPage = lazyPage(() => import('./pages/ImportPage'), 'ImportPage')
const InsurancePage = lazyPage(() => import('./pages/InsurancePage'), 'InsurancePage')
const LedgerPage = lazyPage(() => import('./pages/LedgerPage'), 'LedgerPage')
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'), 'SettingsPage')
const TaxPage = lazyPage(() => import('./pages/TaxPage'), 'TaxPage')
const ValuationPage = lazyPage(() => import('./pages/ValuationPage'), 'ValuationPage')
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'), 'ReportsPage')
const MaintenancePage = lazyPage(() => import('./pages/MaintenancePage'), 'MaintenancePage')
const AdminPage = lazyPage(() => import('./pages/AdminPage'), 'AdminPage')
const GmailPage = lazyPage(() => import('./pages/GmailPage'), 'GmailPage')
const SmsPage = lazyPage(() => import('./pages/SmsPage'), 'SmsPage')
const AnalyticsPage = lazyPage(() => import('./pages/AnalyticsPage'), 'AnalyticsPage')

type RouteKey = 'home' | 'holdings' | 'accounts' | 'allocation' | 'diversification' | 'fund-performance' | 'expenses' | 'spend-trends' | 'analytics' | 'settings' | 'instruments' | 'ledger' | 'alerts' | 'tax' | 'valuation' | 'insurance' | 'reports' | 'help' | 'import' | 'household' | 'maintenance' | 'admin' | 'gmail' | 'sms'

const VALID_ROUTES = new Set<RouteKey>(['home', 'holdings', 'accounts', 'allocation', 'diversification', 'fund-performance', 'expenses', 'spend-trends', 'analytics', 'settings', 'instruments', 'ledger', 'alerts', 'tax', 'valuation', 'insurance', 'reports', 'help', 'import', 'household', 'maintenance', 'admin', 'gmail', 'sms'])

// 'assets' was retired in favor of 'instruments' (bulk-tag + AI-classify were
// ported there) — redirect old bookmarks/muscle memory instead of 404ing to home.
const LEGACY_ROUTE_REDIRECTS: Record<string, RouteKey> = { assets: 'instruments' }

// A page may keep its own state in a query after the path (#/analytics?type=Equity);
// routing only looks at the path.
function hashPath(): string {
  return window.location.hash.replace('#/', '').split('?')[0]
}

function routeFromHash(): RouteKey {
  const value = hashPath().split('/')[0]
  if (value in LEGACY_ROUTE_REDIRECTS) return LEGACY_ROUTE_REDIRECTS[value]
  return VALID_ROUTES.has(value as RouteKey) ? (value as RouteKey) : 'home'
}

// Sub-routes: the literal 'add' under 'holdings' (#/holdings/add, the
// full-page "Add Holding" flow), a numeric instrument id under
// 'instruments' (#/instruments/<id>, the drill-down page) and a numeric
// SMS id under 'sms' (#/sms/<id>, the full-page SMS review). Not a general sub-routing scheme — each caller interprets the
// segment itself; extend the same way if another page needs one.
function subRouteFromHash(): string | null {
  const parts = hashPath().split('/')
  return parts.length > 1 ? parts[1] : null
}

function setRouteHash(route: RouteKey) {
  window.location.hash = `/${route}`
}

function AppInner() {
  const { user } = useAuth()
  const { householdId, households, members, accounts, instruments, instrumentsFull, canDelete, deleteConfig, toggleDelete, refreshOptions, error } = useApp()
  const [route, setRoute] = useState<RouteKey>(() => routeFromHash())
  const [subRoute, setSubRoute] = useState<string | null>(() => subRouteFromHash())

  useEffect(() => {
    const handler = () => { setRoute(routeFromHash()); setSubRoute(subRouteFromHash()) }
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
    if (route === 'holdings' && subRoute === 'add') return <AddHoldingPage onDone={() => navigate('holdings')} />
    if (route === 'instruments' && subRoute) return <InstrumentDetailPage instrumentId={Number(subRoute)} onDone={() => navigate('instruments')} />
    if (route === 'sms' && subRoute && householdId) return <SmsReviewPage householdId={householdId} messageId={Number(subRoute)} memberOptions={members} instrumentOptions={instrumentsFull} onDone={() => navigate('sms')} />
    switch (route) {
      case 'home': return <HomePage onNavigate={navigate} />
      case 'holdings': return <HoldingsPage />
      case 'accounts': return <AccountsPage />
      case 'instruments': return <InstrumentsPage />
      case 'allocation': return <AssetAllocationPage />
      case 'diversification': return <DiversificationPage />
      case 'fund-performance': return <FundPerformancePage />
      case 'expenses': return <ExpensePage householdId={householdId} memberOptions={members} accountOptions={accounts} canDelete={canDelete} />
      case 'spend-trends': return <SpendTrendsPage householdId={householdId} />
      case 'analytics': return <AnalyticsPage />
      case 'settings':
        return (
          <SettingsPage
            deleteConfig={deleteConfig}
            toggleDelete={toggleDelete}
            householdId={householdId}
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
      case 'alerts': return <AlertsPage householdId={householdId} memberOptions={members} accountOptions={accounts} instrumentOptions={instruments} canDelete={canDelete} />
      case 'tax': return <TaxPage householdId={householdId} memberOptions={members} canDelete={canDelete} />
      case 'valuation': return <ValuationPage householdId={householdId} accountOptions={accounts} instrumentOptions={instruments} canDelete={canDelete} />
      case 'insurance': return <InsurancePage householdId={householdId} memberOptions={members} accountOptions={accounts} instrumentOptions={instruments} canDelete={canDelete} />
      case 'reports': return <ReportsPage householdId={householdId} accountOptions={accounts} />
      case 'help': return <HelpPage />
      case 'import': return <ImportPage householdId={householdId} memberOptions={members} accountOptions={accounts} instrumentOptions={instruments} />
      case 'maintenance': return <MaintenancePage />
      case 'gmail': return <GmailPage householdId={householdId} accountOptions={accounts} instrumentOptions={instruments} memberOptions={members} />
      case 'sms': return <SmsPage householdId={householdId} canDelete={canDelete} accountOptions={accounts} memberOptions={members} />
      case 'admin': return user.authenticated && user.role === 'super_admin' ? <AdminPage /> : <HomePage onNavigate={navigate} />
      default: return <HomePage onNavigate={navigate} />
    }
  }

  const breadcrumb = route === 'holdings' && subRoute === 'add'
    ? { parentLabel: 'Investments', current: 'Add Holding', onBack: () => navigate('holdings') }
    : route === 'instruments' && subRoute
      ? { parentLabel: 'Instruments', current: instrumentsFull.find((i) => i.id === Number(subRoute))?.label ?? 'Instrument', onBack: () => navigate('instruments') }
      : route === 'sms' && subRoute
        ? { parentLabel: 'SMS', current: 'Review SMS', onBack: () => navigate('sms') }
        : undefined

  return (
    <AppLayout
      route={route}
      onRouteChange={navigate}
      householdName={householdId ? (households.find((h) => h.id === householdId)?.label || '') : ''}
      breadcrumb={breadcrumb}
    >
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
      ) : null}
      <PageErrorBoundary key={route}>
        <Suspense fallback={<div className="flex justify-center py-16"><CoinSpinner size={48} /></div>}>
          {renderPage()}
        </Suspense>
      </PageErrorBoundary>
    </AppLayout>
  )
}

function AuthGate() {
  const { user } = useAuth()
  if (user.authenticated === false && user.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <CoinSpinner size={72} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TermsProvider>
        <ToastProvider>
          <PrivacyProvider>
            <AuthProvider>
              <AuthGate />
            </AuthProvider>
          </PrivacyProvider>
        </ToastProvider>
      </TermsProvider>
    </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
