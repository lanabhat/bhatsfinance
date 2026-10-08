import { useEffect, useMemo, useState } from 'react'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { useApp } from '../context/AppContext'
import { getJson, toQueryString } from '../api/http'
import { fetchHoldingsHistory } from '../api/analyticsApi'
import type { HoldingsTrendPoint } from '../api/analyticsApi'
import { KpiCard } from '../components/analytics/KpiCard'
import { ValuationTrendChart } from '../components/analytics/ValuationTrendChart'
import { AllocationTreemap } from '../components/analytics/dashboard/AllocationTreemap'
import { AssetClassBar } from '../components/analytics/dashboard/AssetClassBar'
import { DimensionBars } from '../components/analytics/dashboard/DimensionBars'
import { FactsTable } from '../components/analytics/dashboard/FactsTable'
import { DIM_LABELS, pct, useMoney } from '../components/analytics/dashboard/facts'
import type { Fact, FactsPayload } from '../components/analytics/dashboard/facts'
import { useCrossFilter } from '../components/analytics/dashboard/useCrossFilter'

type Range = '1M' | '3M' | '6M' | '1Y' | 'All'
const RANGES: Range[] = ['1M', '3M', '6M', '1Y', 'All']
const RANGE_MONTHS: Record<Exclude<Range, 'All'>, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }

// Dashboard type labels back to instrument_type, for the value-over-time chart.
const TYPE_KEYS: Record<string, string> = {
  Stock: 'equity', ETF: 'etf', 'Mutual Fund': 'mutual_fund', FD: 'fd', RD: 'rd', Bond: 'bond', EPF: 'epf', PPF: 'ppf', NPS: 'nps',
  Gold: 'gold', 'Real Estate': 'real_estate', Lending: 'lending', Cash: 'cash', Vehicle: 'vehicle', Other: 'other',
}

function subMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

