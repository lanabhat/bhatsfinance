import { Suspense, useEffect, useMemo, useState } from 'react'
import { Check, Plus, Upload, Wallet } from 'lucide-react'
import { lazyPage } from '../lib/lazyPage'
import { ActionItemsCard } from '../components/home/ActionItemsCard'
import { MarketCapSplitCard } from '../components/home/MarketCapSplitCard'
import { MemberCards } from '../components/home/MemberCards'
import { PortfolioSummaryCard } from '../components/home/PortfolioSummaryCard'
import { ChartCard } from '../components/charts/ChartCard'
import { Amount } from '../components/ui/Amount'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Chip } from '../components/ui/Chip'
import { DateText } from '../components/ui/DateText'
import { Delta } from '../components/ui/Delta'
import { EmptyState } from '../components/ui/EmptyState'
import { FilterBar } from '../components/ui/FilterBar'
import { Input } from '../components/ui/Input'
import { Menu } from '../components/ui/Menu'
import { PageLayout } from '../components/ui/PageLayout'
import { SectionHeader, SectionLink } from '../components/ui/SectionHeader'
import { Skeleton } from '../components/ui/Skeleton'
import { StatCard, StatStrip } from '../components/ui/StatCard'
import { useApp } from '../context/AppContext'
import { useMemberScope } from '../context/MemberScopeContext'
import { fdDetailsApi } from '../api/fdDetailsApi'
import { bondDetailsApi } from '../api/bondDetailsApi'
import { insuranceApi } from '../api/insuranceApi'
import { portfolioApi } from '../api/portfolioApi'
import { computeGain, fmtCount, fmtPercent } from '../lib/fmt'
import type { ChartRange } from '../lib/chartRange'
import { TYPE_LABELS } from '../lib/instrumentTypes'
import { assetTypeColor } from '../lib/palette'
import type { BondCouponDue, CategoryBreakdownItem, InsuranceSummary, MaturingBond, MaturingFD, MutualFundDetails } from '../types/domain'
import { useAllMemberHoldings } from '../hooks/useMemberHoldings'

const STORAGE_KEY = 'hw_excluded_types'
const MATURING_WINDOW_DAYS = 180
const VISIBLE_TYPE_CHIPS = 6

function loadExcluded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveExcluded(s: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...s])) } catch { /* not persisted */ }
}

const typeLabel = (t: string) => TYPE_LABELS[t] ?? t.replace(/_/g, ' ')

type Props = { onNavigate: (route: string) => void }

// Charts pull in Recharts (~100 KB); load them after the rest of Home has rendered.
const NetWorthTrendChart = lazyPage(() => import('../components/charts/NetWorthTrendChart'), 'NetWorthTrendChart')
const AllocationCard = lazyPage(() => import('../components/home/AllocationCard'), 'AllocationCard')

/** Snapshot nearest to (on or before) `days` before `asOf`. */
function snapshotBefore(history: { date: string; networth: number }[], asOf: string, days: number) {
  const d = new Date(`${asOf}T00:00:00`)
  d.setDate(d.getDate() - days)
  const cutoff = d.toISOString().slice(0, 10)
  let best: { date: string; networth: number } | null = null
  for (const p of history) if (p.date <= cutoff && (!best || p.date > best.date)) best = p
  return best
}

