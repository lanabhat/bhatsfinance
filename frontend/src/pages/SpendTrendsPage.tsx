import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { expenseApi } from '../api/expenseApi'
import { normalizeApiError } from '../hooks/errorUtils'
import { useMaskedFmt } from '../components/common/Money'
import { usePrivacy } from '../context/PrivacyContext'
import type { SpendAnalytics } from '../types/domain'

type Props = { householdId: number }

const WINDOW_OPTIONS = [3, 6, 12, 24]

const CLASSIFICATION_TABS = [
  { value: '',                   label: 'All',      color: '#6366f1' },
  { value: 'spend',              label: 'Spend',    color: '#f43f5e' },
  { value: 'income',             label: 'Income',   color: '#10b981' },
  { value: 'internal_transfer',  label: 'Transfer', color: '#f59e0b' },
  { value: 'tracking',           label: 'Tracking', color: '#64748b' },
]

const CATEGORY_COLORS: Record<string, string> = {
  food: '#f43f5e', transport: '#f59e0b', utilities: '#0ea5e9',
  entertainment: '#a855f7', health: '#10b981', shopping: '#ec4899',
  education: '#6366f1', rent: '#8b5cf6', emi: '#ef4444', other: '#64748b',
  spend: '#f43f5e', income: '#10b981', internal_transfer: '#f59e0b',
  tracking: '#64748b', '': '#94a3b8',
}

export function SpendTrendsPage({ householdId }: Props) {
  const fmtINR = useMaskedFmt()
  const { hidden } = usePrivacy()
  const [months, setMonths] = useState(12)
  const [classification, setClassification] = useState('')
  const [data, setData] = useState<SpendAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    expenseApi.fetchSpendAnalytics(householdId, months, classification || undefined)
      .then((res) => { if (active) setData(res) })
      .catch((e) => { if (active) setError(normalizeApiError(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [householdId, months, classification])

  const monthlyAvg = useMemo(() => {
    if (!data || data.by_month.length === 0) return 0
    return data.total / data.by_month.length
  }, [data])

  const peakMonth = useMemo(() => {
    if (!data || data.by_month.length === 0) return null
    return data.by_month.reduce((max, r) => r.amount > max.amount ? r : max, data.by_month[0])
  }, [data])

  const total = data?.total ?? 0
  const activeTab = CLASSIFICATION_TABS.find(t => t.value === classification) ?? CLASSIFICATION_TABS[0]
  const barColor = activeTab.color

  const totalLabel = classification === 'income' ? 'Total Income'
    : classification === 'spend' ? 'Total Spend'
    : classification === 'internal_transfer' ? 'Total Transfers'
    : classification === 'tracking' ? 'Total Tracked'
    : 'Total Volume'

  return (
    <>
      {/* Classification filter tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
        {CLASSIFICATION_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setClassification(tab.value)}
            className={`flex-1 min-w-[4rem] rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              classification === tab.value
                ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <section className="cards">
        <article className="card">
          <h2>{totalLabel}</h2>
          <strong>{fmtINR(total)}</strong>
          <span className="muted" style={{ fontSize: '0.78rem' }}>last {months} months</span>
        </article>
        <article className="card">
          <h2>Monthly Average</h2>
          <strong>{fmtINR(monthlyAvg)}</strong>
        </article>
        <article className="card">
          <h2>Peak Month</h2>
          <strong>{peakMonth ? fmtINR(peakMonth.amount) : '—'}</strong>
          <span className="muted" style={{ fontSize: '0.78rem' }}>{peakMonth?.month ?? ''}</span>
        </article>
        <article className="card">
          <h2>Window</h2>
          <label>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {WINDOW_OPTIONS.map((m) => <option key={m} value={m}>{m} months</option>)}
            </select>
          </label>
        </article>
      </section>

      {error && <p className="error">{error}</p>}

      {/* Monthly trend chart */}
      <article className="panel">
        <h3>Monthly Trend — {activeTab.label}</h3>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : !data || data.by_month.length === 0 ? (
          <p className="muted">No transactions in this window.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.by_month} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => hidden ? '••' : `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmtINR(Number(v))} />
              <Bar dataKey="amount" name={activeTab.label} fill={barColor} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </article>

      {/* Breakdown */}
      <article className="panel">
        <h3>{classification === 'spend' ? 'By Category' : 'By Classification'}</h3>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : !data || data.by_category.length === 0 ? (
          <p className="muted">No data.</p>
        ) : (
          <ul className="simple-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.by_category.map((row) => {
              const pct = total > 0 ? (row.amount / total) * 100 : 0
              const color = CATEGORY_COLORS[row.category] || '#64748b'
              return (
                <li key={row.category} style={{ marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontWeight: 500 }}>{row.label}</span>
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
        )}
      </article>

      {/* By member */}
      <article className="panel">
        <h3>By Member</h3>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : !data || data.by_member.length === 0 ? (
          <p className="muted">No member data.</p>
        ) : (
          <ul className="simple-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.by_member.map((row) => {
              const pct = total > 0 ? (row.amount / total) * 100 : 0
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
                    <div style={{ width: `${pct}%`, height: '100%', background: barColor }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </article>
    </>
  )
}
