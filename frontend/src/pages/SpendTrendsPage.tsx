import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { expenseApi } from '../api/expenseApi'
import { normalizeApiError } from '../hooks/errorUtils'
import { useMaskedFmt } from '../components/common/Money'
import { usePrivacy } from '../context/PrivacyContext'
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
    // Collect all months in order
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

  // Summary per classification from by_category
  const summaryByCls = useMemo(() => {
    if (!data) return {}
    const map: Record<string, number> = {}
    data.by_category.forEach(r => { map[r.category] = r.amount })
    return map
  }, [data])

  const totalIncome = summaryByCls['income'] ?? 0
  const totalSpend = summaryByCls['spend'] ?? 0
  const netFlow = totalIncome - totalSpend

  return (
    <>
      {/* Window selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-[var(--text-muted)]">Window:</span>
        <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
          {WINDOW_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonths(m)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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

      {/* Summary cards */}
      <section className="cards">
        <article className="card">
          <h2>Income</h2>
          <strong style={{ color: '#10b981' }}>{fmtINR(totalIncome)}</strong>
        </article>
        <article className="card">
          <h2>Spend</h2>
          <strong style={{ color: '#f43f5e' }}>{fmtINR(totalSpend)}</strong>
        </article>
        <article className="card">
          <h2>Net Flow</h2>
          <strong style={{ color: netFlow >= 0 ? '#10b981' : '#f43f5e' }}>{fmtINR(netFlow)}</strong>
        </article>
        <article className="card">
          <h2>Transfers</h2>
          <strong style={{ color: '#f59e0b' }}>{fmtINR(summaryByCls['internal_transfer'] ?? 0)}</strong>
        </article>
      </section>

      {error && <p className="error">{error}</p>}

      {/* Grouped bar chart — all series */}
      <article className="panel">
        <h3>Monthly Breakdown</h3>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : chartRows.length === 0 ? (
          <p className="muted">No transactions in this window.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartRows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => hidden ? '••' : `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v, name) => [fmtINR(Number(v)), name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {SERIES.map(s => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </article>

      {/* Spend category breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {SERIES.map(s => {
          const sTotal = summaryByCls[s.key] ?? 0
          if (sTotal === 0) return null

          return (
            <article key={s.key} className="panel" style={{ marginBottom: 0 }}>
              <h3 style={{ color: s.color }}>{s.label}</h3>
              <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.25rem 0 0.75rem' }}>{fmtINR(sTotal)}</p>
            </article>
          )
        })}
      </div>

      {/* Spend drill-down by category (separate fetch only when useful) */}
      <SpendCategoryBreakdown householdId={householdId} months={months} fmtINR={fmtINR} />

      {/* By member */}
      {data && data.by_member.length > 0 && (
        <article className="panel">
          <h3>By Member</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.by_member.map((row) => {
              const pct = data.total > 0 ? (row.amount / data.total) * 100 : 0
              return (
                <li key={row.member_id ?? 'unassigned'} style={{ marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontWeight: 500 }}>{row.name}</span>
                    <span>
                      <strong>{fmtINR(row.amount)}</strong>
                      <span className="muted" style={{ marginLeft: '0.5rem' }}>{pct.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#6366f1' }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </article>
      )}
    </>
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
    <article className="panel">
      <h3>Spend by Category</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {data.by_category.map(row => {
          const pct = total > 0 ? (row.amount / total) * 100 : 0
          const color = CATEGORY_COLORS[row.category] || '#64748b'
          return (
            <li key={row.category} style={{ marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.2rem' }}>
                <span style={{ fontWeight: 500 }}>{row.label || row.category || 'Uncategorised'}</span>
                <span>
                  <strong>{fmtINR(row.amount)}</strong>
                  <span className="muted" style={{ marginLeft: '0.5rem' }}>{pct.toFixed(1)}%</span>
                </span>
              </div>
              <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color }} />
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