const _d = new Date()
const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`

const EMPTY: Fact[] = []

/**
 * Asset-allocation dashboard. Every chart cross-filters the others: clicking a bar,
 * segment, treemap block or table row toggles it (several can be selected), the
 * other charts redraw for that selection, and the KPIs and table follow. The
 * selection is kept in the URL so a view can be bookmarked.
 */
export function AnalyticsPage() {
  const { householdId } = useApp()
  const money = useMoney()
  const [asOf, setAsOf] = useState(today)
  // Results are keyed by what they were loaded for, so "loading" is simply a key
  // mismatch, and a refetch keeps showing the previous view (dimmed) meanwhile.
  const factsKey = `${householdId}|${asOf}`
  const [loaded, setLoaded] = useState<{ key: string; facts?: FactsPayload; error?: string } | null>(null)
  useEffect(() => {
    if (!householdId) return
    let active = true
    getJson<FactsPayload>(`/api/analytics/facts?${toQueryString({ household_id: householdId, as_of: asOf })}`)
      .then((d) => { if (active) setLoaded({ key: factsKey, facts: d }) })
      .catch(() => { if (active) setLoaded((prev) => ({ key: factsKey, facts: prev?.facts, error: 'Could not load the dashboard data.' })) })
    return () => { active = false }
  }, [householdId, asOf, factsKey])
  const facts = loaded?.facts ?? null
  const loading = loaded?.key !== factsKey
  const error = loaded?.error ?? ''

  const cf = useCrossFilter(facts?.rows ?? EMPTY)
  const rows = cf.filtered

  // KPIs over the fully filtered view
  const kpi = useMemo(() => {
    const value = rows.reduce((s, r) => s + r.value, 0)
    const invested = rows.reduce((s, r) => s + r.invested, 0)
    const equity = rows.filter((r) => r.asset_class === 'Equity').reduce((s, r) => s + r.value, 0)
    return {
      value, invested, gain: value - invested, gainPct: invested > 0 ? ((value - invested) / invested) * 100 : null,
      equityPct: pct(equity, value),
      holdings: new Set(rows.map((r) => `${r.holding}|${r.type}`)).size,
      members: new Set(rows.map((r) => r.member)).size,
    }
  }, [rows])

  // Member chips: everyone in the household, plus "Unassigned" when something has no owner.
  const memberChips = useMemo(() => {
    const names = (facts?.members ?? []).map((m) => ({ name: m.name, included: m.included }))
    if ((facts?.rows ?? []).some((r) => r.member === 'Unassigned')) names.push({ name: 'Unassigned', included: true })
    return names
  }, [facts])
  const memberSel = cf.selected('member')

  // Value over time follows a single selected member / type.
  const [range, setRange] = useState<Range>('1Y')
  const oneMember = cf.filters.member?.length === 1 ? facts?.members.find((m) => m.name === cf.filters.member![0]) : undefined
  const oneTypeKey = cf.filters.type?.length === 1 ? TYPE_KEYS[cf.filters.type[0]] : undefined
  const trendKey = `${householdId}|${oneTypeKey ?? ''}|${oneMember?.id ?? ''}`
  const [trendLoaded, setTrendLoaded] = useState<{ key: string; points: HoldingsTrendPoint[] } | null>(null)
  useEffect(() => {
    if (!householdId) return
    let active = true
    fetchHoldingsHistory(householdId, oneTypeKey ?? null, oneMember?.id ?? null)
      .then((t) => { if (active) setTrendLoaded({ key: trendKey, points: t }) })
      .catch(() => { if (active) setTrendLoaded({ key: trendKey, points: [] }) })
    return () => { active = false }
  }, [householdId, oneTypeKey, oneMember?.id, trendKey])
  const trend = trendLoaded?.points ?? []
  const trendLoading = trendLoaded?.key !== trendKey
  const trendData = range === 'All' ? trend : trend.filter((p) => p.date >= subMonths(asOf, RANGE_MONTHS[range]) && p.date <= asOf)

  if (loading && !facts) return <div className="flex justify-center py-16"><CoinSpinner size={56} /></div>
  if (error && !facts) return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>

  const bars = (dim: 'type' | 'member' | 'market_cap' | 'category' | 'classification' | 'provider', title: string, opts: { limit?: number; hint?: string; only?: (r: Fact) => boolean } = {}) => (
    <DimensionBars title={title} dim={dim}
      rows={opts.only ? cf.rowsFor(dim).filter(opts.only) : cf.rowsFor(dim)}
      selected={cf.selected(dim)} onToggle={(v) => cf.toggle(dim, v)} onClear={() => cf.clear(dim)}
      limit={opts.limit} hint={opts.hint} />
  )

  return (
    <section className={`grid gap-4 pb-24 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {/* Filters: one row above everything they scope */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => cf.clear('member')}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${memberSel.size === 0
            ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
            : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]'}`}>
          Whole household
        </button>
        {memberChips.map((m) => (
          <button key={m.name} type="button" onClick={() => cf.toggle('member', m.name)}
            title={m.included ? undefined : 'Not counted in household net worth — shown only when selected'}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${memberSel.has(m.name)
              ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]'} ${m.included ? '' : 'border-dashed'}`}>
            {memberSel.has(m.name) ? '✓ ' : ''}{m.name}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-[var(--text-muted)]">
          As of
          <input type="date" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value)}
            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-[var(--text)]" />
        </label>
      </div>

      {cf.active.filter((a) => a.dim !== 'member').length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">Filtered by</span>
          {cf.active.filter((a) => a.dim !== 'member').map((a) => (
            <button key={`${a.dim}:${a.value}`} type="button" onClick={() => cf.toggle(a.dim, a.value)}
              className="flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-3)]">
              <span className="text-[var(--text-muted)]">{DIM_LABELS[a.dim]}:</span> {a.value} <span aria-hidden>✕</span>
            </button>
          ))}
          <button type="button" onClick={() => cf.clear()} className="ml-1 text-xs text-primary-600 hover:underline dark:text-primary-300">
            Clear all
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Value" value={money.compact(kpi.value)} />
        <KpiCard label="Invested" value={money.compact(kpi.invested)} />
        <KpiCard label="Gain" value={`${kpi.gain >= 0 ? '+' : ''}${money.compact(kpi.gain)}`}
          sub={kpi.gainPct !== null ? [{ label: '', value: `${kpi.gainPct >= 0 ? '+' : ''}${kpi.gainPct.toFixed(1)}%`, positive: kpi.gainPct >= 0 }] : undefined} />
        <KpiCard label="Equity share" value={`${kpi.equityPct.toFixed(1)}%`} />
        <KpiCard label="Holdings" value={String(kpi.holdings)} />
        <KpiCard label="Members" value={String(kpi.members)} />
      </div>

      {/* Overview */}
      <div className="grid gap-4 lg:grid-cols-3">
        {bars('type', 'Type', { hint: 'What you hold' })}
        <AssetClassBar rows={cf.rowsFor('asset_class')} selected={cf.selected('asset_class')}
          onToggle={(v) => cf.toggle('asset_class', v)} onClear={() => cf.clear('asset_class')} />
        {bars('member', 'Members', { hint: 'Who holds it' })}
      </div>

      <AllocationTreemap filters={cf.filters} rowsFor={cf.rowsFor} set={cf.set} toggle={cf.toggle} />

      {/* Drill-downs */}
      <div className="grid gap-4 lg:grid-cols-2">
        {bars('market_cap', 'Market cap', { hint: 'Stocks + equity funds', only: (r) => r.market_cap !== '—' })}
        {bars('category', 'Category')}
        {bars('classification', 'Classification', { limit: 12, hint: 'Fund category, cap, debt…' })}
        {bars('provider', 'Fund house / provider', { limit: 10, only: (r) => r.provider !== '—' })}
      </div>

      <FactsTable rows={rows} selected={cf.selected('holding')} onToggle={(h) => cf.toggle('holding', h)} />

      {/* Value over time (single member / type when exactly one is selected) */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">
              Value over time{oneTypeKey ? ` — ${cf.filters.type![0]}` : ''}{oneMember ? ` · ${oneMember.name}` : ''}
            </h3>
            <p className="text-xs text-[var(--text-muted)]">Invested vs current value. Follows the member and type when one of each is selected.</p>
          </div>
          <div className="ml-auto flex gap-1.5">
            {RANGES.map((r) => (
              <button key={r} type="button" onClick={() => setRange(r)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${range === r ? 'bg-primary-600 text-white'
                  : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {trendLoading ? <div className="flex justify-center py-8"><CoinSpinner size={48} /></div> : <ValuationTrendChart data={trendData} />}
      </div>
    </section>
  )
}
