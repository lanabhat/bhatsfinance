import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getJson, toQueryString } from '../api/http'
import { fetchHoldingsHistory } from '../api/analyticsApi'
import type { HoldingsTrendPoint } from '../api/analyticsApi'
import { ValuationTrendChart } from '../components/analytics/ValuationTrendChart'
import { AllocationTreemap } from '../components/analytics/dashboard/AllocationTreemap'
import { AssetClassBar } from '../components/analytics/dashboard/AssetClassBar'
import { DimensionBars } from '../components/analytics/dashboard/DimensionBars'
import { FactsTable } from '../components/analytics/dashboard/FactsTable'
import { DIM_LABELS, pct } from '../components/analytics/dashboard/facts'
import type { Fact, FactsPayload } from '../components/analytics/dashboard/facts'
import { useCrossFilter } from '../components/analytics/dashboard/useCrossFilter'
import { ChartCard } from '../components/charts/ChartCard'
import { Amount } from '../components/ui/Amount'
import { Card } from '../components/ui/Card'
import { Chip } from '../components/ui/Chip'
import { DateText } from '../components/ui/DateText'
import { Delta } from '../components/ui/Delta'
import { ErrorState } from '../components/ui/EmptyState'
import { FilterBar } from '../components/ui/FilterBar'
import { Input } from '../components/ui/Input'
import { PageLayout } from '../components/ui/PageLayout'
import { Skeleton } from '../components/ui/Skeleton'
import { StatCard } from '../components/ui/StatCard'
import { useMemberScope } from '../context/MemberScopeContext'
import { fmtCount } from '../lib/fmt'
import { filterByRange } from '../lib/chartRange'
import type { ChartRange } from '../lib/chartRange'


