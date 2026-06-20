import { useEffect, useMemo, useState } from 'react'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { useApp } from '../context/AppContext'
import { fetchAnalytics, fetchHoldingsHistory } from '../api/analyticsApi'
import { useMaskedFmt } from '../components/common/Money'
import { KpiCard } from '../components/analytics/KpiCard'
import { MemberKpiStrip } from '../components/analytics/MemberKpiStrip'
import { HoldingsTable } from '../components/analytics/HoldingsTable'
import { InvestmentBarChart } from '../components/analytics/InvestmentBarChart'
import { ValuationTrendChart } from '../components/analytics/ValuationTrendChart'
import { AllocationPieChart } from '../components/charts/AllocationPieChart'
import type { AnalyticsPayload, HoldingsTrendPoint } from '../api/analyticsApi'
import type { DashboardHolding } from '../types/domain'
import { getJson, toQueryString } from '../api/http'

type Range = '1M' | '3M' | '6M' | '1Y' | 'All'
type GroupBy = 'category' | 'type'

const RANGE_MONTHS: Record<Exclude<Range, 'All'>, number> = {
  '1M': 1, '3M': 3, '6M': 6, '1Y': 12,
}

const TYPE_LABELS: Record<string, string> = {
  equity: 'Equity', mutual_fund: 'Mutual Fund', fd: 'FD', rd: 'RD',
  epf: 'EPF', ppf: 'PPF', nps: 'NPS', gold: 'Gold',
  real_estate: 'Real Estate', sip: 'SIP', insurance: 'Insurance',
  lending: 'Lending', cash: 'Cash', vehicle: 'Vehicle', liability: 'Liability', other: 'Other',
}

function subMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

