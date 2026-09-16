import { useEffect, useMemo, useState } from 'react'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { postJson } from '../api/http'
import { investmentApi } from '../api/investmentApi'
import { portfolioApi } from '../api/portfolioApi'
import { CategorySection } from '../components/assets/CategorySection'
import { InstrumentForm } from '../components/assets/InstrumentForm'
import { InstrumentRow } from '../components/assets/InstrumentRow'
import { InstrumentExpandedDetail } from '../components/assets/InstrumentExpandedDetail'
import { InvestmentForm } from '../components/assets/InvestmentForm'
import { AssetCategoryForm } from '../components/assets/AssetCategoryForm'
import { ExpandableGridCard } from '../components/common/ExpandableGridCard'
import { Money } from '../components/common/Money'
import { useExpandable } from '../hooks/useExpandable'
import { Sheet } from '../components/ui/Sheet'
import { DataTable } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import { BuyForm } from '../components/holdings/BuyForm'
import { SellForm } from '../components/holdings/SellForm'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { computeGain, formatMaturity } from '../lib/fmt'
import { TYPE_ICONS, TYPE_LABELS } from '../lib/instrumentTypes'
import { fdDetailsApi } from '../api/fdDetailsApi'
import type { MaturityInfo } from '../components/assets/InstrumentRow'
import type { AssetCategory, BondDetails, DashboardHolding, FDDetails, Instrument, InstrumentOwnership, Investment, MutualFundDetails } from '../types/domain'

// ── shared helpers ────────────────────────────────────────────────────────────
const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

// ── valuation form ────────────────────────────────────────────────────────────
function ValuationForm({ householdId, instrumentId, instrumentName, onSave, onCancel }: {
  householdId: number; instrumentId: number; instrumentName: string
  onSave: () => void; onCancel: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [unitPrice, setUnitPrice] = useState('')
  const [marketValue, setMarketValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!unitPrice && !marketValue) { setError('Enter either unit price or market value.'); return }
    setSaving(true); setError('')
    try {
      await postJson('/api/valuations/', {
        household: householdId, instrument: instrumentId,
        valuation_date: date,
        unit_price: unitPrice || null,
        market_value: marketValue || null,
        source: 'manual',
      })
      onSave()
    } catch { setError('Failed to save.') } finally { setSaving(false) }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-[var(--text-muted)]">{instrumentName}</p>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INP} /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Unit Price</label>
        <input type="number" min="0" step="0.000001" placeholder="e.g. 94.50" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={INP} /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Market Value (total)</label>
        <input type="number" min="0" step="0.01" placeholder="e.g. 50000" value={marketValue} onChange={(e) => setMarketValue(e.target.value)} className={INP} /></div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
        <button type="button" disabled={saving} onClick={save} className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
type SheetState =
  | { type: 'none' }
  | { type: 'valuation'; instrumentId: number; instrumentName: string }
  | { type: 'buy'; instrumentId?: number; investmentId?: number }
  | { type: 'sell'; instrumentId: number; investmentId?: number; holdingName: string; currentQuantity: string | null }
  | { type: 'edit_instrument'; instrument: Instrument }
  | { type: 'edit_investment'; investment: Investment }
  | { type: 'category'; item?: AssetCategory }

type HoldingGroupBy = 'fund' | 'fund_category' | 'sub_category' | 'type' | 'category' | 'none'

// Table view's row model: either a real holding, or (only under 'fund'
// grouping) a synthetic rollup row representing several folios of the same
// fund collapsed into one expandable row — DataTable's groupBy prop can't
// express "one row that expands into a nested table," so this stays a
// page-level transform feeding a flat DataTable, per the design in the
// project's DataTable migration plan.
type DisplayRow =
  | { kind: 'holding'; holding: DashboardHolding }
  | { kind: 'fund_rollup'; key: string; fundName: string; folios: DashboardHolding[]; totalInvested: number; totalValue: number }

const SUB_CATEGORY_LABELS: Record<string, string> = {
  debt: 'Debt', equity: 'Equity', liquid: 'Liquid', retirement: 'Retirement',
  hybrid: 'Hybrid', gold: 'Gold', real_asset: 'Real Asset', other: 'Other',
}
type HoldingSortBy = 'value' | 'gain' | 'gainPct' | 'name' | 'invested'

const MF_TYPES = new Set(['mutual_fund', 'sip'])
const QUANTITY_TRACKED_TYPES = new Set(['equity', 'mutual_fund', 'sip', 'bond'])

type ViewMode = 'table' | 'card'
const VIEW_MODE_KEY = 'holdings:viewMode'

function loadViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY)
    return raw === 'card' ? 'card' : 'table'
  } catch { return 'table' }
}

