import { useEffect, useMemo, useState } from 'react'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { expenseApi } from '../api/expenseApi'
import { ledgerApi } from '../api/ledgerApi'
import { getJson, toQueryString } from '../api/http'
import { normalizeApiError } from '../hooks/errorUtils'
import { CashFlowChart, type CashFlowPoint } from '../components/charts/CashFlowChart'
import { Money, useMaskedFmt } from '../components/common/Money'
import { usePrivacy } from '../context/PrivacyContext'
import { useChartTheme, ChartTooltip } from '../components/charts/chartTheme'
import type { SpendAnalytics, Transaction } from '../types/domain'

type Props = { householdId: number }

type TrendsTab = 'trends' | 'cashflow'
const TRENDS_TAB_KEY = 'trends:activeTab'

function loadTrendsTab(): TrendsTab {
  try {
    const raw = localStorage.getItem(TRENDS_TAB_KEY)
    return raw === 'cashflow' ? 'cashflow' : 'trends'
  } catch { return 'trends' }
}

type Granularity = 'day' | 'week' | 'month'

const RANGE_OPTIONS: Record<Granularity, { value: number; label: string }[]> = {
  day: [
    { value: 7, label: '7d' },
    { value: 14, label: '14d' },
    { value: 30, label: '30d' },
  ],
  week: [
    { value: 4, label: '4w' },
    { value: 8, label: '8w' },
    { value: 12, label: '12w' },
  ],
  month: [
    { value: 3, label: '3m' },
    { value: 6, label: '6m' },
    { value: 12, label: '12m' },
    { value: 24, label: '24m' },
  ],
}

const DEFAULT_PERIODS: Record<Granularity, number> = { day: 30, week: 8, month: 12 }

const SERIES = [
  { key: 'spend',             label: 'Spend',    color: '#f43f5e' },
  { key: 'income',            label: 'Income',   color: '#10b981' },
  { key: 'internal_transfer', label: 'Transfer', color: '#f59e0b' },
  { key: 'tracking',          label: 'Tracking', color: '#6366f1' },
]

const CATEGORY_COLORS: Record<string, string> = {
  spend: '#f43f5e', income: '#10b981', internal_transfer: '#f59e0b',
  tracking: '#6366f1', '': '#94a3b8',
  food: '#f43f5e', transport: '#f59e0b', utilities: '#0ea5e9',
  entertainment: '#a855f7', health: '#10b981', shopping: '#ec4899',
  education: '#6366f1', rent: '#8b5cf6', emi: '#ef4444', other: '#64748b',
}

// A single active drill-down filter for the transaction table below the charts.
type DrillDown =
  | { kind: 'period'; period: string; category?: string; label: string }
  | { kind: 'category'; category: string; label: string }
  | { kind: 'member'; memberId: number | null; label: string }

function periodDateRange(period: string, granularity: Granularity): { start: string; end: string } {
  if (granularity === 'month') {
    const [y, m] = period.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1))
    const end = new Date(Date.UTC(y, m, 0))
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  }
  if (granularity === 'week') {
    const start = new Date(period + 'T00:00:00Z')
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)
    return { start: period, end: end.toISOString().slice(0, 10) }
  }
  return { start: period, end: period }
}