const _d = new Date()
const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`

export function AnalyticsPage() {
  const { householdId, members } = useApp()
  const fmt = useMaskedFmt()

  const [asOf, setAsOf] = useState(today)
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('type')
  const [range, setRange] = useState<Range>('1Y')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [memberHoldings, setMemberHoldings] = useState<Record<number, DashboardHolding[]>>({})
  const [trendHistory, setTrendHistory] = useState<HoldingsTrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)

  // Fetch main analytics data
  useEffect(() => {
    if (!householdId) return
    setLoading(true)
    fetchAnalytics(householdId, asOf, selectedMemberId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [householdId, asOf, selectedMemberId])

  // Fetch holdings history for trend chart
  useEffect(() => {
    if (!householdId) return
    setTrendLoading(true)
    fetchHoldingsHistory(householdId, selectedType, selectedMemberId)
      .then(setTrendHistory)
      .catch(console.error)
      .finally(() => setTrendLoading(false))
  }, [householdId, selectedType, selectedMemberId])

  // Fetch per-member holdings for KPI strip
  useEffect(() => {
    if (!householdId || !data) return
    const memberIds = data.membersNetworth.filter(m => m.include_in_networth).map(m => m.member_id)
    Promise.all(
      memberIds.map(mid =>
        getJson<{ holdings: DashboardHolding[] }>(
          `/api/holdings?${toQueryString({ household_id: householdId, as_of: asOf, member_id: mid })}`
        ).then(r => [mid, r.holdings ?? []] as [number, DashboardHolding[]])
      )
    ).then(entries => {
      setMemberHoldings(Object.fromEntries(entries))
    }).catch(() => {})
  }, [householdId, asOf, data?.membersNetworth])

  // Filter holdings by selected type
  const filteredHoldings = useMemo(() => {
    const holdings = data?.holdings ?? []
    return selectedType ? holdings.filter(h => h.instrument_type === selectedType) : holdings
  }, [data, selectedType])

  // Available types from all holdings (for filter dropdown)
  const availableTypes = useMemo(() => {
    const types = new Set((data?.holdings ?? []).map(h => h.instrument_type))
    return Array.from(types).sort()
  }, [data])

  // KPI totals from filtered holdings
  const { totalCurrent, totalInvested, totalGain, totalGainPct } = useMemo(() => {
    const totalCurrent = filteredHoldings.reduce((s, h) => s + parseFloat(h.market_value), 0)
    const totalInvested = filteredHoldings.reduce((s, h) => s + parseFloat(h.net_invested), 0)
    const totalGain = totalCurrent - totalInvested
    const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : null
    return { totalCurrent, totalInvested, totalGain, totalGainPct }
  }, [filteredHoldings])

  const gainPositive = totalGain >= 0

  // Sliced trend history for selected range
  const trendData = useMemo((): HoldingsTrendPoint[] => {
    if (range === 'All') return trendHistory
    const from = subMonths(asOf, RANGE_MONTHS[range])
    return trendHistory.filter(p => p.date >= from && p.date <= asOf)
  }, [trendHistory, range, asOf])

  // Grouped data for Invested vs Current cards
  const groupedEntries = useMemo(() => {
    const catBreakdown = data?.categoryBreakdown ?? []
    const groups: Record<string, { invested: number; current: number; color?: string }> = {}
    if (groupBy === 'category') {
      for (const h of filteredHoldings) {
        const cat = catBreakdown.find(c => c.category_id === h.asset_category)
        const key = cat?.category_name ?? 'Uncategorised'
        if (!groups[key]) groups[key] = { invested: 0, current: 0, color: cat?.color }
        groups[key].invested += parseFloat(h.net_invested)
        groups[key].current += parseFloat(h.market_value)
      }
    } else {
      for (const h of filteredHoldings) {
        const key = TYPE_LABELS[h.instrument_type] ?? h.instrument_type
        if (!groups[key]) groups[key] = { invested: 0, current: 0 }
        groups[key].invested += parseFloat(h.net_invested)
        groups[key].current += parseFloat(h.market_value)
      }
    }
    return Object.entries(groups).sort((a, b) => b[1].current - a[1].current)
  }, [filteredHoldings, groupBy, data?.categoryBreakdown])

  const RANGES: Range[] = ['1M', '3M', '6M', '1Y', 'All']

  return (
    <section className="grid gap-6 pb-24">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[var(--text-muted)]">Member</label>
          <select
            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-400"
            value={selectedMemberId ?? ''}
            onChange={e => setSelectedMemberId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">All members</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[var(--text-muted)]">Type</label>
          <select
            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-400"
            value={selectedType ?? ''}
            onChange={e => setSelectedType(e.target.value || null)}
          >
            <option value="">All types</option>
            {availableTypes.map(t => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[var(--text-muted)]">Group by</label>
          <select
            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-400"
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as GroupBy)}
          >
            <option value="type">Asset Type</option>
            <option value="category">Category</option>
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs font-medium text-[var(--text-muted)]">As of</label>
          <input
            type="date"
            value={asOf}
            max={today}
            onChange={e => setAsOf(e.target.value)}
            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>
      </div>

      {/* Household KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Current Value" value={fmt(totalCurrent)} loading={loading} />
        <KpiCard label="Invested" value={fmt(totalInvested)} loading={loading} />
        <KpiCard
          label="Gain / Loss"
          value={`${gainPositive ? '+' : ''}${fmt(totalGain)}`}
          loading={loading}
          sub={totalGainPct !== null ? [{
            label: '',
            value: `${gainPositive ? '+' : ''}${totalGainPct.toFixed(1)}%`,
            positive: gainPositive,
          }] : undefined}
        />
        <KpiCard
          label="XIRR"
          value={data?.xirr != null ? `${(data.xirr * 100).toFixed(1)}%` : '—'}
          loading={loading}
        />
      </div>

      {/* Per-member KPI strip */}
      {data && data.membersNetworth.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide">By Member</h2>
          <MemberKpiStrip
            members={data.membersNetworth}
            holdingsByMember={memberHoldings}
            selectedMemberId={selectedMemberId}
            onSelect={id => setSelectedMemberId(id)}
          />
        </div>
      )}

      {/* Investment Trend */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Investment Trend{selectedType ? ` — ${TYPE_LABELS[selectedType] ?? selectedType}` : ''}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">Invested vs current value over time</p>
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {RANGES.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === r
                    ? 'bg-primary-600 text-white'
                    : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {trendLoading ? (
          <div className="flex justify-center py-8"><CoinSpinner size={48} /></div>
        ) : (
          <ValuationTrendChart data={trendData} />
        )}
      </div>

      {/* Invested vs Current — grouped KPI cards + bar chart */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Invested vs Current — by {groupBy === 'category' ? 'Category' : 'Asset Type'}
          </h2>
        </div>

        {/* Bar chart */}
        <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          {loading ? (
            <div className="h-[260px] animate-pulse rounded-xl bg-[var(--surface-2)]" />
          ) : (
            <InvestmentBarChart
              holdings={filteredHoldings}
              categoryBreakdown={data?.categoryBreakdown ?? []}
              groupBy={groupBy}
            />
          )}
        </div>

        {/* KPI cards grid */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--surface-2)]" />)}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupedEntries.map(([name, v]) => {
              const gain = v.current - v.invested
              const gainPct = v.invested > 0 ? (gain / v.invested) * 100 : null
              const pos = gain >= 0
              return (
                <div key={name} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    {v.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: v.color }} />}
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] truncate">{name}</p>
                  </div>
                  <p className="text-xl font-bold text-[var(--text)]">{fmt(v.current)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-[var(--text-muted)]">Invested <span className="font-medium text-[var(--text)]">{fmt(v.invested)}</span></span>
                    {gainPct !== null && (
                      <span className={`font-medium ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        {pos ? '+' : ''}{fmt(gain)} ({pos ? '+' : ''}{gainPct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Allocation pie + category breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Allocation by Type</h2>
          {loading ? (
            <div className="h-52 animate-pulse rounded-xl bg-[var(--surface-2)]" />
          ) : (
            <AllocationPieChart data={data?.allocation ?? []} />
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Category Breakdown</h2>
          {loading ? (
            <div className="grid gap-2">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-8 animate-pulse rounded-lg bg-[var(--surface-2)]" />)}
            </div>
          ) : data?.categoryBreakdown.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No categories assigned yet.</p>
          ) : (
            <div className="grid gap-2">
              {data?.categoryBreakdown.map(c => (
                <div key={c.category_id ?? c.category_name} className="flex items-center gap-3">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color || '#6366f1' }} />
                  <span className="flex-1 truncate text-sm text-[var(--text)]">{c.category_name}</span>
                  <span className="text-sm font-medium text-[var(--text)]">{fmt(parseFloat(c.market_value))}</span>
                  <span className="w-10 text-right text-xs text-[var(--text-muted)]">{parseFloat(c.allocation_percent).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Holdings detail table */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Holdings Detail</h2>
        {loading ? (
          <div className="grid gap-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-9 animate-pulse rounded-lg bg-[var(--surface-2)]" />)}
          </div>
        ) : (
          <HoldingsTable
            holdings={filteredHoldings}
            categoryBreakdown={data?.categoryBreakdown ?? []}
          />
        )}
      </div>
    </section>
  )
}