// Dashboard type labels back to instrument_type, for the value-over-time chart.
const TYPE_KEYS: Record<string, string> = {
  Stock: 'equity', ETF: 'etf', 'Mutual Fund': 'mutual_fund', FD: 'fd', RD: 'rd', Bond: 'bond', EPF: 'epf', PPF: 'ppf', NPS: 'nps',
  Gold: 'gold', 'Real Estate': 'real_estate', Lending: 'lending', Cash: 'cash', Vehicle: 'vehicle', Other: 'other',
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

  // The header's member scope picks the member here too (the chips still allow several).
  const { memberName } = useMemberScope()
  const { set: setFilter } = cf
  useEffect(() => {
    if (memberName) setFilter('member', [memberName])
  }, [memberName, setFilter])

  // Value over time follows a single selected member / type.
  const [range, setRange] = useState<ChartRange>('1Y')
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
  const trendData = filterByRange(trend, range, (p) => p.date, new Date(`${asOf}T00:00:00`)).filter((p) => p.date <= asOf)

  const bars = (dim: 'type' | 'member' | 'market_cap' | 'category' | 'classification' | 'provider', title: string, opts: { limit?: number; hint?: string; only?: (r: Fact) => boolean } = {}) => (
    <DimensionBars title={title} dim={dim}
      rows={opts.only ? cf.rowsFor(dim).filter(opts.only) : cf.rowsFor(dim)}
      selected={cf.selected(dim)} onToggle={(v) => cf.toggle(dim, v)} onClear={() => cf.clear(dim)}
      limit={opts.limit} hint={opts.hint} />
  )

  const firstLoad = loading && !facts
  const otherFilters = cf.active.filter((a) => a.dim !== 'member')

  return (
    <PageLayout
      title="Analytics"
      description={<>As of <DateText value={asOf} /> · every chart filters the others</>}
      aside={(
        <label className="hidden items-center gap-2 text-sm text-ink-muted md:flex">
          As of
          <Input type="date" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value)} className="w-40" aria-label="Show figures as of" />
        </label>
      )}
      summary={(
        <>
          <StatCard label="Value" loading={firstLoad} value={<Amount value={kpi.value} format="compact" />}
            subtitle={`${fmtCount(kpi.holdings)} holdings · ${fmtCount(kpi.members)} member${kpi.members === 1 ? '' : 's'}`} />
          <StatCard label="Invested" loading={firstLoad} value={<Amount value={kpi.invested} format="compact" />} />
          <StatCard label="Gain" loading={firstLoad} value={<Amount value={kpi.gain} format="compact" signed tone="gain" />}
            delta={<Delta value={kpi.gainPct} label="on invested" />} />
          <StatCard label="Equity share" loading={firstLoad} value={`${kpi.equityPct.toFixed(1)}%`} subtitle="Of value in view" />
        </>
      )}
      toolbar={(
        <FilterBar
          extra={(
            <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Members">
              <Chip selected={memberSel.size === 0} onClick={() => cf.clear('member')}>Whole household</Chip>
              {memberChips.map((m) => (
                <Chip key={m.name} selected={memberSel.has(m.name)} onClick={() => cf.toggle('member', m.name)}
                  title={m.included ? undefined : 'Not counted in household net worth — shown only when selected'}>
                  {m.included ? m.name : `${m.name} (excluded)`}
                </Chip>
              ))}
            </div>
          )}
          extraChips={otherFilters.map((a) => ({ key: `${a.dim}:${a.value}`, label: `${DIM_LABELS[a.dim]}: ${a.value}`, onRemove: () => cf.toggle(a.dim, a.value) }))}
          onClearAll={() => cf.clear()}
        />
      )}
    >
      {error && !facts ? (
        <Card><ErrorState message={error} /></Card>
      ) : firstLoad ? (
        <div className="grid gap-6 lg:grid-cols-3"><Skeleton variant="card" /><Skeleton variant="card" /><Skeleton variant="card" /></div>
      ) : (
        <div className={`grid min-w-0 gap-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-6 lg:grid-cols-3">
            {bars('type', 'Type', { hint: 'What you hold' })}
            <AssetClassBar rows={cf.rowsFor('asset_class')} selected={cf.selected('asset_class')}
              onToggle={(v) => cf.toggle('asset_class', v)} onClear={() => cf.clear('asset_class')} />
            {bars('member', 'Members', { hint: 'Who holds it' })}
          </div>

          <AllocationTreemap filters={cf.filters} rowsFor={cf.rowsFor} set={cf.set} toggle={cf.toggle} />

          <div className="grid gap-6 lg:grid-cols-2">
            {bars('market_cap', 'Market cap', { hint: 'Stocks + equity funds', only: (r) => r.market_cap !== '—' })}
            {bars('category', 'Category')}
            {bars('classification', 'Classification', { limit: 12, hint: 'Fund category, cap, debt…' })}
            {bars('provider', 'Fund house / provider', { limit: 10, only: (r) => r.provider !== '—' })}
          </div>

          <FactsTable rows={rows} selected={cf.selected('holding')} onToggle={(h) => cf.toggle('holding', h)} />

          <ChartCard
            title={`Value over time${oneTypeKey ? ` — ${cf.filters.type![0]}` : ''}${oneMember ? ` · ${oneMember.name}` : ''}`}
            subtitle="Invested vs current value. Follows the member and type when exactly one of each is selected."
            range={{ value: range, onChange: setRange }}
            loading={trendLoading}
            empty={trendData.length === 0 ? { title: 'No valuation history yet', description: 'Run a bulk snapshot or import holdings data to build history.' } : null}
            legend={[
              { key: 'invested', label: 'Invested', color: 'var(--series-other)', value: trendData[trendData.length - 1]?.invested },
              { key: 'current', label: 'Current', color: 'var(--primary)', value: trendData[trendData.length - 1]?.current },
            ]}
          >
            <ValuationTrendChart data={trendData} />
          </ChartCard>
        </div>
      )}
    </PageLayout>
  )
}