export function SpendTrendsPage({ householdId }: Props) {
  const fmtINR = useMaskedFmt()
  const { hidden } = usePrivacy()
  const ct = useChartTheme()
  const [activeTab, setActiveTab] = useState<TrendsTab>(loadTrendsTab)
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [periods, setPeriods] = useState(DEFAULT_PERIODS.month)
  const [data, setData] = useState<SpendAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null)

  const changeTab = (tab: TrendsTab) => {
    setActiveTab(tab)
    try { localStorage.setItem(TRENDS_TAB_KEY, tab) } catch { /* ignore */ }
  }

  const changeGranularity = (g: Granularity) => {
    setGranularity(g)
    setPeriods(DEFAULT_PERIODS[g])
    setDrillDown(null)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    expenseApi.fetchSpendAnalytics(householdId, periods, undefined, granularity, periods)
      .then((res) => { if (active) setData(res) })
      .catch((e) => { if (active) setError(normalizeApiError(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [householdId, granularity, periods])

  // Build chart rows: one entry per period, columns for each classification series
  const chartRows = useMemo(() => {
    if (!data) return []
    const periodSet = new Set(data.by_month_category.map(r => r.month))
    data.by_month.forEach(r => periodSet.add(r.month))
    const allPeriods = Array.from(periodSet).sort()
    return allPeriods.map(period => {
      const row: Record<string, number | string> = { month: period }
      SERIES.forEach(s => {
        const match = data.by_month_category.find(r => r.month === period && r.category === s.key)
        row[s.key] = match ? match.amount : 0
      })
      return row
    })
  }, [data])

  const summaryByCls = useMemo(() => {
    if (!data) return {}
    const map: Record<string, number> = {}
    data.by_category.forEach(r => { map[r.category] = r.amount })
    return map
  }, [data])

  const totalIncome = summaryByCls['income'] ?? 0
  const totalSpend = summaryByCls['spend'] ?? 0
  const totalTransfer = summaryByCls['internal_transfer'] ?? 0
  const netFlow = totalIncome - totalSpend

  const cards = [
    { label: 'Income', value: totalIncome, color: '#10b981' },
    { label: 'Spend', value: totalSpend, color: '#f43f5e' },
    { label: 'Net Flow', value: netFlow, color: netFlow >= 0 ? '#10b981' : '#f43f5e' },
    { label: 'Transfers', value: totalTransfer, color: '#f59e0b' },
  ]

  const tabCls = (tab: TrendsTab) =>
    `tap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      activeTab === tab
        ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]'
        : 'text-[var(--text-muted)] hover:text-[var(--text)]'
    }`

  const pillCls = (active: boolean) =>
    `tap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
    }`

  const periodLabel = (period: string): string => {
    if (granularity === 'month') {
      const [y, m] = period.split('-').map(Number)
      return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    }
    if (granularity === 'week') {
      const { start, end } = periodDateRange(period, granularity)
      const fmt = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      return `${fmt(start)} – ${fmt(end)}`
    }
    return new Date(period + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="grid gap-4">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5 w-fit">
        <button type="button" onClick={() => changeTab('trends')} className={tabCls('trends')}>Trends</button>
        <button type="button" onClick={() => changeTab('cashflow')} className={tabCls('cashflow')}>Cash Flow</button>
      </div>

      {activeTab === 'cashflow' ? (
        <CashFlowSection householdId={householdId} />
      ) : (
        <>
          {/* Granularity + range selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">View:</span>
              <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
                {(['day', 'week', 'month'] as Granularity[]).map(g => (
                  <button key={g} type="button" onClick={() => changeGranularity(g)} className={pillCls(granularity === g)}>
                    {g === 'day' ? 'Daily' : g === 'week' ? 'Weekly' : 'Monthly'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">Range:</span>
              <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
                {RANGE_OPTIONS[granularity].map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => setPeriods(value)} className={pillCls(periods === value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary KPI cards */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{c.label}</p>
                <p className="mt-1.5 text-2xl font-bold leading-none" style={{ color: c.color }}>
                  <Money value={c.value} />
                </p>
              </div>
            ))}
          </section>

          {error && <p className="error">{error}</p>}

          {/* Grouped bar chart — all series, clickable bars drill into that period's transactions */}
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-base font-semibold text-[var(--text)]">
              {granularity === 'day' ? 'Daily' : granularity === 'week' ? 'Weekly' : 'Monthly'} Breakdown
            </h3>
            {loading ? (
              <div className="flex justify-center py-8"><CoinSpinner size={48} /></div>
            ) : chartRows.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No transactions in this window.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartRows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} />
                  <YAxis tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} tickFormatter={(v) => hidden ? '••' : `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip cursor={{ fill: ct.grid, opacity: 0.3 }} content={(p) => <ChartTooltip {...p} fmt={fmtINR} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {SERIES.map(s => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      fill={s.color}
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      onClick={(entry: unknown) => {
                        const row = entry as { month?: string }
                        if (!row?.month) return
                        setDrillDown({ kind: 'period', period: row.month, category: s.key, label: `${s.label} · ${periodLabel(row.month)}` })
                      }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </article>

          {/* Spend drill-down by category */}
          <SpendCategoryBreakdown
            householdId={householdId}
            granularity={granularity}
            periods={periods}
            onSelectCategory={(category, label) => setDrillDown({ kind: 'category', category, label })}
          />

          {/* By member */}
          {data && data.by_member.length > 0 && (
            <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-3 text-base font-semibold text-[var(--text)]">By Member</h3>
              <ul className="grid gap-2.5">
                {data.by_member.map((row) => {
                  const pct = data.total > 0 ? (row.amount / data.total) * 100 : 0
                  return (
                    <li key={row.member_id ?? 'unassigned'}>
                      <button
                        type="button"
                        onClick={() => setDrillDown({ kind: 'member', memberId: row.member_id, label: row.name })}
                        className="w-full text-left"
                      >
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-[var(--text)] hover:underline">{row.name}</span>
                          <span>
                            <strong className="text-[var(--text)]"><Money value={row.amount} /></strong>
                            <span className="ml-2 text-xs text-[var(--text-muted)]">{pct.toFixed(1)}%</span>
                          </span>
                        </div>
                        <div className="fill-bar">
                          <div className="fill-bar-inner bg-primary-500" style={{ width: `${pct}%` }} />
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </article>
          )}

          {/* Drill-down transaction table */}
          {drillDown && data && (
            <DrillDownTable
              householdId={householdId}
              drillDown={drillDown}
              granularity={granularity}
              windowStart={data.window.start}
              windowEnd={data.window.end}
              onClose={() => setDrillDown(null)}
            />
          )}
        </>
      )}
    </div>
  )
}

// Transaction table shown below the charts when a bar/category/member is clicked.
function DrillDownTable({ householdId, drillDown, granularity, windowStart, windowEnd, onClose }: {
  householdId: number
  drillDown: DrillDown
  granularity: Granularity
  windowStart: string
  windowEnd: string
  onClose: () => void
}) {
  const [rows, setRows] = useState<Transaction[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    const params: Parameters<typeof ledgerApi.listTransactionsPage>[0] = {
      householdId,
      page: 1,
      pageSize: 100,
      ordering: '-tx_date',
      txDateAfter: windowStart,
      txDateBefore: windowEnd,
    }

    if (drillDown.kind === 'period') {
      const { start, end } = periodDateRange(drillDown.period, granularity)
      params.txDateAfter = start
      params.txDateBefore = end
      if (drillDown.category) {
        if (drillDown.category === 'income') params.classification = 'income'
        else params.classification = drillDown.category
      }
    } else if (drillDown.kind === 'category') {
      params.classification = 'spend'
      params.spendCategory = drillDown.category
    } else if (drillDown.kind === 'member') {
      if (drillDown.memberId !== null) params.member = drillDown.memberId
    }

    ledgerApi.listTransactionsPage(params)
      .then(res => { if (active) { setRows(res.results); setCount(res.count) } })
      .catch((e) => { if (active) setError(normalizeApiError(e)) })
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false }
  }, [householdId, drillDown, granularity, windowStart, windowEnd])

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--text)]">{drillDown.label}</h3>
        <button type="button" onClick={onClose} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">✕ Close</button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><CoinSpinner size={36} /></div>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No transactions found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Description</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Type</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id} className="border-t border-[var(--border)]">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-faint)]">{t.tx_date}</td>
                  <td className="max-w-[20rem] truncate px-3 py-2 text-xs text-[var(--text-2)]" title={t.description || t.external_reference}>
                    {t.description || t.external_reference || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs capitalize text-[var(--text-muted)]">{t.transaction_type.replace(/_/g, ' ')}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold"><Money value={t.amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {count > rows.length && (
            <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Showing {rows.length} of {count} — narrow the range or category for more detail.</p>
          )}
        </div>
      )}
    </article>
  )
}

// Cash Flow tab — yearly income/expense/investment/savings breakdown
function CashFlowSection({ householdId }: { householdId: number }) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<CashFlowPoint[]>([])
  const [error, setError] = useState('')

  const load = async (hid: number, y: number) => {
    try {
      setError('')
      const q = toQueryString({ household_id: hid, year: y })
      const res = await getJson<{ cashflow: CashFlowPoint[] }>(`/api/cashflow?${q}`)
      setData(res.cashflow)
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  useEffect(() => { void load(householdId, year) }, [householdId, year])

  const totalIncome = data.reduce((s, r) => s + r.income, 0)
  const totalExpense = data.reduce((s, r) => s + r.expense, 0)
  const totalInvestment = data.reduce((s, r) => s + r.investment, 0)
  const totalSavings = data.reduce((s, r) => s + r.savings, 0)
  const savingsRate = totalIncome > 0 ? ((totalSavings / totalIncome) * 100).toFixed(1) : 'N/A'
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <>
      <section className="cards">
        <article className="card">
          <h2>Income</h2>
          <strong><Money value={totalIncome} /></strong>
        </article>
        <article className="card">
          <h2>Expense</h2>
          <strong><Money value={totalExpense} /></strong>
        </article>
        <article className="card">
          <h2>Investment</h2>
          <strong><Money value={totalInvestment} /></strong>
        </article>
        <article className="card">
          <h2>Savings Rate</h2>
          <strong>{savingsRate}{totalIncome > 0 ? '%' : ''}</strong>
        </article>
      </section>

      <article className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Monthly Cash Flow</h3>
          <label>
            Year&nbsp;
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        {data.length === 0 ? (
          <p>No transactions found for {year}.</p>
        ) : (
          <CashFlowChart data={data} />
        )}
      </article>

      <article className="panel">
        <h3>Monthly Breakdown</h3>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Income</th>
              <th>Expense</th>
              <th>Investment</th>
              <th>Savings</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td><Money value={r.income} /></td>
                <td><Money value={r.expense} /></td>
                <td><Money value={r.investment} /></td>
                <td style={{ color: r.savings >= 0 ? '#10b981' : '#f43f5e' }}><Money value={r.savings} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  )
}

// Separate spend-by-category breakdown pulled with classification=spend
function SpendCategoryBreakdown({
  householdId, granularity, periods, onSelectCategory,
}: { householdId: number; granularity: Granularity; periods: number; onSelectCategory: (category: string, label: string) => void }) {
  const [data, setData] = useState<SpendAnalytics | null>(null)
  useEffect(() => {
    let active = true
    expenseApi.fetchSpendAnalytics(householdId, periods, 'spend', granularity, periods)
      .then(r => { if (active) setData(r) })
      .catch(() => {})
    return () => { active = false }
  }, [householdId, granularity, periods])

  if (!data || data.by_category.length === 0) return null
  const total = data.total

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
      <h3 className="mb-3 text-base font-semibold text-[var(--text)]">Spend by Category</h3>
      <ul className="grid gap-2.5">
        {data.by_category.map(row => {
          const pct = total > 0 ? (row.amount / total) * 100 : 0
          const color = CATEGORY_COLORS[row.category] || '#64748b'
          const label = row.label || row.category || 'Uncategorised'
          return (
            <li key={row.category}>
              <button type="button" onClick={() => onSelectCategory(row.category, label)} className="w-full text-left">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-[var(--text)] hover:underline">{label}</span>
                  <span>
                    <strong className="text-[var(--text)]"><Money value={row.amount} /></strong>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">{pct.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="fill-bar">
                  <div className="fill-bar-inner" style={{ width: `${pct}%`, background: color }} />
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