export function HoldingsPage() {
  const { canWrite } = useAuth()
  const { householdId, categories, refreshCategories, dashboard, members, asOf, refreshDashboard } = useApp()
  const [activeMemberId, setActiveMemberId] = useState<number | null>(null)
  const [memberHoldings, setMemberHoldings] = useState<typeof dashboard.holdings | null>(null)
  const [holdingsLoading, setHoldingsLoading] = useState(false)
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [ownerships, setOwnerships] = useState<InstrumentOwnership[]>([])
  const [mfDetails, setMfDetails] = useState<MutualFundDetails[]>([])
  const [fdDetails, setFdDetails] = useState<FDDetails[]>([])
  const [bondDetails, setBondDetails] = useState<BondDetails[]>([])
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' })
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<HoldingGroupBy>('fund')
  const [sortBy, setSortBy] = useState<HoldingSortBy>('value')
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  const cardExpand = useExpandable<number | string>()

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem(VIEW_MODE_KEY, mode) } catch { /* ignore */ }
  }

  const loadInstruments = () => portfolioApi.listInstruments(householdId).then(setInstruments).catch(() => {})
  const loadInvestments = () => investmentApi.listInvestments({ household: householdId }).then(setInvestments).catch(() => {})
  const loadOwnerships = () => portfolioApi.listInstrumentOwnerships(undefined, 200).then(setOwnerships).catch(() => {})
  const loadMfDetails = () => portfolioApi.listMutualFundDetails().then(setMfDetails).catch(() => {})
  const loadFdDetails = () => fdDetailsApi.list().then(setFdDetails).catch(() => {})
  const loadBondDetails = () => portfolioApi.listBondDetails().then(setBondDetails).catch(() => {})

  useEffect(() => { void loadInstruments(); void loadInvestments(); void loadOwnerships(); void loadMfDetails(); void loadFdDetails(); void loadBondDetails() }, [householdId])

  // Resync instruments/investments whenever holdings change (e.g. after an import adds new ones)
  useEffect(() => { void loadInstruments(); void loadInvestments(); void loadMfDetails(); void loadFdDetails(); void loadBondDetails() }, [dashboard.holdings])

  const mfDetailsByInvestment = useMemo(() => {
    const m = new Map<number, MutualFundDetails>()
    for (const d of mfDetails) m.set(d.investment, d)
    return m
  }, [mfDetails])

  const maturityByInstrument = useMemo(() => {
    // An instrument can hold several FD/Bond deposits (e.g. 2 FDs under one
    // "HDFC Bank FD" instrument) — keep every leg, not just the last one
    // seen, so none of them silently disappear from the maturity display.
    const m = new Map<number, (MaturityInfo & { investmentDate: string })[]>()
    const push = (instrumentId: number, entry: MaturityInfo & { investmentDate: string }) => {
      const list = m.get(instrumentId)
      if (list) list.push(entry); else m.set(instrumentId, [entry])
    }
    for (const d of fdDetails) push(d.instrument, { date: d.maturity_date, rate: d.annual_rate, investmentDate: d.investment_date })
    for (const d of bondDetails) push(d.instrument, { date: d.maturity_date, rate: d.coupon_rate, investmentDate: d.investment_date })
    for (const list of m.values()) list.sort((a, b) => a.date.localeCompare(b.date))
    return m
  }, [fdDetails, bondDetails])

  const ownerMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const o of ownerships) {
      const label = members.find((mb) => mb.id === o.member)?.label ?? `#${o.member}`
      m.set(o.instrument, m.has(o.instrument) ? `${m.get(o.instrument)}, ${label}` : label)
    }
    return m
  }, [ownerships, members])

  const investmentsById = useMemo(() => {
    const m = new Map<number, Investment>()
    for (const iv of investments) m.set(iv.id, iv)
    return m
  }, [investments])

  const investmentOwnerMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const iv of investments) {
      if (iv.member == null) continue
      m.set(iv.id, members.find((mb) => mb.id === iv.member)?.label ?? `#${iv.member}`)
    }
    return m
  }, [investments, members])

  useEffect(() => {
    if (activeMemberId === null) { setMemberHoldings(null); return }
    setHoldingsLoading(true)
    const q = new URLSearchParams({ household_id: String(householdId), as_of: asOf, member_id: String(activeMemberId) })
    fetch(`/api/holdings?${q}`).then((r) => r.json()).then((d) => setMemberHoldings(d.holdings ?? [])).catch(() => setMemberHoldings([])).finally(() => setHoldingsLoading(false))
  }, [activeMemberId, householdId, asOf])

  const close = () => setSheet({ type: 'none' })
  const afterBuy = async () => { close(); await refreshDashboard(); await loadInstruments(); await loadInvestments(); await loadOwnerships() }
  const afterSell = async () => { close(); await refreshDashboard(); await loadInstruments(); await loadInvestments(); await loadOwnerships() }
  const afterValuation = async () => { close(); await refreshDashboard() }

  const activeHoldings = useMemo(() => {
    const all = activeMemberId !== null ? (memberHoldings ?? []) : dashboard.holdings
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((h) => h.display_name.toLowerCase().includes(q))
  }, [activeMemberId, memberHoldings, dashboard.holdings, search])

  // A fully-sold position (quantity nets to 0) still comes back from the
  // holdings API — compute_holdings() never filters it out — so it has to
  // be split out here, or it'd sit in the normal list at a near-zero value
  // forever. Shown separately with realized (not unrealized) gain/loss.
  // Only equity/MF/SIP track quantity via BUY/SELL (see _signed_quantity in
  // insights/services.py) — every other type (FD, EPF, PPF, NPS, insurance,
  // lending, real estate, gold, ...) is value-based and always nets to a
  // quantity of 0 even while fully open, so it must never be treated as closed.
  const isQuantityTracked = (h: DashboardHolding) => QUANTITY_TRACKED_TYPES.has(h.instrument_type)
  const openHoldings = useMemo(
    () => activeHoldings.filter((h) => !isQuantityTracked(h) || parseFloat(h.quantity) !== 0),
    [activeHoldings],
  )
  const closedHoldings = useMemo(
    () => activeHoldings.filter((h) => isQuantityTracked(h) && parseFloat(h.quantity) === 0),
    [activeHoldings],
  )

  const resolveInstrument = (h: DashboardHolding): Instrument =>
    instruments.find((i) => i.id === h.instrument_id) ?? {
      id: h.instrument_id,
      name: h.instrument_name,
      instrument_type: h.instrument_type as Instrument['instrument_type'],
      sub_category: '',
      asset_category: h.asset_category,
      household: householdId,
      default_account: null,
      symbol: '',
      metadata: {},
      is_active: true,
      include_in_rebalancing: true,
    }

  // Investment-backed holdings (MF/SIP) are one row per fund/folio, not per
  // shell instrument — key/expand-state on investment_id when present so
  // multiple funds under the same shell don't collide.
  const rowKey = (h: DashboardHolding): string | number => h.investment_id ?? h.instrument_id

  const openEdit = (h: DashboardHolding, inst: Instrument) => {
    if (h.investment_id) {
      const investment = investmentsById.get(h.investment_id)
      if (investment) { setSheet({ type: 'edit_investment', investment }); return }
    }
    setSheet({ type: 'edit_instrument', instrument: inst })
  }

  const holdingsSections = useMemo(() => {
    // Card view only — always sorts descending by the selected field (no
    // asc/desc toggle here; table view sorts via DataTable's own clickable
    // headers instead, see the tableView render below).
    const sortFn = (a: DashboardHolding, b: DashboardHolding) => {
      if (sortBy === 'name') return a.instrument_name.localeCompare(b.instrument_name)
      if (sortBy === 'invested') return parseFloat(b.net_invested) - parseFloat(a.net_invested)
      if (sortBy === 'gain') {
        const gainA = computeGain(parseFloat(a.market_value), parseFloat(a.net_invested), a.instrument_type).gain
        const gainB = computeGain(parseFloat(b.market_value), parseFloat(b.net_invested), b.instrument_type).gain
        return gainB - gainA
      }
      if (sortBy === 'gainPct') {
        const pctA = computeGain(parseFloat(a.market_value), parseFloat(a.net_invested), a.instrument_type).gainPct ?? -Infinity
        const pctB = computeGain(parseFloat(b.market_value), parseFloat(b.net_invested), b.instrument_type).gainPct ?? -Infinity
        return pctB - pctA
      }
      return parseFloat(b.market_value) - parseFloat(a.market_value)
    }

    const renderRow = (h: DashboardHolding, catOverride?: AssetCategory) => {
      const cat = catOverride ?? categories.find(c => c.id === h.asset_category)
      const inst = resolveInstrument(h)
      const key = rowKey(h)
      const maturities = maturityByInstrument.get(h.instrument_id)
      const isExpanded = cardExpand.isExpanded(key)
      return (
        <ExpandableGridCard
          key={key}
          expanded={isExpanded}
          onToggle={() => cardExpand.toggle(key)}
          className={isExpanded ? 'ring-2 ring-primary-400 ring-offset-1 rounded-xl' : ''}
          collapsed={
            <InstrumentRow instrument={inst} holding={h} category={cat} maturities={maturities}
              onBuy={canWrite ? () => setSheet({ type: 'buy', instrumentId: inst.id, investmentId: h.investment_id ?? undefined }) : undefined}
              onUpdateValue={canWrite ? () => setSheet({ type: 'valuation', instrumentId: inst.id, instrumentName: inst.name }) : undefined}
            />
          }
        >
          <InstrumentExpandedDetail
            householdId={householdId}
            holding={h}
            instrument={inst}
            maturities={maturities}
            onBuy={() => setSheet({ type: 'buy', instrumentId: inst.id, investmentId: h.investment_id ?? undefined })}
            onSell={() => setSheet({ type: 'sell', instrumentId: inst.id, investmentId: h.investment_id ?? undefined, holdingName: h.display_name, currentQuantity: h.quantity })}
            onUpdateValue={() => setSheet({ type: 'valuation', instrumentId: inst.id, instrumentName: inst.name })}
            onEdit={() => openEdit(h, inst)}
            onTransactionsChanged={async () => { await refreshDashboard(); await loadInstruments(); await loadInvestments() }}
            onDeleted={async () => { await refreshDashboard(); await loadInstruments(); await loadInvestments() }}
          />
        </ExpandableGridCard>
      )
    }

    if (groupBy === 'none') {
      const sorted = [...openHoldings].sort(sortFn)
      return <div className="card-grid grid gap-3">{sorted.map(h => renderRow(h))}</div>
    }

    if (groupBy === 'type') {
      const groups = new Map<string, DashboardHolding[]>()
      for (const h of openHoldings) {
        const key = TYPE_LABELS[h.instrument_type] ?? h.instrument_type
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(h)
      }
      return [...groups.entries()].sort((a, b) => {
        const aVal = a[1].reduce((s, h) => s + parseFloat(h.market_value), 0)
        const bVal = b[1].reduce((s, h) => s + parseFloat(h.market_value), 0)
        return bVal - aVal
      }).map(([label, group]) => {
        const sorted = [...group].sort(sortFn)
        const total = group.reduce((s, h) => s + parseFloat(h.market_value), 0).toFixed(2)
        return (
          <CategorySection key={label} name={label} color="#b4521f" totalValue={total} count={group.length} gridChildren>
            {sorted.map(h => renderRow(h))}
          </CategorySection>
        )
      })
    }

    if (groupBy === 'fund') {
      // Roll up MF/SIP holdings that share the same fund name (same scheme,
      // different folio/Investment) into one card; everything else is one
      // holding = one group, same as today. Each Investment is already one
      // folio, so display_name (the real scheme name) is a stable grouping
      // key without needing to strip a folio suffix from the shell name.
      const fundGroups = new Map<string, DashboardHolding[]>()
      const singles: DashboardHolding[] = []
      for (const h of openHoldings) {
        if (!MF_TYPES.has(h.instrument_type)) { singles.push(h); continue }
        const key = h.display_name
        if (!fundGroups.has(key)) fundGroups.set(key, [])
        fundGroups.get(key)!.push(h)
      }

      const fundSections = [...fundGroups.entries()].map(([fundName, group]) => {
        const sorted = [...group].sort(sortFn)
        const totalInvested = group.reduce((s, h) => s + parseFloat(h.net_invested), 0)
        const totalValue = group.reduce((s, h) => s + parseFloat(h.market_value), 0)
        const { gain, gainPct } = computeGain(totalValue, totalInvested, 'mutual_fund')
        const isSingleFolio = group.length === 1
        const groupKey = `fund:${fundName}`
        const isExpanded = cardExpand.isExpanded(groupKey)

        if (isSingleFolio) {
          // No folio split for this fund — render exactly like a normal holding.
          return renderRow(group[0])
        }

        const collapsedCard = (
          <div className="tap min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-base">📊</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text)]">{fundName}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{group.length} folios</p>
              </div>
            </div>
            <div className="mt-2.5 flex items-end justify-between">
              <Money value={totalValue} className="text-lg font-bold text-[var(--text)] tabular-nums" />
              <p className={`text-xs font-medium ${gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {totalInvested > 0 ? <>{gain >= 0 ? '+' : ''}<Money value={gain} />{gainPct !== null ? ` (${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)` : ''}</> : '—'}
              </p>
            </div>
          </div>
        )

        return (
          <ExpandableGridCard
            key={groupKey}
            expanded={isExpanded}
            onToggle={() => cardExpand.toggle(groupKey)}
            className={isExpanded ? 'ring-2 ring-primary-400 ring-offset-1 rounded-xl' : ''}
            collapsed={collapsedCard}
          >
            <div className="grid gap-2">{sorted.map(h => renderRow(h))}</div>
          </ExpandableGridCard>
        )
      })

      const singleSorted = [...singles].sort(sortFn)
      const singleRendered = singleSorted.map(h => renderRow(h))
      return <div className="card-grid grid gap-3">{[...fundSections, ...singleRendered]}</div>
    }

    if (groupBy === 'fund_category') {
      const groups = new Map<string, DashboardHolding[]>()
      for (const h of openHoldings) {
        let key = TYPE_LABELS[h.instrument_type] ?? h.instrument_type
        if (MF_TYPES.has(h.instrument_type) && h.investment_id) {
          const details = mfDetailsByInvestment.get(h.investment_id)
          key = details?.fund_sub_category || details?.fund_category || 'Uncategorised'
        }
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(h)
      }
      return [...groups.entries()].sort((a, b) => {
        const aVal = a[1].reduce((s, h) => s + parseFloat(h.market_value), 0)
        const bVal = b[1].reduce((s, h) => s + parseFloat(h.market_value), 0)
        return bVal - aVal
      }).map(([label, group]) => {
        const sorted = [...group].sort(sortFn)
        const total = group.reduce((s, h) => s + parseFloat(h.market_value), 0).toFixed(2)
        return (
          <CategorySection key={label} name={label} color="#7c3aed" totalValue={total} count={group.length} gridChildren>
            {sorted.map(h => renderRow(h))}
          </CategorySection>
        )
      })
    }

    if (groupBy === 'sub_category') {
      const groups = new Map<string, DashboardHolding[]>()
      for (const h of openHoldings) {
        let key: string
        if (MF_TYPES.has(h.instrument_type) && h.investment_id) {
          // MF/SIP holdings all share one "Mutual Fund" shell Instrument, so
          // Instrument.sub_category is the same (blank) value for every fund
          // in the household — useless for grouping. The real per-fund
          // sub-category (Mid Cap/Small Cap/Debt/etc.) lives on
          // MutualFundDetails instead, same join 'fund_category' uses below.
          const details = mfDetailsByInvestment.get(h.investment_id)
          key = details?.fund_sub_category || details?.fund_category || 'Uncategorised'
        } else {
          const inst = instruments.find((i) => i.id === h.instrument_id)
          key = inst?.sub_category ? (SUB_CATEGORY_LABELS[inst.sub_category] ?? inst.sub_category) : 'Uncategorised'
        }
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(h)
      }
      return [...groups.entries()].sort((a, b) => {
        const aVal = a[1].reduce((s, h) => s + parseFloat(h.market_value), 0)
        const bVal = b[1].reduce((s, h) => s + parseFloat(h.market_value), 0)
        return bVal - aVal
      }).map(([label, group]) => {
        const sorted = [...group].sort(sortFn)
        const total = group.reduce((s, h) => s + parseFloat(h.market_value), 0).toFixed(2)
        return (
          <CategorySection key={label} name={label} color="#0891b2" totalValue={total} count={group.length} gridChildren>
            {sorted.map(h => renderRow(h))}
          </CategorySection>
        )
      })
    }

    // groupBy === 'category'
    const catMap = new Map<number | null, DashboardHolding[]>()
    catMap.set(null, [])
    for (const h of openHoldings) {
      const catId = h.asset_category ?? null
      if (!catMap.has(catId)) catMap.set(catId, [])
      catMap.get(catId)!.push(h)
    }
    const sections: React.ReactNode[] = []
    for (const cat of categories) {
      const group = catMap.get(cat.id)
      if (!group?.length) continue
      const total = group.reduce((s, h) => s + parseFloat(h.market_value), 0).toFixed(2)
      const sorted = [...group].sort(sortFn)
      sections.push(
        <CategorySection key={cat.id} name={cat.name} color={cat.color} totalValue={total} count={group.length} gridChildren>
          {sorted.map(h => renderRow(h, cat))}
        </CategorySection>
      )
    }
    const uncat = catMap.get(null) ?? []
    if (uncat.length > 0) {
      const total = uncat.reduce((s, h) => s + parseFloat(h.market_value), 0).toFixed(2)
      const sorted = [...uncat].sort(sortFn)
      sections.push(
        <CategorySection key="uncat" name="Uncategorised" color="#94a3b8" totalValue={total} count={uncat.length} gridChildren>
          {sorted.map(h => renderRow(h))}
        </CategorySection>
      )
    }
    return sections
  }, [openHoldings, categories, instruments, mfDetailsByInvestment, canWrite, groupBy, sortBy, householdId, cardExpand, refreshDashboard, loadInstruments, loadInvestments, resolveInstrument, maturityByInstrument, openEdit])

  // ── Table view ──────────────────────────────────────────────────────────────
  // Under 'fund' grouping, a multi-folio fund isn't "a group header over N
  // rows" — it's one synthetic row that expands into a nested table of its
  // folios, while single-folio funds and everything else render as ordinary
  // rows in the same flat list. That doesn't fit DataTable's groupBy prop
  // (which partitions existing rows into sections), so it's built here as a
  // page-level row transform instead, feeding a flat DataTable. The other 4
  // modes (type/fund_category/sub_category/category) map directly onto
  // DataTable's real groupBy.
  const tableDisplayRows: DisplayRow[] = useMemo(() => {
    if (groupBy !== 'fund') return openHoldings.map((holding): DisplayRow => ({ kind: 'holding', holding }))
    const fundGroups = new Map<string, DashboardHolding[]>()
    const rows: DisplayRow[] = []
    for (const h of openHoldings) {
      if (!MF_TYPES.has(h.instrument_type)) { rows.push({ kind: 'holding', holding: h }); continue }
      const key = h.display_name
      if (!fundGroups.has(key)) fundGroups.set(key, [])
      fundGroups.get(key)!.push(h)
    }
    for (const [fundName, group] of fundGroups) {
      if (group.length === 1) { rows.push({ kind: 'holding', holding: group[0] }); continue }
      const totalInvested = group.reduce((s, h) => s + parseFloat(h.net_invested), 0)
      const totalValue = group.reduce((s, h) => s + parseFloat(h.market_value), 0)
      rows.push({ kind: 'fund_rollup', key: `fund:${fundName}`, fundName, folios: group, totalInvested, totalValue })
    }
    return rows
  }, [openHoldings, groupBy])

  const tableColumns: DataTableColumn<DisplayRow>[] = [
    {
      key: 'name', label: 'Name', sortable: true,
      sortValue: (r) => r.kind === 'holding' ? r.holding.display_name : r.fundName,
      render: (r) => {
        if (r.kind === 'fund_rollup') {
          return (
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm">📊</span>
              <span className="truncate text-sm font-medium text-[var(--text)]">{r.fundName}</span>
            </div>
          )
        }
        const h = r.holding
        const inst = resolveInstrument(h)
        const maturities = maturityByInstrument.get(h.instrument_id)
        const nearestMaturity = maturities?.[0]
        return (
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm">
              {TYPE_ICONS[inst.instrument_type] ?? '💼'}
            </span>
            <div className="min-w-0">
              <span className="block truncate text-sm font-medium text-[var(--text)]">{h.display_name}</span>
              {nearestMaturity && (
                <span className="block truncate text-[11px] text-[var(--text-muted)]">
                  {nearestMaturity.rate}% · {formatMaturity(nearestMaturity.date)}{maturities && maturities.length > 1 ? ` (+${maturities.length - 1} more)` : ''}
                </span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'type', label: 'Type',
      render: (r) => r.kind === 'fund_rollup' ? 'Mutual Fund' : (TYPE_LABELS[r.holding.instrument_type] ?? r.holding.instrument_type),
    },
    {
      key: 'category', label: 'Category',
      render: (r) => {
        if (r.kind === 'fund_rollup') return `${r.folios.length} folios`
        const cat = categories.find(c => c.id === r.holding.asset_category)
        return cat ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat.color }} />
            {cat.name}
          </span>
        ) : <span className="text-[var(--text-faint)]">Uncategorised</span>
      },
    },
    {
      key: 'owner', label: 'Owner',
      render: (r) => {
        if (r.kind === 'fund_rollup') return ''
        const h = r.holding
        const inst = resolveInstrument(h)
        return h.investment_id ? (investmentOwnerMap.get(h.investment_id) ?? 'Unassigned') : (ownerMap.get(inst.id) ?? 'Unassigned')
      },
    },
    {
      key: 'invested', label: 'Invested', align: 'right', sortable: true,
      sortValue: (r) => r.kind === 'fund_rollup' ? r.totalInvested : parseFloat(r.holding.net_invested),
      render: (r) => {
        const invested = r.kind === 'fund_rollup' ? r.totalInvested : parseFloat(r.holding.net_invested)
        return invested > 0 ? <Money value={invested} /> : '—'
      },
    },
    {
      key: 'value', label: 'Value', align: 'right', sortable: true,
      sortValue: (r) => r.kind === 'fund_rollup' ? r.totalValue : parseFloat(r.holding.market_value),
      dataBar: { value: (r) => (r.kind === 'fund_rollup' ? r.totalValue : parseFloat(r.holding.market_value)) || null },
      render: (r) => <span className="font-semibold"><Money value={r.kind === 'fund_rollup' ? r.totalValue : parseFloat(r.holding.market_value)} /></span>,
    },
    {
      key: 'gain', label: 'Gain', align: 'right', sortable: true,
      sortValue: (r) => {
        const invested = r.kind === 'fund_rollup' ? r.totalInvested : parseFloat(r.holding.net_invested)
        const value = r.kind === 'fund_rollup' ? r.totalValue : parseFloat(r.holding.market_value)
        const type = r.kind === 'fund_rollup' ? 'mutual_fund' : r.holding.instrument_type
        return computeGain(value, invested, type).gain
      },
      dataBar: {
        mode: 'diverging',
        value: (r) => {
          const invested = r.kind === 'fund_rollup' ? r.totalInvested : parseFloat(r.holding.net_invested)
          const value = r.kind === 'fund_rollup' ? r.totalValue : parseFloat(r.holding.market_value)
          const type = r.kind === 'fund_rollup' ? 'mutual_fund' : r.holding.instrument_type
          return invested > 0 ? computeGain(value, invested, type).gain : null
        },
      },
      render: (r) => {
        const invested = r.kind === 'fund_rollup' ? r.totalInvested : parseFloat(r.holding.net_invested)
        const value = r.kind === 'fund_rollup' ? r.totalValue : parseFloat(r.holding.market_value)
        const type = r.kind === 'fund_rollup' ? 'mutual_fund' : r.holding.instrument_type
        const { gain, gainPct } = computeGain(value, invested, type)
        if (r.kind === 'holding' && r.holding.instrument_type === 'cash') return '—'
        return invested > 0 ? (
          <span className={`font-medium ${gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {gain >= 0 ? '+' : ''}<Money value={gain} />{gainPct !== null ? ` (${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)` : ''}
          </span>
        ) : '—'
      },
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (r) => {
        if (r.kind === 'fund_rollup') return null
        const h = r.holding
        const inst = resolveInstrument(h)
        return (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setSheet({ type: 'buy', instrumentId: inst.id, investmentId: h.investment_id ?? undefined })} disabled={!canWrite}
              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
              Buy
            </button>
            <button type="button" onClick={() => setSheet({ type: 'sell', instrumentId: inst.id, investmentId: h.investment_id ?? undefined, holdingName: h.display_name, currentQuantity: h.quantity })} disabled={!canWrite}
              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
              Sell
            </button>
            <button type="button" onClick={() => setSheet({ type: 'valuation', instrumentId: inst.id, instrumentName: inst.name })} disabled={!canWrite}
              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
              Update Value
            </button>
          </div>
        )
      },
    },
  ]

  const renderDisplayRowDetail = (r: DisplayRow) => {
    if (r.kind === 'fund_rollup') {
      return (
        <DataTable
          columns={tableColumns}
          rows={r.folios.map((holding): DisplayRow => ({ kind: 'holding', holding }))}
          rowKey={(row) => rowKey((row as { kind: 'holding'; holding: DashboardHolding }).holding)}
          defaultSortCol="value"
          defaultSortDir="desc"
          renderExpanded={renderDisplayRowDetail}
        />
      )
    }
    const h = r.holding
    const inst = resolveInstrument(h)
    const maturities = maturityByInstrument.get(h.instrument_id)
    return (
      <div className="px-4 py-3">
        <InstrumentExpandedDetail
          householdId={householdId}
          holding={h}
          instrument={inst}
          maturities={maturities}
          onBuy={() => setSheet({ type: 'buy', instrumentId: inst.id, investmentId: h.investment_id ?? undefined })}
          onSell={() => setSheet({ type: 'sell', instrumentId: inst.id, investmentId: h.investment_id ?? undefined, holdingName: h.display_name, currentQuantity: h.quantity })}
          onUpdateValue={() => setSheet({ type: 'valuation', instrumentId: inst.id, instrumentName: inst.name })}
          onEdit={() => openEdit(h, inst)}
          onTransactionsChanged={async () => { await refreshDashboard(); await loadInstruments(); await loadInvestments() }}
          onDeleted={async () => { await refreshDashboard(); await loadInstruments(); await loadInvestments() }}
        />
      </div>
    )
  }

  const tableGroupBy = groupBy === 'none' || groupBy === 'fund' ? undefined : {
    options: [
      { value: 'type', label: 'Type' },
      { value: 'fund_category', label: 'Fund Category' },
      { value: 'sub_category', label: 'Sub-category' },
      { value: 'category', label: 'Category' },
    ].filter((o) => o.value === groupBy),
    defaultValue: groupBy,
    getGroup: (r: DisplayRow) => {
      const h = r.kind === 'fund_rollup' ? r.folios[0] : r.holding
      if (groupBy === 'type') return { key: h.instrument_type, label: TYPE_LABELS[h.instrument_type] ?? h.instrument_type }
      if (groupBy === 'fund_category') {
        let key = TYPE_LABELS[h.instrument_type] ?? h.instrument_type
        if (MF_TYPES.has(h.instrument_type) && h.investment_id) {
          const details = mfDetailsByInvestment.get(h.investment_id)
          key = details?.fund_sub_category || details?.fund_category || 'Uncategorised'
        }
        return { key, label: key }
      }
      if (groupBy === 'sub_category') {
        let key: string
        if (MF_TYPES.has(h.instrument_type) && h.investment_id) {
          const details = mfDetailsByInvestment.get(h.investment_id)
          key = details?.fund_sub_category || details?.fund_category || 'Uncategorised'
        } else {
          const inst = instruments.find((i) => i.id === h.instrument_id)
          key = inst?.sub_category ? (SUB_CATEGORY_LABELS[inst.sub_category] ?? inst.sub_category) : 'Uncategorised'
        }
        return { key, label: key }
      }
      // category
      const cat = categories.find((c) => c.id === h.asset_category)
      return { key: cat ? String(cat.id) : 'uncat', label: cat?.name ?? 'Uncategorised', color: cat?.color }
    },
  }

  const pillCls = (active: boolean) =>
    `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${active ? 'bg-primary-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'}`

  return (
    <div className="grid gap-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search holdings…"
          className={`${INP} w-full sm:w-56`}
        />
        {/* member filter */}
        {members.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setActiveMemberId(null)} className={pillCls(activeMemberId === null)}>All</button>
            {members.map((m) => (
              <button key={m.id} type="button" onClick={() => setActiveMemberId(m.id)} className={pillCls(activeMemberId === m.id)}>{m.label}</button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 ml-auto">
          {/* Group by */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">Group:</span>
            {([['fund', 'Fund'], ['fund_category', 'Fund Category'], ['sub_category', 'Sub-category'], ['type', 'Type'], ['category', 'Category'], ['none', 'None']] as [HoldingGroupBy, string][]).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setGroupBy(v)} className={pillCls(groupBy === v)}>{l}</button>
            ))}
          </div>
          {/* Sort by — only needed in Card view; Table view sorts via clickable column headers instead */}
          {viewMode === 'card' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--text-muted)]">Sort:</span>
              {([['value', 'Value'], ['gain', 'Gain ₹'], ['gainPct', 'Gain %'], ['invested', 'Invested'], ['name', 'Name']] as [HoldingSortBy, string][]).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setSortBy(v)} className={pillCls(sortBy === v)}>{l}</button>
              ))}
            </div>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={viewMode === 'card'}
            onClick={() => changeViewMode(viewMode === 'table' ? 'card' : 'table')}
            title={viewMode === 'table' ? 'Switch to Card view' : 'Switch to Table view'}
            className="flex items-center gap-2 rounded-full bg-[var(--surface-2)] px-1 py-1 text-xs font-medium text-[var(--text-muted)]"
          >
            <span className={`rounded-full px-2 py-0.5 transition-colors ${viewMode === 'table' ? 'bg-primary-600 text-white' : ''}`}>Table</span>
            <span className={`rounded-full px-2 py-0.5 transition-colors ${viewMode === 'card' ? 'bg-primary-600 text-white' : ''}`}>Card</span>
          </button>
          <a
            href={`/api/instruments/export-mf-holdings/?household_id=${householdId}`}
            download="mutual_fund_holdings.csv"
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
            title="Export mutual fund holdings (one row per folio) as CSV"
          >
            Export MF CSV
          </a>
          <button type="button" onClick={() => { window.location.hash = '/holdings/add' }} disabled={!canWrite}
            className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            + Add Holding
          </button>
        </div>
      </div>

      {holdingsLoading ? (
        <div className="flex justify-center py-8"><CoinSpinner size={48} /></div>
      ) : activeHoldings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-3xl">{search.trim() ? '🔍' : '📊'}</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-2)]">
            {search.trim() ? 'No matches' : activeMemberId !== null ? 'No holdings for this member' : 'No holdings yet'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{search.trim() ? 'Try a different search.' : 'Tap + to add your first holding.'}</p>
        </div>
      ) : viewMode === 'table' ? (
        <DataTable
          columns={tableColumns}
          rows={tableDisplayRows}
          rowKey={(r) => r.kind === 'fund_rollup' ? r.key : rowKey(r.holding)}
          defaultSortCol="value"
          defaultSortDir="desc"
          groupBy={tableGroupBy}
          renderExpanded={renderDisplayRowDetail}
        />
      ) : (
        <div className="grid gap-1">{holdingsSections}</div>
      )}

      {closedHoldings.length > 0 && (
        <details className="group mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Closed Positions <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">{closedHoldings.length}</span>
            </p>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-[var(--text-faint)] transition-transform group-open:rotate-90">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
            </svg>
          </summary>
          <div className="border-t border-[var(--border)] px-4 py-1">
            <p className="py-2 text-xs text-[var(--text-muted)]">Fully sold-out holdings — realized gain/loss shown instead of a live market value.</p>
            {[...closedHoldings].sort((a, b) => parseFloat(b.realized_gain_total) - parseFloat(a.realized_gain_total)).map((h) => {
              const gain = parseFloat(h.realized_gain_total)
              return (
                <div key={h.investment_id ?? h.instrument_id} className="flex items-center justify-between border-b border-[var(--border)] py-2.5 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text)]">{h.display_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{TYPE_LABELS[h.instrument_type] ?? h.instrument_type}</p>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold ${gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {gain >= 0 ? '+' : ''}<Money value={gain} />
                  </p>
                </div>
              )
            })}
          </div>
        </details>
      )}

      {/* sheets */}
      {sheet.type === 'buy' && (
        <Sheet title="Record Buy" onClose={close} wide>
          <BuyForm householdId={householdId} instrumentId={sheet.instrumentId} investmentId={sheet.investmentId} onSave={afterBuy} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'sell' && (
        <Sheet title="Record Sell" onClose={close}>
          <SellForm
            householdId={householdId}
            instrumentId={sheet.instrumentId}
            investmentId={sheet.investmentId}
            holdingName={sheet.holdingName}
            currentQuantity={sheet.currentQuantity}
            onSave={afterSell}
            onCancel={close}
          />
        </Sheet>
      )}
      {sheet.type === 'valuation' && (
        <Sheet title="Update Value" onClose={close}>
          <ValuationForm householdId={householdId} instrumentId={sheet.instrumentId} instrumentName={sheet.instrumentName} onSave={afterValuation} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'edit_instrument' && (
        <Sheet title="Edit Instrument" onClose={close}>
          <InstrumentForm householdId={householdId} instrument={sheet.instrument}
            onSave={async () => { close(); await refreshDashboard(); await loadInstruments() }}
            onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'edit_investment' && (
        <Sheet title="Edit Fund" onClose={close}>
          <InvestmentForm investment={sheet.investment}
            onSave={async () => { close(); await refreshDashboard(); await loadInvestments(); await loadMfDetails() }}
            onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'category' && (
        <Sheet title={sheet.item ? 'Edit Category' : 'New Category'} onClose={close}>
          <AssetCategoryForm householdId={householdId} category={sheet.item}
            onSave={async () => { close(); await refreshCategories() }} onCancel={close} />
        </Sheet>
      )}
    </div>
  )
}
