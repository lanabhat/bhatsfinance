import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { expenseApi } from '../api/expenseApi'
import { normalizeApiError } from '../hooks/errorUtils'
import { useMaskedFmt } from '../components/common/Money'
import { usePrivacy } from '../context/PrivacyContext'
import { useChartTheme, ChartTooltip } from '../components/charts/chartTheme'
import type { SpendAnalytics } from '../types/domain'

type Props = { householdId: number }

const WINDOW_OPTIONS = [3, 6, 12, 24]

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

export function SpendTrendsPage({ householdId }: Props) {
  const fmtINR = useMaskedFmt()
  const { hidden } = usePrivacy()
  const ct = useChartTheme()
  const [months, setMonths] = useState(12)
  const [data, setData] = useState<SpendAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    expenseApi.fetchSpendAnalytics(householdId, months)
      .then((res) => { if (active) setData(res) })
      .catch((e) => { if (active) setError(normalizeApiError(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [householdId, months])

  // Build chart rows: one entry per month, columns for each classification series
  const chartRows = useMemo(() => {
    if (!data) return []
    const monthSet = new Set(data.by_month_category.map(r => r.month))
    data.by_month.forEach(r => monthSet.add(r.month))
    const allMonths = Array.from(monthSet).sort()
    return allMonths.map(month => {
      const row: Record<string, number | string> = { month }
      SERIES.forEach(s => {
        const match = data.by_month_category.find(r => r.month === month && r.category === s.key)
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

  return (
    <div className="grid gap-4">
      {/* Window selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-[var(--text-muted)]">Window:</span>
        <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
          {WINDOW_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonths(m)}
              className={`tap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                months === m
                  ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{c.label}</p>
            <p className="mt-1.5 text-2xl font-bold leading-none" style={{ color: c.color }}>
              {fmtINR(c.value)}
            </p>
          </div>
        ))}
      </section>

      {error && <p className="error">{error}</p>}

      {/* Grouped bar chart — all series */}
      <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-base font-semibold text-[var(--text)]">Monthly Breakdown</h3>
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
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
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </article>

      {/* Spend drill-down by category */}
      <SpendCategoryBreakdown householdId={householdId} months={months} fmtINR={fmtINR} />

      {/* By member */}
      {data && data.by_member.length > 0 && (
        <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-base font-semibold text-[var(--text)]">By Member</h3>
          <ul className="grid gap-2.5">
            {data.by_member.map((row) => {
              const pct = data.total > 0 ? (row.amount / data.total) * 100 : 0
              return (
                <li key={row.member_id ?? 'unassigned'}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--text)]">{row.name}</span>
                    <span>
                      <strong className="text-[var(--text)]">{fmtINR(row.amount)}</strong>
                      <span className="ml-2 text-xs text-[var(--text-muted)]">{pct.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div className="fill-bar">
                    <div className="fill-bar-inner bg-primary-500" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </article>
      )}
    </div>
  )
}

// Separate spend-by-category breakdown pulled with classification=spend
function SpendCategoryBreakdown({
  householdId, months, fmtINR,
}: { householdId: number; months: number; fmtINR: (v: number) => string }) {
  const [data, setData] = useState<SpendAnalytics | null>(null)
  useEffect(() => {
    let active = true
    expenseApi.fetchSpendAnalytics(householdId, months, 'spend')
      .then(r => { if (active) setData(r) })
      .catch(() => {})
    return () => { active = false }
  }, [householdId, months])

  if (!data || data.by_category.length === 0) return null
  const total = data.total

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
      <h3 className="mb-3 text-base font-semibold text-[var(--text)]">Spend by Category</h3>
      <ul className="grid gap-2.5">
        {data.by_category.map(row => {
          const pct = total > 0 ? (row.amount / total) * 100 : 0
          const color = CATEGORY_COLORS[row.category] || '#64748b'
          return (
            <li key={row.category}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-[var(--text)]">{row.label || row.category || 'Uncategorised'}</span>
                <span>
                  <strong className="text-[var(--text)]">{fmtINR(row.amount)}</strong>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">{pct.toFixed(1)}%</span>
                </span>
              </div>
              <div className="fill-bar">
                <div className="fill-bar-inner" style={{ width: `${pct}%`, background: color }} />
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