export function HomePage({ onNavigate }: Props) {
  const { householdId, dashboard, dashboardLoading, asOf, setAsOf, refreshDashboard, accounts, categories } = useApp()
  const { memberId, memberName } = useMemberScope()
  const [excluded, setExcluded] = useState<Set<string>>(loadExcluded)
  const [range, setRange] = useState<ChartRange>('1Y')
  const [maturingFDs, setMaturingFDs] = useState<MaturingFD[]>([])
  const [maturingBonds, setMaturingBonds] = useState<MaturingBond[]>([])
  const [insuranceSummary, setInsuranceSummary] = useState<InsuranceSummary | null>(null)
  const [bondCouponsDue, setBondCouponsDue] = useState<BondCouponDue[]>([])
  const [mfDetails, setMfDetails] = useState<MutualFundDetails[]>([])

  useEffect(() => {
    let active = true
    fdDetailsApi.listMaturing(householdId, MATURING_WINDOW_DAYS)
      .then((rows) => { if (active) setMaturingFDs(rows) })
      .catch(() => { if (active) setMaturingFDs([]) })
    bondDetailsApi.listMaturing(householdId, MATURING_WINDOW_DAYS)
      .then((rows) => { if (active) setMaturingBonds(rows) })
      .catch(() => { if (active) setMaturingBonds([]) })
    bondDetailsApi.listCouponsDue(householdId)
      .then((rows) => { if (active) setBondCouponsDue(rows) })
      .catch(() => { if (active) setBondCouponsDue([]) })
    insuranceApi.fetchSummary(householdId)
      .then((s) => { if (active) setInsuranceSummary(s) })
      .catch(() => { if (active) setInsuranceSummary(null) })
    portfolioApi.listMutualFundDetails()
      .then((rows) => { if (active) setMfDetails(rows) })
      .catch(() => { if (active) setMfDetails([]) })
    return () => { active = false }
  }, [householdId])

  const refreshBondCoupons = () =>
    bondDetailsApi.listCouponsDue(householdId).then(setBondCouponsDue).catch(() => setBondCouponsDue([]))

  const mfDetailsByInvestment = useMemo(() => {
    const m = new Map<number, MutualFundDetails>()
    for (const d of mfDetails) m.set(d.investment, d)
    return m
  }, [mfDetails])

  // Per-member holdings for "By member", the summary table and the member scope — cached
  // per household + date (shared with the Investments page's member view).
  const memberIds = useMemo(() => dashboard.membersNetworth.map((m) => m.member_id), [dashboard.membersNetworth])
  const { holdings: allMemberHoldings, accounts: allMemberAccounts } = useAllMemberHoldings(householdId, asOf, memberIds)

  // With a member selected in the header, every figure below is that member's share.
  const isMemberView = memberId !== null && dashboard.membersNetworth.some((m) => m.member_id === memberId)
  const baseHoldings = useMemo(
    () => (isMemberView ? (allMemberHoldings[memberId!] ?? []) : dashboard.holdings),
    [isMemberView, memberId, allMemberHoldings, dashboard.holdings],
  )
  const baseAccounts = useMemo(
    () => (isMemberView ? (allMemberAccounts[memberId!] ?? []) : dashboard.accounts),
    [isMemberView, memberId, allMemberAccounts, dashboard.accounts],
  )
  const baseNetworth = isMemberView
    ? parseFloat(dashboard.membersNetworth.find((m) => m.member_id === memberId)?.networth ?? '0')
    : parseFloat(dashboard.networth)

  const presentTypes = useMemo(() => {
    const value = new Map<string, number>()
    for (const h of baseHoldings) value.set(h.instrument_type, (value.get(h.instrument_type) ?? 0) + parseFloat(h.market_value))
    return [...value.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [baseHoldings])

  const setExcludedSaved = (next: Set<string>) => { setExcluded(next); saveExcluded(next) }
  const toggleType = (type: string) => {
    const next = new Set(excluded)
    if (next.has(type)) next.delete(type); else next.add(type)
    setExcludedSaved(next)
  }

  const activeHoldings = useMemo(
    () => baseHoldings.filter((h) => !excluded.has(h.instrument_type)),
    [baseHoldings, excluded],
  )
  const isFiltered = presentTypes.some((t) => excluded.has(t))

  // Accounts aren't filtered by type — only instrument holdings are excluded.
  const displayNetworth = useMemo(() => {
    if (!isFiltered) return baseNetworth
    const fullHoldings = baseHoldings.reduce((s, h) => s + parseFloat(h.market_value), 0)
    const shown = activeHoldings.reduce((s, h) => s + parseFloat(h.market_value), 0)
    return baseNetworth - fullHoldings + shown
  }, [isFiltered, baseNetworth, baseHoldings, activeHoldings])

  const totals = useMemo(() => {
    let value = 0, invested = 0
    for (const h of activeHoldings) {
      const mv = parseFloat(h.market_value)
      const ni = parseFloat(h.net_invested)
      value += mv
      invested += h.instrument_type === 'cash' ? mv : ni // cash never gains: count it at value
    }
    return { value, invested, ...computeGain(value, invested) }
  }, [activeHoldings])

  const filteredBreakdown = useMemo((): CategoryBreakdownItem[] => {
    if (!isFiltered && !isMemberView) return dashboard.categoryBreakdown
    const byCategory = new Map<number | null, { name: string; color: string; icon: string; total: number }>()
    for (const h of activeHoldings) {
      const key = h.asset_category
      if (!byCategory.has(key)) {
        const cat = dashboard.categoryBreakdown.find((c) => c.category_id === key)
        byCategory.set(key, { name: cat?.category_name ?? 'Uncategorised', color: cat?.color ?? 'var(--series-other)', icon: cat?.icon_name ?? '', total: 0 })
      }
      byCategory.get(key)!.total += parseFloat(h.market_value)
    }
    const total = [...byCategory.values()].reduce((s, v) => s + v.total, 0)
    return [...byCategory.entries()]
      .map(([id, v]) => ({
        category_id: id, category_name: v.name, color: v.color, icon_name: v.icon,
        market_value: v.total.toFixed(2),
        allocation_percent: total > 0 ? ((v.total / total) * 100).toFixed(2) : '0',
      }))
      .sort((a, b) => parseFloat(b.market_value) - parseFloat(a.market_value))
  }, [isFiltered, isMemberView, activeHoldings, dashboard.categoryBreakdown])

  // Household-level history only: a member's or a filtered net worth has no snapshots.
  const monthAgo = !isMemberView && !isFiltered ? snapshotBefore(dashboard.networthHistory, asOf, 30) : null
  const monthDelta = monthAgo && monthAgo.networth > 0 ? ((displayNetworth - monthAgo.networth) / monthAgo.networth) * 100 : null
  const xirr = isFiltered || isMemberView ? null : dashboard.xirr

  const loading = dashboardLoading && dashboard.holdings.length === 0
  const nothingYet = !dashboardLoading && dashboard.holdings.length === 0 && dashboard.accounts.length === 0

  const typeChips = presentTypes.length > 1 ? (
    <TypeChips types={presentTypes} excluded={excluded} onToggle={toggleType} />
  ) : null

  return (
    <PageLayout
      title="Home"
      description={isMemberView ? `Viewing ${memberName}’s share` : <>As of <DateText value={asOf} /></>}
      primaryAction={{ label: 'Add holding', onClick: () => onNavigate('holdings/add'), icon: <Plus /> }}
      moreActions={[
        { label: 'Import statements', icon: <Upload />, onSelect: () => onNavigate('import') },
        { label: 'Record a transaction', icon: <Wallet />, onSelect: () => onNavigate('expenses') },
      ]}
      aside={(
        <label className="hidden items-center gap-2 text-sm text-ink-muted md:flex">
          As of
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" aria-label="Show figures as of" />
        </label>
      )}
      summary={(
        <>
          <StatCard
            label={isMemberView ? `${memberName}’s net worth` : 'Net worth'}
            loading={loading}
            value={<Amount value={displayNetworth} format="compact" />}
            delta={(monthDelta !== null || xirr !== null) ? (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                {monthDelta !== null && <Delta value={monthDelta} label="1M" />}
                {xirr !== null && <span>XIRR {fmtPercent(xirr * 100)}</span>}
              </span>
            ) : isFiltered ? 'Filtered by type' : undefined}
          />
          <StatCard label="Invested" loading={loading} value={<Amount value={totals.invested} format="compact" />} subtitle="In holdings" />
          <StatCard
            label="Gain"
            loading={loading}
            value={<Amount value={totals.gain} format="compact" signed tone="gain" />}
            delta={<Delta value={totals.gainPct} label="on invested" />}
          />
          <StatCard
            label="Holdings"
            loading={loading}
            value={fmtCount(activeHoldings.length)}
            subtitle={`${fmtCount(baseAccounts.length)} account${baseAccounts.length === 1 ? '' : 's'}`}
            onClick={() => onNavigate('holdings')}
            actionLabel="Open Investments"
          />
        </>
      )}
      toolbar={typeChips && (
        <FilterBar
          extra={typeChips}
          extraChips={presentTypes.filter((t) => excluded.has(t)).map((t) => ({ key: t, label: `Hiding ${typeLabel(t)}`, onRemove: () => toggleType(t) }))}
          onClearAll={() => setExcludedSaved(new Set())}
        />
      )}
    >
      {nothingYet ? (
        <Card>
          <EmptyState
            size="page"
            icon={<Wallet />}
            title="No assets yet"
            description="Add your first holding or import a statement to see your net worth here."
            action={<Button variant="secondary" onClick={() => onNavigate('import')} icon={<Upload />}>Import statements</Button>}
          />
        </Card>
      ) : (
        <>
          <ActionItemsCard
            householdId={householdId}
            onNavigate={onNavigate}
            onChanged={refreshDashboard}
            accountOptions={accounts}
            maturingFDs={maturingFDs}
            maturingBonds={maturingBonds}
            maturingWindowDays={MATURING_WINDOW_DAYS}
            bondCouponsDue={bondCouponsDue}
            onCouponsChanged={refreshBondCoupons}
            missedSip={dashboard.missedSip}
            missedRD={dashboard.missedRD}
            missedPremiums={dashboard.missedPremiums}
            insurance={insuranceSummary}
          />

          {!isMemberView && !isFiltered && (
            <ChartCard
              title="Net worth trend"
              range={{ value: range, onChange: setRange }}
              loading={loading}
              empty={dashboard.networthHistory.length === 0 ? { title: 'No history yet', description: 'Snapshots are saved each time valuations run.' } : null}
              note="Solid: saved snapshots. Dashed: from the last snapshot to today’s live value."
            >
              <Suspense fallback={<Skeleton variant="chart" />}>
                <NetWorthTrendChart data={dashboard.networthHistory} live={{ date: asOf, value: parseFloat(dashboard.networth) }} range={range} />
              </Suspense>
            </ChartCard>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Suspense fallback={<Skeleton variant="card" />}>
              <AllocationCard items={filteredBreakdown} />
            </Suspense>
            {householdId > 0 && <MarketCapSplitCard householdId={householdId} asOf={asOf} />}
          </div>

          {dashboard.membersNetworth.length > 1 && (
            <MemberCards
              members={dashboard.membersNetworth}
              householdTotal={parseFloat(dashboard.networth)}
              holdingsByMember={allMemberHoldings}
              accountsByMember={allMemberAccounts}
              categories={categories}
              mfDetailsByInvestment={mfDetailsByInvestment}
            />
          )}

          {insuranceSummary && insuranceSummary.total_active > 0 && (
            <section className="grid gap-4" aria-label="Insurance coverage">
              <SectionHeader title="Insurance coverage" action={<SectionLink href="#/insurance" />} />
              <StatStrip className="lg:grid-cols-3">
                <StatCard label="Active policies" value={fmtCount(insuranceSummary.total_active)}
                  subtitle={Object.entries(insuranceSummary.by_type).map(([t, n]) => `${n} ${t.replace(/_/g, ' ')}`).join(' · ')} />
                <StatCard label="Sum insured" value={<Amount value={insuranceSummary.total_sum_insured} format="compact" />} />
                <StatCard label="Annual premium" value={<Amount value={insuranceSummary.total_annual_premium} format="compact" />} />
              </StatStrip>
            </section>
          )}

          {dashboard.holdings.length > 0 && (
            <PortfolioSummaryCard
              holdings={isFiltered ? dashboard.holdings.filter((h) => !excluded.has(h.instrument_type)) : dashboard.holdings}
              accounts={dashboard.accounts}
              memberHoldings={allMemberHoldings}
              memberAccounts={allMemberAccounts}
              membersNetworth={dashboard.membersNetworth}
              categoryBreakdown={dashboard.categoryBreakdown}
            />
          )}
        </>
      )}
    </PageLayout>
  )
}

/** Asset-type toggles: filled = included. The first six by value, the rest under "More". */
function TypeChips({ types, excluded, onToggle }: { types: string[]; excluded: Set<string>; onToggle: (t: string) => void }) {
  const shown = types.slice(0, VISIBLE_TYPE_CHIPS)
  const rest = types.slice(VISIBLE_TYPE_CHIPS)
  const swatch = (t: string) => <span className="h-2.5 w-2.5 rounded-sm" style={{ background: assetTypeColor(t) }} aria-hidden />
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Asset types included">
      {shown.map((t) => (
        <Chip key={t} selected={!excluded.has(t)} onClick={() => onToggle(t)} icon={swatch(t)}>{typeLabel(t)}</Chip>
      ))}
      {rest.length > 0 && (
        <Menu
          title="More asset types"
          items={rest.map((t) => ({
            label: typeLabel(t),
            icon: <Check className={excluded.has(t) ? 'invisible' : ''} />,
            onSelect: () => onToggle(t),
          }))}
          trigger={({ toggle, ref, open }) => (
            <Chip ref={ref} selected={false} onClick={toggle} title={open ? undefined : 'More asset types'}
              count={rest.length}>
              More{rest.some((t) => excluded.has(t)) ? ' (some hidden)' : ''}
            </Chip>
          )}
        />
      )}
    </div>
  )
}

