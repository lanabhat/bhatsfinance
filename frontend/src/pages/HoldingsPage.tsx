import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Copy, Download, Link2, RefreshCw, SearchX, TrendingUp } from 'lucide-react'
import { investmentEditTitle } from '../components/assets/investmentKind'
import { postJson } from '../api/http'
import { investmentApi } from '../api/investmentApi'
import { ledgerApi } from '../api/ledgerApi'
import { portfolioApi } from '../api/portfolioApi'
import { valuationApi } from '../api/valuationApi'
import { fundDataApi } from '../api/fundDataApi'
import { fdDetailsApi } from '../api/fdDetailsApi'
import { normalizeApiError } from '../hooks/errorUtils'
import { applyFilters, filterFieldsFrom, useFilterState } from '../hooks/useFilters'
import type { FilterAccessor } from '../hooks/useFilters'
import { useMemberHoldings } from '../hooks/useMemberHoldings'
import { FundMatchSheet } from '../components/allocation/FundMatchSheet'
import { InstrumentForm } from '../components/assets/InstrumentForm'
import { InvestmentForm } from '../components/assets/InvestmentForm'
import { AssetCategoryForm } from '../components/assets/AssetCategoryForm'
import type { MaturityInfo } from '../components/assets/InstrumentRow'
import { BuyForm } from '../components/holdings/BuyForm'
import { SellForm } from '../components/holdings/SellForm'
import { HoldingDetailDrawer } from '../components/holdings/HoldingDetailDrawer'
import { HoldingsCardView } from '../components/holdings/HoldingsCardView'
import type { CardItem, CardSection } from '../components/holdings/HoldingsCardView'
import { Amount } from '../components/ui/Amount'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DataTable, DensityToggle } from '../components/ui/DataTable'
import type { DataTableColumn, DataTableGroupBy } from '../components/ui/DataTable'
import { DateText } from '../components/ui/DateText'
import { Delta } from '../components/ui/Delta'
import { EmptyState } from '../components/ui/EmptyState'
import { FilterBar } from '../components/ui/FilterBar'
import { Field, Input, ToolbarSelect } from '../components/ui/Input'
import { MemberAvatar } from '../components/ui/MemberAvatar'
import type { RowAction } from '../components/ui/Menu'
import { Notice } from '../components/ui/Notice'
import { PageLayout } from '../components/ui/PageLayout'
import { Sheet } from '../components/ui/Sheet'
import { StatCard } from '../components/ui/StatCard'
import { useToast, useUndoable } from '../components/ui/Toast'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useMemberScope } from '../context/MemberScopeContext'
import { computeGain, daysUntil, fmtCount, fmtDateShort, fmtRate, formatMaturity } from '../lib/fmt'
import { EntityIcon } from '../components/ui/EntityIcon'
import { TYPE_LABELS } from '../lib/instrumentTypes'
import { SUB_CATEGORY_LABELS } from '../lib/labels'
import { clearDeepLink, readDeepLink } from '../lib/deepLinks'
import { assetTypeColor } from '../lib/palette'
import type { AssetCategory, BondDetails, DashboardHolding, FDDetails, Instrument, InstrumentOwnership, Investment, MutualFundDetails } from '../types/domain'

// ── valuation form ────────────────────────────────────────────────────────────
function ValuationForm({ householdId, instrumentId, investmentId, instrumentName, onSave, onCancel }: {
  householdId: number; instrumentId: number; investmentId?: number | null; instrumentName: string
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
        household: householdId, instrument: instrumentId, investment: investmentId ?? null,
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
      <p className="text-sm text-ink-muted">{instrumentName}</p>
      <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Unit price"><Input type="number" min="0" step="0.000001" placeholder="e.g. 94.50" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} /></Field>
      <Field label="Market value (total)" error={error || undefined}>
        <Input type="number" min="0" step="0.01" placeholder="e.g. 50000" value={marketValue} onChange={(e) => setMarketValue(e.target.value)} />
      </Field>
      <div className="flex gap-2 border-t border-line pt-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" className="flex-1" loading={saving} onClick={() => void save()}>Save</Button>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
type SheetState =
  | { type: 'none' }
  | { type: 'valuation'; instrumentId: number; investmentId?: number | null; instrumentName: string }
  | { type: 'buy'; instrumentId?: number; investmentId?: number }
  | { type: 'sell'; instrumentId: number; investmentId?: number; holdingName: string; currentQuantity: string | null }
  | { type: 'edit_instrument'; instrument: Instrument }
  | { type: 'edit_investment'; investment: Investment }
  | { type: 'category'; item?: AssetCategory }
  | { type: 'fund-match' }
  | { type: 'duplicates' }

type HoldingGroupBy = 'fund' | 'fund_category' | 'sub_category' | 'type' | 'category' | 'none'

// Table rows: a real holding, or (under 'fund' grouping) a fund held in several folios,
// which expands into its folios as nested rows.
type DisplayRow =
  | { kind: 'holding'; holding: DashboardHolding }
  | { kind: 'fund_rollup'; key: string; fundName: string; folios: DashboardHolding[]; totalInvested: number; totalValue: number }

type HoldingSortBy = 'value' | 'gain' | 'gainPct' | 'name' | 'invested'

const MARKET_CAP_LABELS: Record<string, string> = { large_cap: 'Large Cap', mid_cap: 'Mid Cap', small_cap: 'Small Cap' }
const MF_TYPES = new Set(['mutual_fund', 'sip'])
// Mirrors insights/services.py STALE_AFTER_DAYS — the Home "Needs attention" counts.
const STALE_AFTER_DAYS = 30
const VALUATION_NEVER = 'Never valued'
const VALUATION_STALE = `Not valued in ${STALE_AFTER_DAYS}+ days`
const VALUATION_FRESH = `Valued in last ${STALE_AFTER_DAYS} days`
const VALUATION_CLOSED = 'Sold (closed position)'
// #/holdings?valuation=never|stale (from Home's action items) opens with that filter.
const VALUATION_LINKS: Record<string, string> = { never: VALUATION_NEVER, stale: VALUATION_STALE }
/** Filter keys a deep link may set (lib/deepLinks.ts) — the filter accessors' keys below. */
const HOLDING_LINK_KEYS = ['type', 'category', 'fund_category', 'sub_category', 'valuation', 'owner']
/** Gains beyond this are almost always a missing/zero cost basis, not a real return. */
const OUTLIER_GAIN_PCT = 1000

const QUANTITY_TRACKED_TYPES = new Set(['equity', 'etf', 'mutual_fund', 'sip', 'bond'])

function valuationStatus(h: DashboardHolding, asOf: string): string {
  // Fully-sold positions aren't counted on Home either — nothing left to value.
  if (QUANTITY_TRACKED_TYPES.has(h.instrument_type) && parseFloat(h.quantity) === 0) return VALUATION_CLOSED
  const lastValuedOn = h.last_valued_on
  if (!lastValuedOn) return VALUATION_NEVER
  const cutoff = new Date(`${asOf}T00:00:00`)
  cutoff.setDate(cutoff.getDate() - STALE_AFTER_DAYS)
  return new Date(`${lastValuedOn}T00:00:00`) < cutoff ? VALUATION_STALE : VALUATION_FRESH
}

// Filler words that differ between import sources without changing the holding.
// direct/regular and growth/idcw/dividend are deliberately kept: they ARE different holdings.
const DUP_FILLER_WORDS = new Set(['fund', 'plan', 'option', 'the', 'ltd', 'limited', 'scheme'])

const dupKey = (h: DashboardHolding) => (h.investment_id ? `inv:${h.investment_id}` : `inst:${h.instrument_id}`)

function normaliseHoldingName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !DUP_FILLER_WORDS.has(w))
    .join('')
}

type ViewMode = 'table' | 'card'
const VIEW_MODE_KEY = 'holdings:viewMode'

function loadViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'card' ? 'card' : 'table'
  } catch { return 'table' }
}

const typeLabel = (t: string) => TYPE_LABELS[t] ?? t
const sumBy = (hs: DashboardHolding[], f: (h: DashboardHolding) => string) => hs.reduce((s, h) => s + parseFloat(f(h)), 0)
const rowValue = (r: DisplayRow) => (r.kind === 'fund_rollup' ? r.totalValue : parseFloat(r.holding.market_value))
const rowInvested = (r: DisplayRow) => (r.kind === 'fund_rollup' ? r.totalInvested : parseFloat(r.holding.net_invested))
const rowType = (r: DisplayRow) => (r.kind === 'fund_rollup' ? 'mutual_fund' : r.holding.instrument_type)

export function HoldingsPage() {
  const { canWrite } = useAuth()
  const { householdId, categories, refreshCategories, dashboard, members, asOf, refreshDashboard, instrumentsFull } = useApp()
  const { memberId: activeMemberId, memberName } = useMemberScope()
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [ownerships, setOwnerships] = useState<InstrumentOwnership[]>([])
  const [mfDetails, setMfDetails] = useState<MutualFundDetails[]>([])
  const [fdDetails, setFdDetails] = useState<FDDetails[]>([])
  const [bondDetails, setBondDetails] = useState<BondDetails[]>([])
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' })
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<HoldingGroupBy>('fund')
  const [sortBy, setSortBy] = useState<HoldingSortBy>('value')
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  const [showClosed, setShowClosed] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem(VIEW_MODE_KEY, mode) } catch { /* ignore */ }
  }

  const toast = useToast()
  const undoable = useUndoable()
  const showLoadError = useCallback((e: unknown) => toast.error(`Couldn’t load holding details: ${normalizeApiError(e)}`), [toast])
  const loadInstruments = useCallback(
    () => portfolioApi.listInstruments(householdId).then(setInstruments).catch(showLoadError), [householdId, showLoadError])
  const loadInvestments = useCallback(
    () => investmentApi.listInvestments({ household: householdId }).then(setInvestments).catch(showLoadError), [householdId, showLoadError])
  const loadOwnerships = useCallback(
    () => portfolioApi.listInstrumentOwnerships(undefined, 200).then(setOwnerships).catch(showLoadError), [showLoadError])
  const loadMfDetails = useCallback(
    () => portfolioApi.listMutualFundDetails().then(setMfDetails).catch(showLoadError), [showLoadError])

  // Everything the list needs besides the holdings themselves; re-run when holdings change.
  useEffect(() => {
    let active = true
    const keep = <T,>(set: (v: T) => void) => (v: T) => { if (active) set(v) }
    Promise.all([
      portfolioApi.listInstruments(householdId).then(keep(setInstruments)),
      investmentApi.listInvestments({ household: householdId }).then(keep(setInvestments)),
      portfolioApi.listInstrumentOwnerships(undefined, 200).then(keep(setOwnerships)),
      portfolioApi.listMutualFundDetails().then(keep(setMfDetails)),
      fdDetailsApi.list().then(keep(setFdDetails)),
      portfolioApi.listBondDetails().then(keep(setBondDetails)),
    ]).catch((e) => { if (active) showLoadError(e) })
    return () => { active = false }
  }, [householdId, dashboard.holdings, showLoadError])

  const mfDetailsByInvestment = useMemo(() => {
    const m = new Map<number, MutualFundDetails>()
    for (const d of mfDetails) m.set(d.investment, d)
    return m
  }, [mfDetails])

  const maturityByInstrument = useMemo(() => {
    // One instrument can hold several FD/Bond deposits — keep every leg, nearest first.
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

  const ownerLabelsByInstrument = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const o of ownerships) {
      const label = members.find((mb) => mb.id === o.member)?.label ?? `#${o.member}`
      m.set(o.instrument, [...(m.get(o.instrument) ?? []), label])
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

  // The header's member scope: that member's proportional share (cached, shared with Home).
  const memberQuery = useMemberHoldings(householdId, asOf, activeMemberId)
  const memberHoldings = activeMemberId !== null ? (memberQuery.data?.holdings ?? null) : null
  const holdingsLoading = activeMemberId !== null && memberQuery.isPending
  useEffect(() => {
    if (memberQuery.error) toast.error(`Couldn’t load holdings: ${normalizeApiError(memberQuery.error)}`)
  }, [memberQuery.error, toast])

  const close = () => setSheet({ type: 'none' })
  const [updatingPrices, setUpdatingPrices] = useState(false)
  const updatePrices = async () => {
    setUpdatingPrices(true)
    try {
      const r = await fundDataApi.refreshPrices(householdId)
      const parts = []
      if (r.equities) parts.push(`${r.equities.written} stock${r.equities.written === 1 ? '' : 's'} at NSE close of ${fmtDateShort(r.equities.price_date)}`)
      parts.push(`${r.funds.written} fund${r.funds.written === 1 ? '' : 's'} at latest NAV`)
      if (r.funds_linked.length) parts.push(`${r.funds_linked.length} fund${r.funds_linked.length === 1 ? '' : 's'} newly linked`)
      const kept = [...(r.equities?.units_out_of_date ?? []), ...r.funds.units_out_of_date]
      if (kept.length) parts.push(`${kept.length} kept uploaded value (units out of date)`)
      toast.success(`Updated ${parts.join(' · ')}`)
      r.errors.forEach((e) => toast.error(e))
      await refreshDashboard(); await loadInstruments(); await loadInvestments()
    } catch (e) {
      toast.error(normalizeApiError(e))
    } finally {
      setUpdatingPrices(false)
    }
  }
  const afterTrade = async () => { close(); await refreshDashboard(); await loadInstruments(); await loadInvestments(); await loadOwnerships() }
  const afterValuation = async () => { close(); await refreshDashboard() }
  const afterTransactionsChanged = async () => { await refreshDashboard(); await loadInstruments(); await loadInvestments() }

  // Stocks/ETFs: their market cap (set from NSE index lists), so they group with same-cap funds.
  const capLabelByInvestment = useMemo(() => {
    const m = new Map<number, string>()
    for (const inv of investments) if (inv.market_cap) m.set(inv.id, MARKET_CAP_LABELS[inv.market_cap])
    return m
  }, [investments])

  // MF/SIP sub-category lives on MutualFundDetails; other types use the instrument's.
  const subCategoryOf = useCallback((h: DashboardHolding): string => {
    if (MF_TYPES.has(h.instrument_type) && h.investment_id) {
      const details = mfDetailsByInvestment.get(h.investment_id)
      return details?.fund_sub_category || details?.fund_category || 'Uncategorised'
    }
    const cap = h.investment_id ? capLabelByInvestment.get(h.investment_id) : undefined
    if (cap) return cap
    const inst = instruments.find((i) => i.id === h.instrument_id)
    return inst?.sub_category ? (SUB_CATEGORY_LABELS[inst.sub_category] ?? inst.sub_category) : 'Uncategorised'
  }, [mfDetailsByInvestment, instruments, capLabelByInvestment])

  // "Fund category" grouping key: a fund's sub-category, else the holding's type.
  const fundGroupKeyOf = useCallback((h: DashboardHolding): string => {
    if (MF_TYPES.has(h.instrument_type) && h.investment_id) {
      const details = mfDetailsByInvestment.get(h.investment_id)
      return details?.fund_sub_category || details?.fund_category || 'Uncategorised'
    }
    const cap = h.investment_id ? capLabelByInvestment.get(h.investment_id) : undefined
    return cap ?? typeLabel(h.instrument_type)
  }, [mfDetailsByInvestment, capLabelByInvestment])

  const ownerOf = useCallback(
    (h: DashboardHolding) =>
      h.investment_id
        ? (investmentOwnerMap.get(h.investment_id) ?? 'Unassigned')
        : ((ownerLabelsByInstrument.get(h.instrument_id) ?? []).join(', ') || 'Unassigned'),
    [investmentOwnerMap, ownerLabelsByInstrument],
  )
  const categoryOf = useCallback((h: DashboardHolding) => categories.find((c) => c.id === h.asset_category), [categories])

  const holdingFilterAccessors = useMemo<FilterAccessor<DashboardHolding>[]>(() => [
    { key: 'type', label: 'Type', get: (h) => typeLabel(h.instrument_type) },
    { key: 'category', label: 'Category', get: (h) => categoryOf(h)?.name },
    { key: 'fund_category', label: 'Fund category', get: (h) => (h.investment_id ? mfDetailsByInvestment.get(h.investment_id)?.fund_category : null) },
    { key: 'sub_category', label: 'Sub-category', get: subCategoryOf },
    { key: 'valuation', label: 'Valuation', get: (h) => valuationStatus(h, asOf) },
    {
      key: 'owner', label: 'Owner',
      get: (h) => {
        if (h.investment_id) {
          const label = investmentOwnerMap.get(h.investment_id)
          return label ? [label] : []
        }
        return ownerLabelsByInstrument.get(h.instrument_id) ?? []
      },
    },
  ], [categoryOf, mfDetailsByInvestment, subCategoryOf, investmentOwnerMap, ownerLabelsByInstrument, asOf])

  const [holdingFilters, setHoldingFilters] = useFilterState('holdings')

  // Deep links (Home's action items, Portfolio summary, Allocation, member drawer): show exactly
  // what the link names — its filters replace the remembered ones, `open` opens one holding —
  // then drop the query so a reload doesn't re-apply it (the filters stay remembered as usual).
  useEffect(() => {
    const link = readDeepLink(HOLDING_LINK_KEYS)
    if (!link) return
    const filters = { ...link.filters }
    if (filters.valuation) filters.valuation = filters.valuation.map((v) => VALUATION_LINKS[v] ?? v)
    setHoldingFilters(filters)
    setSearch('')
    if (link.open) setDetailKey(link.open)
    clearDeepLink('holdings')
  }, [setHoldingFilters])

  // Member scope and name search first; the filter bar narrows from there.
  const baseHoldings = useMemo(() => {
    const all = (activeMemberId !== null ? (memberHoldings ?? []) : dashboard.holdings).filter((h) => !hiddenKeys.has(dupKey(h)))
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((h) => h.display_name.toLowerCase().includes(q))
  }, [activeMemberId, memberHoldings, dashboard.holdings, search, hiddenKeys])

  const activeHoldings = useMemo(
    () => applyFilters(baseHoldings, holdingFilters, holdingFilterAccessors),
    [baseHoldings, holdingFilters, holdingFilterAccessors],
  )
  const holdingFilterFields = useMemo(
    () => filterFieldsFrom(baseHoldings, holdingFilters, holdingFilterAccessors),
    [baseHoldings, holdingFilters, holdingFilterAccessors],
  )

  // A fully-sold position (quantity nets to 0) still comes back from the holdings API, so
  // it's split out and shown with realized gain/loss. Only quantity-tracked types can be
  // "closed" — value-based ones (FD, EPF, PPF…) always net to quantity 0 while open.
  const isQuantityTracked = (h: DashboardHolding) => QUANTITY_TRACKED_TYPES.has(h.instrument_type)
  const openHoldings = useMemo(
    () => activeHoldings.filter((h) => !isQuantityTracked(h) || parseFloat(h.quantity) !== 0),
    [activeHoldings],
  )
  const closedHoldings = useMemo(
    () => activeHoldings.filter((h) => isQuantityTracked(h) && parseFloat(h.quantity) === 0),
    [activeHoldings],
  )

  // Instruments marked inactive (closed/matured deposits) aren't in the holdings at all;
  // listed separately for reference, never counted in net worth.
  const inactiveInstruments = useMemo(() => instruments.filter((i) => !i.is_active), [instruments])

  const summary = useMemo(() => {
    const value = sumBy(openHoldings, (h) => h.market_value)
    const invested = sumBy(openHoldings, (h) => h.net_invested)
    return { value, invested, count: openHoldings.length, ...computeGain(value, invested) }
  }, [openHoldings])

  // Possible duplicates from repeated imports: same type + owner + normalised name,
  // or (FDs) same principal/rate/start date. Each group's first entry is the suggested keeper.
  const duplicateGroups = useMemo(() => {
    const groups: DashboardHolding[][] = []
    const grouped = new Set<string>()
    const folioOf = (h: DashboardHolding) => (h.investment_id ? investmentsById.get(h.investment_id)?.folio_no ?? '' : '')

    const byName = new Map<string, DashboardHolding[]>()
    for (const h of activeHoldings) {
      const key = `${h.instrument_type}|${ownerOf(h)}|${normaliseHoldingName(h.display_name)}`
      const list = byName.get(key)
      if (list) list.push(h); else byName.set(key, [h])
    }
    for (const list of byName.values()) {
      if (list.length < 2) continue
      // Same fund in separate, distinct folios is legitimate — not a duplicate.
      const folios = list.map(folioOf)
      if (folios.every((f) => f) && new Set(folios).size === folios.length) continue
      groups.push(list)
      list.forEach((h) => grouped.add(dupKey(h)))
    }

    const fdKeyByInstrument = new Map<number, string>()
    for (const d of fdDetails) fdKeyByInstrument.set(d.instrument, `${parseFloat(d.principal)}|${parseFloat(d.annual_rate)}|${d.investment_date}`)
    const byFd = new Map<string, DashboardHolding[]>()
    for (const h of activeHoldings) {
      if (h.investment_id || grouped.has(dupKey(h))) continue
      const fdKey = fdKeyByInstrument.get(h.instrument_id)
      if (!fdKey) continue
      const key = `${ownerOf(h)}|${fdKey}`
      const list = byFd.get(key)
      if (list) list.push(h); else byFd.set(key, [h])
    }
    for (const list of byFd.values()) if (list.length >= 2) groups.push(list)

    // Suggested keeper first: has a folio (richer import), then oldest record.
    const recordId = (h: DashboardHolding) => h.investment_id ?? h.instrument_id
    return groups.map((g) => [...g].sort((a, b) => (folioOf(b) ? 1 : 0) - (folioOf(a) ? 1 : 0) || recordId(a) - recordId(b)))
  }, [activeHoldings, investmentsById, ownerOf, fdDetails])

  const duplicateKeys = useMemo(() => new Set(duplicateGroups.flat().map(dupKey)), [duplicateGroups])

  const [purgingKeys, setPurgingKeys] = useState<Set<string>>(new Set())
  const [selectedDupKeys, setSelectedDupKeys] = useState<Set<string>>(new Set())
  const selectedDups = useMemo(
    () => duplicateGroups.flat().filter((h) => selectedDupKeys.has(dupKey(h))),
    [duplicateGroups, selectedDupKeys],
  )
  const toggleDupSelected = (h: DashboardHolding) => {
    setSelectedDupKeys((prev) => {
      const next = new Set(prev)
      const k = dupKey(h)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }
  const selectSuggestedDups = () => setSelectedDupKeys(new Set(duplicateGroups.flatMap((g) => g.slice(1).map(dupKey))))

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const countLinked = async (h: DashboardHolding) => {
    const [txs, vals] = h.investment_id
      ? await Promise.all([ledgerApi.listTransactionsForInvestment(householdId, h.investment_id), valuationApi.listForInvestment(householdId, h.investment_id)])
      : await Promise.all([ledgerApi.listTransactionsForInstrument(householdId, h.instrument_id), valuationApi.listForInstrument(householdId, h.instrument_id)])
    return { txs: txs.length, vals: vals.length }
  }
  const purgeOne = (h: DashboardHolding) =>
    h.investment_id ? investmentApi.purgeInvestment(h.investment_id) : portfolioApi.purgeInstrument(h.instrument_id)

  // Bulk delete from the duplicates review — counts what goes with them first.
  const purgeHoldings = async (targets: DashboardHolding[]) => {
    if (targets.length === 0) return
    setPurgingKeys(new Set(targets.map(dupKey)))
    try {
      const counts = await Promise.all(targets.map(countLinked))
      const txs = counts.reduce((s, c) => s + c.txs, 0)
      const vals = counts.reduce((s, c) => s + c.vals, 0)
      const what = targets.length === 1 ? `"${targets[0].display_name}"` : plural(targets.length, 'holding')
      const targetKeys = new Set(targets.map(dupKey))
      const wiped = duplicateGroups.filter((g) => g.every((h) => targetKeys.has(dupKey(h)))).map((g) => g[0].display_name)
      const wipedNote = wiped.length > 0 ? `\n\nNo copy will be kept of: ${wiped.join(', ')}.` : ''
      if (!confirm(`Delete ${what} along with ${plural(txs, 'transaction')} and ${plural(vals, 'valuation')}? This cannot be undone.${wipedNote}`)) return

      const failures: string[] = []
      for (const h of targets) {
        try { await purgeOne(h) } catch (e) { failures.push(`${h.display_name}: ${normalizeApiError(e)}`) }
      }
      setSelectedDupKeys(new Set())
      await refreshDashboard(); await loadInstruments(); await loadInvestments()
      if (failures.length > 0) toast.error(`Some holdings could not be deleted: ${failures.join('; ')}`)
    } catch (e) {
      toast.error(normalizeApiError(e))
    } finally {
      setPurgingKeys(new Set())
    }
  }

  // Row/drawer delete: confirmed in the menu, then hidden at once with a few seconds to undo.
  const deleteHolding = (h: DashboardHolding) => {
    const key = dupKey(h)
    setDetailKey(null)
    undoable({
      message: `Deleted ${h.display_name}`,
      apply: () => setHiddenKeys((s) => new Set(s).add(key)),
      revert: () => setHiddenKeys((s) => { const n = new Set(s); n.delete(key); return n }),
      commit: async () => {
        await purgeOne(h)
        await refreshDashboard(); await loadInstruments(); await loadInvestments()
        setHiddenKeys((s) => { const n = new Set(s); n.delete(key); return n })
      },
    })
  }

  const resolveInstrument = useCallback((h: DashboardHolding): Instrument =>
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
    }, [instruments, householdId])

  const openEdit = (h: DashboardHolding) => {
    if (h.investment_id) {
      const investment = investmentsById.get(h.investment_id)
      if (investment) { setSheet({ type: 'edit_investment', investment }); return }
    }
    setSheet({ type: 'edit_instrument', instrument: resolveInstrument(h) })
  }

  // View → Edit → Buy / Sell / Update value → Delete, the same everywhere.
  const actionsFor = (h: DashboardHolding): RowAction[] => {
    const inst = resolveInstrument(h)
    return [
      { kind: 'view', label: 'View details', onSelect: () => setDetailKey(dupKey(h)) },
      ...(canWrite ? [
        { kind: 'edit' as const, label: 'Edit', onSelect: () => openEdit(h) },
        { kind: 'action' as const, label: 'Buy more', icon: <ArrowDownToLine />, onSelect: () => setSheet({ type: 'buy', instrumentId: inst.id, investmentId: h.investment_id ?? undefined }) },
        { kind: 'action' as const, label: 'Sell', icon: <ArrowUpFromLine />, onSelect: () => setSheet({ type: 'sell', instrumentId: inst.id, investmentId: h.investment_id ?? undefined, holdingName: h.display_name, currentQuantity: h.quantity }) },
        { kind: 'action' as const, label: 'Update value', icon: <RefreshCw />, onSelect: () => setSheet({ type: 'valuation', instrumentId: inst.id, investmentId: h.investment_id, instrumentName: h.display_name }) },
        {
          kind: 'delete' as const, label: 'Delete', onSelect: () => deleteHolding(h),
          confirm: { title: `Delete ${h.display_name}?`, message: 'Its transactions and valuations are deleted with it. You’ll have a few seconds to undo.', confirmLabel: 'Delete' },
        },
      ] : []),
    ]
  }

  // ── rows ────────────────────────────────────────────────────────────────────
  const displayRows: DisplayRow[] = useMemo(() => {
    if (groupBy !== 'fund') return openHoldings.map((holding): DisplayRow => ({ kind: 'holding', holding }))
    const fundGroups = new Map<string, DashboardHolding[]>()
    const rows: DisplayRow[] = []
    for (const h of openHoldings) {
      if (!MF_TYPES.has(h.instrument_type)) { rows.push({ kind: 'holding', holding: h }); continue }
      const list = fundGroups.get(h.display_name)
      if (list) list.push(h); else fundGroups.set(h.display_name, [h])
    }
    for (const [fundName, group] of fundGroups) {
      if (group.length === 1) { rows.push({ kind: 'holding', holding: group[0] }); continue }
      rows.push({
        kind: 'fund_rollup', key: `fund:${fundName}`, fundName, folios: group,
        totalInvested: sumBy(group, (h) => h.net_invested), totalValue: sumBy(group, (h) => h.market_value),
      })
    }
    return rows
  }, [openHoldings, groupBy])

  const typeAndCategory = (h: DashboardHolding) => {
    const cat = categoryOf(h)
    return { type: typeLabel(h.instrument_type), sub: cat?.name ?? 'Uncategorised' }
  }

  const nameCell = (r: DisplayRow) => {
    if (r.kind === 'fund_rollup') {
      return (
        <span className="flex min-w-0 items-center gap-3">
          <EntityIcon kind="asset" type="mutual_fund" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{r.fundName}</span>
            <span className="block text-xs text-ink-muted">{r.folios.length} folios</span>
          </span>
        </span>
      )
    }
    const h = r.holding
    const maturities = maturityByInstrument.get(h.instrument_id)
    const nearest = maturities?.[0]
    const soon = nearest ? daysUntil(nearest.date) : null
    return (
      <span className="flex min-w-0 items-center gap-3">
        <EntityIcon kind="asset" type={h.instrument_type} />
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-ink">{h.display_name}</span>
            {duplicateKeys.has(dupKey(h)) && <Badge tone="warning" icon={<Copy />} title="Possible duplicate — see the notice above">Duplicate?</Badge>}
            {soon !== null && soon >= 0 && soon < 30 && <Badge tone="warning">{formatMaturity(nearest!.date)}</Badge>}
          </span>
          {nearest && (
            <span className="block truncate text-xs text-ink-muted">
              {fmtRate(nearest.rate)} · matures <DateText value={nearest.date} />{maturities!.length > 1 ? ` (+${maturities!.length - 1} more)` : ''}
            </span>
          )}
        </span>
      </span>
    )
  }

  const gainCell = (r: DisplayRow) => {
    const invested = rowInvested(r)
    const value = rowValue(r)
    if (rowType(r) === 'cash' || invested <= 0) return <span className="text-ink-muted">—</span>
    const { gain, gainPct } = computeGain(value, invested, rowType(r))
    const outlier = gainPct !== null && Math.abs(gainPct) > OUTLIER_GAIN_PCT
    return (
      <span className="inline-flex flex-col items-end">
        <Amount value={gain} signed tone="gain" />
        {outlier
          ? <Badge tone="warning" title={`${gainPct!.toFixed(0)}% — usually a missing or zero cost`}>Check cost basis</Badge>
          : <Delta value={gainPct} className="text-xs" />}
      </span>
    )
  }

  const columns: DataTableColumn<DisplayRow>[] = [
    { key: 'name', label: 'Name', sortable: true, mobile: 'title',
      sortValue: (r) => (r.kind === 'holding' ? r.holding.display_name : r.fundName), render: nameCell },
    {
      key: 'type', label: 'Type', mobile: 'subtitle', hideWhenGroupedBy: 'type',
      sortable: true, sortValue: (r) => typeLabel(rowType(r)),
      render: (r) => {
        if (r.kind === 'fund_rollup') return <span className="text-ink-2">Mutual Fund</span>
        const { type, sub } = typeAndCategory(r.holding)
        return (
          <span className="min-w-0">
            <span className="truncate text-ink-2 md:block">{type}</span>
            <span className="text-ink-muted md:hidden"> · </span>
            <span className="truncate text-xs text-ink-muted md:block">{sub}</span>
          </span>
        )
      },
    },
    {
      key: 'owner', label: 'Owner', mobile: 'hide',
      render: (r) => (r.kind === 'fund_rollup' ? <span className="text-ink-muted">—</span> : <MemberAvatar name={ownerOf(r.holding)} />),
    },
    { key: 'invested', label: 'Invested', align: 'right', sortable: true, mobile: 'hide', sortValue: rowInvested,
      render: (r) => (rowInvested(r) > 0 ? <Amount value={rowInvested(r)} tone="muted" /> : <span className="text-ink-muted">—</span>) },
    { key: 'value', label: 'Value', align: 'right', sortable: true, mobile: 'value', sortValue: rowValue,
      render: (r) => <Amount value={rowValue(r)} className="font-semibold" /> },
    {
      key: 'gain', label: 'Gain', align: 'right', sortable: true, mobile: 'meta',
      sortValue: (r) => (rowInvested(r) > 0 ? computeGain(rowValue(r), rowInvested(r), rowType(r)).gain : null),
      render: gainCell,
    },
  ]

  const groupKeyOf = (h: DashboardHolding, by: string) => {
    if (by === 'type') return { key: h.instrument_type, label: typeLabel(h.instrument_type), color: assetTypeColor(h.instrument_type) }
    if (by === 'fund_category') { const k = fundGroupKeyOf(h); return { key: k, label: k } }
    if (by === 'sub_category') { const k = subCategoryOf(h); return { key: k, label: k } }
    const cat = categoryOf(h)
    return { key: cat ? String(cat.id) : 'uncat', label: cat?.name ?? 'Uncategorised', color: cat?.color }
  }

  const tableGroupBy: DataTableGroupBy<DisplayRow> | undefined = groupBy === 'none' || groupBy === 'fund' ? undefined : {
    options: [{ value: groupBy, label: groupBy }],
    value: groupBy,
    getGroup: (r, by) => groupKeyOf(r.kind === 'fund_rollup' ? r.folios[0] : r.holding, by),
    sortGroups: (a, b) => b.rows.reduce((s, r) => s + rowValue(r), 0) - a.rows.reduce((s, r) => s + rowValue(r), 0),
    aggregate: (rows) => {
      const invested = rows.reduce((s, r) => s + rowInvested(r), 0)
      const value = rows.reduce((s, r) => s + rowValue(r), 0)
      return {
        invested: <Amount value={invested} tone="muted" />,
        value: <Amount value={value} />,
        gain: <Amount value={value - invested} signed tone="gain" />,
      }
    },
  }

  // Card view: same rows, same order rules as before (sort picker, groups by value).
  const cardSections: CardSection[] = useMemo(() => {
    const val = (it: CardItem) => (it.kind === 'fund_rollup' ? it.totalValue : parseFloat(it.holding.market_value))
    const inv = (it: CardItem) => (it.kind === 'fund_rollup' ? it.totalInvested : parseFloat(it.holding.net_invested))
    const name = (it: CardItem) => (it.kind === 'fund_rollup' ? it.fundName : it.holding.instrument_name)
    const gainOf = (it: CardItem) => computeGain(val(it), inv(it), it.kind === 'fund_rollup' ? 'mutual_fund' : it.holding.instrument_type)
    const sortFn = (a: CardItem, b: CardItem) => {
      if (sortBy === 'name') return name(a).localeCompare(name(b))
      if (sortBy === 'invested') return inv(b) - inv(a)
      if (sortBy === 'gain') return gainOf(b).gain - gainOf(a).gain
      if (sortBy === 'gainPct') return (gainOf(b).gainPct ?? -Infinity) - (gainOf(a).gainPct ?? -Infinity)
      return val(b) - val(a)
    }
    const items = displayRows as CardItem[]
    if (groupBy === 'none' || groupBy === 'fund') {
      return [{ key: 'all', label: '', items: [...items].sort(sortFn), total: items.reduce((s, it) => s + val(it), 0) }]
    }
    const map = new Map<string, CardSection>()
    for (const it of items) {
      const g = groupKeyOf(it.kind === 'fund_rollup' ? it.folios[0] : it.holding, groupBy)
      if (!map.has(g.key)) map.set(g.key, { key: g.key, label: g.label, color: g.color, items: [], total: 0 })
      const s = map.get(g.key)!
      s.items.push(it); s.total += val(it)
    }
    return [...map.values()].sort((a, b) => b.total - a.total).map((s) => ({ ...s, items: s.items.sort(sortFn) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayRows, groupBy, sortBy, categories, fundGroupKeyOf, subCategoryOf])

  const detailHolding = detailKey ? (activeMemberId !== null ? memberHoldings ?? [] : dashboard.holdings).find((h) => dupKey(h) === detailKey) ?? null : null
  const detailInst = detailHolding ? resolveInstrument(detailHolding) : null
  const filtersActive = Object.keys(holdingFilters).length > 0 || !!search.trim()

  return (
    <PageLayoutWrapper
      memberName={memberName}
      canWrite={canWrite}
      householdId={householdId}
      updatingPrices={updatingPrices}
      onUpdatePrices={() => void updatePrices()}
      onLinkFunds={() => setSheet({ type: 'fund-match' })}
      summary={(
        <>
          <StatCard label="Current value" loading={holdingsLoading} value={<Amount value={summary.value} format="compact" />} />
          <StatCard label="Invested" loading={holdingsLoading} value={<Amount value={summary.invested} format="compact" />} />
          <StatCard label="Gain" loading={holdingsLoading} value={<Amount value={summary.gain} format="compact" signed tone="gain" />}
            delta={<Delta value={summary.gainPct} label="on invested" />} />
          <StatCard label="Holdings" loading={holdingsLoading} value={fmtCount(summary.count)}
            subtitle={closedHoldings.length ? `${closedHoldings.length} closed` : undefined} />
        </>
      )}
      notices={!holdingsLoading && duplicateGroups.length > 0 ? (
        <Notice tone="warning" title={`${duplicateGroups.length} possible duplicate${duplicateGroups.length === 1 ? '' : 's'}`}
          action={<Button variant="secondary" size="sm" onClick={() => setSheet({ type: 'duplicates' })}>Review</Button>}>
          These look like the same holding imported more than once, which double-counts it in your totals.
        </Notice>
      ) : undefined}
      toolbar={(
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Search holdings…' }}
          fields={holdingFilterFields}
          value={holdingFilters}
          onChange={setHoldingFilters}
          onClearAll={() => setSearch('')}
          resultLabel={filtersActive ? `Showing ${activeHoldings.length} of ${(activeMemberId !== null ? memberHoldings ?? [] : dashboard.holdings).length} holdings` : undefined}
          controls={(
            <>
              <ToolbarSelect
                label="Group by"
                value={groupBy}
                options={[
                  { value: 'fund', label: 'Fund' }, { value: 'fund_category', label: 'Fund category' },
                  { value: 'sub_category', label: 'Sub-category' }, { value: 'type', label: 'Type' },
                  { value: 'category', label: 'Category' }, { value: 'none', label: 'None' },
                ]}
                onChange={(v) => setGroupBy(v as HoldingGroupBy)}
              />
              <ToolbarSelect label="View" value={viewMode} options={[{ value: 'table', label: 'Table' }, { value: 'card', label: 'Cards' }]}
                onChange={(v) => changeViewMode(v as ViewMode)} />
              {viewMode === 'card' && (
                <ToolbarSelect label="Sort" value={sortBy}
                  options={[{ value: 'value', label: 'Value' }, { value: 'gain', label: 'Gain ₹' }, { value: 'gainPct', label: 'Gain %' }, { value: 'invested', label: 'Invested' }, { value: 'name', label: 'Name' }]}
                  onChange={(v) => setSortBy(v as HoldingSortBy)} />
              )}
              {viewMode === 'table' && <DensityToggle />}
            </>
          )}
        />
      )}
    >
      {!holdingsLoading && activeHoldings.length === 0 ? (
        <Card>
          {filtersActive ? (
            <EmptyState icon={<SearchX />} title="No holdings match" description="Try a different search or clear the filters."
              action={<Button variant="secondary" onClick={() => { setSearch(''); setHoldingFilters({}) }}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={<TrendingUp />} size="page"
              title={activeMemberId !== null ? `No holdings for ${memberName}` : 'No holdings yet'}
              description="Add a holding, or import a statement from More → Import." />
          )}
        </Card>
      ) : viewMode === 'table' ? (
        <DataTable
          ariaLabel="Holdings"
          columns={columns}
          rows={displayRows}
          rowKey={(r) => (r.kind === 'fund_rollup' ? r.key : dupKey(r.holding))}
          subRows={(r) => (r.kind === 'fund_rollup' ? r.folios.map((holding): DisplayRow => ({ kind: 'holding', holding })) : undefined)}
          defaultSortCol="value"
          defaultSortDir="desc"
          groupBy={tableGroupBy}
          loading={holdingsLoading}
          onRowClick={(r) => { if (r.kind === 'holding') setDetailKey(dupKey(r.holding)) }}
          rowActions={(r) => (r.kind === 'holding' ? actionsFor(r.holding) : [])}
          footer={<span className="flex justify-between gap-4"><span>{fmtCount(summary.count)} holdings</span><span>Total <Amount value={summary.value} className="font-semibold text-ink" /></span></span>}
        />
      ) : (
        <HoldingsCardView
          sections={cardSections}
          itemKey={dupKey}
          subtitleOf={(h) => { const { type, sub } = typeAndCategory(h); return `${type} · ${sub}` }}
          ownerOf={ownerOf}
          actionsFor={actionsFor}
          onOpen={(h) => setDetailKey(dupKey(h))}
        />
      )}

      {closedHoldings.length > 0 && (
        <Card title="Closed positions" subtitle="Fully sold — realised gain or loss instead of a market value." flush
          actions={<Button variant="ghost" size="sm" onClick={() => setShowClosed((v) => !v)}>{showClosed ? 'Hide' : `Show ${closedHoldings.length}`}</Button>}>
          {showClosed && (
            <div className="px-4 pb-4 md:px-6 md:pb-6">
              <DataTable
                ariaLabel="Closed positions"
                maxHeight="none"
                columns={[
                  { key: 'name', label: 'Name', mobile: 'title', render: (h) => <span className="font-medium text-ink">{h.display_name}</span> },
                  { key: 'type', label: 'Type', mobile: 'subtitle', render: (h) => typeLabel(h.instrument_type) },
                  { key: 'realised', label: 'Realised gain', align: 'right', sortable: true, mobile: 'value', sortValue: (h) => parseFloat(h.realized_gain_total),
                    render: (h) => <Amount value={h.realized_gain_total} signed tone="gain" /> },
                ]}
                rows={closedHoldings}
                rowKey={dupKey}
                defaultSortCol="realised"
                isRowMuted={() => true}
                onRowClick={(h) => setDetailKey(dupKey(h))}
              />
            </div>
          )}
        </Card>
      )}

      {inactiveInstruments.length > 0 && (
        <Card title="Inactive holdings" subtitle="Closed or matured — excluded from net worth, allocation and rebalancing." flush
          actions={<Button variant="ghost" size="sm" onClick={() => setShowInactive((v) => !v)}>{showInactive ? 'Hide' : `Show ${inactiveInstruments.length}`}</Button>}>
          {showInactive && (
            <div className="px-4 pb-4 md:px-6 md:pb-6">
              <DataTable
                ariaLabel="Inactive holdings"
                maxHeight="none"
                columns={[
                  { key: 'name', label: 'Name', mobile: 'title', render: (i) => <span className="text-ink-2">{i.name}</span> },
                  { key: 'type', label: 'Type', mobile: 'subtitle', render: (i) => <span className="inline-flex items-center gap-2">{typeLabel(i.instrument_type)} <Badge>Inactive</Badge></span> },
                  {
                    key: 'last', label: 'Last known value', align: 'right', mobile: 'value',
                    render: (inst) => {
                      const legs = maturityByInstrument.get(inst.id) ?? []
                      const lastLeg = legs[legs.length - 1]
                      const fd = lastLeg ? fdDetails.find((d) => d.instrument === inst.id && d.maturity_date === lastLeg.date) : undefined
                      return fd ? <Amount value={fd.maturity_value ?? fd.principal} tone="muted" /> : <span className="text-ink-muted">—</span>
                    },
                  },
                ]}
                rows={inactiveInstruments}
                rowKey={(i) => i.id}
                isRowMuted={() => true}
              />
            </div>
          )}
        </Card>
      )}

      {detailHolding && detailInst && (
        <HoldingDetailDrawer
          open
          onClose={() => setDetailKey(null)}
          householdId={householdId}
          holding={detailHolding}
          instrument={detailInst}
          category={categoryOf(detailHolding)}
          maturities={maturityByInstrument.get(detailHolding.instrument_id)}
          onBuy={() => setSheet({ type: 'buy', instrumentId: detailInst.id, investmentId: detailHolding.investment_id ?? undefined })}
          onSell={isQuantityTracked(detailHolding) ? () => setSheet({ type: 'sell', instrumentId: detailInst.id, investmentId: detailHolding.investment_id ?? undefined, holdingName: detailHolding.display_name, currentQuantity: detailHolding.quantity }) : undefined}
          onUpdateValue={() => setSheet({ type: 'valuation', instrumentId: detailInst.id, investmentId: detailHolding.investment_id, instrumentName: detailHolding.display_name })}
          onEdit={() => openEdit(detailHolding)}
          onDelete={() => deleteHolding(detailHolding)}
          onTransactionsChanged={afterTransactionsChanged}
        />
      )}

      {/* sheets */}
      {sheet.type === 'duplicates' && (
        <Sheet title="Possible duplicates" subtitle="Keep one of each and delete the rest — deleting removes the holding with its transactions and valuations." onClose={close} wide
          footer={canWrite ? (
            <>
              <Button variant="secondary" onClick={selectSuggestedDups}>Select suggested</Button>
              {selectedDups.length > 0 && <Button variant="ghost" onClick={() => setSelectedDupKeys(new Set())}>Clear</Button>}
              <Button variant="destructive" className="ml-auto" disabled={selectedDups.length === 0} loading={purgingKeys.size > 0}
                onClick={() => void purgeHoldings(selectedDups)}>
                Delete selected{selectedDups.length ? ` (${selectedDups.length})` : ''}
              </Button>
            </>
          ) : undefined}>
          <div className="grid gap-3">
            {duplicateGroups.map((group) => (
              <div key={group.map(dupKey).join(',')} className="overflow-hidden rounded-[var(--radius-lg)] border border-line">
                {group.map((h, i) => {
                  const folio = h.investment_id ? investmentsById.get(h.investment_id)?.folio_no : ''
                  return (
                    <label key={dupKey(h)} className="flex min-h-12 items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                      {canWrite && (
                        <input type="checkbox" checked={selectedDupKeys.has(dupKey(h))} onChange={() => toggleDupSelected(h)}
                          aria-label={`Select ${h.display_name}`} className="h-4 w-4 shrink-0 accent-[var(--primary)]" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{h.display_name}</span>
                        <span className="block text-xs text-ink-muted">
                          {ownerOf(h)}{folio ? ` · Folio ${folio}` : ''} · Invested <Amount value={h.net_invested} format="compact" /> · Value <Amount value={h.market_value} format="compact" />
                        </span>
                      </span>
                      {i === 0 ? <Badge tone="success">Keep</Badge> : <Badge tone="warning">Suggested: delete</Badge>}
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        </Sheet>
      )}
      {sheet.type === 'fund-match' && (
        <Sheet title="Link funds to daily NAV" onClose={close} wide>
          <FundMatchSheet householdId={householdId} onDone={async () => { close(); await refreshDashboard() }} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'buy' && (
        <Sheet title="Record buy" onClose={close} wide>
          <BuyForm householdId={householdId} instrumentId={sheet.instrumentId} investmentId={sheet.investmentId} onSave={afterTrade} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'sell' && (
        <Sheet title="Record sell" onClose={close}>
          <SellForm householdId={householdId} instrumentId={sheet.instrumentId} investmentId={sheet.investmentId} holdingName={sheet.holdingName}
            currentQuantity={sheet.currentQuantity} onSave={afterTrade} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'valuation' && (
        <Sheet title="Update value" onClose={close}>
          <ValuationForm householdId={householdId} instrumentId={sheet.instrumentId} investmentId={sheet.investmentId} instrumentName={sheet.instrumentName} onSave={afterValuation} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'edit_instrument' && (
        <Sheet title="Edit instrument" onClose={close}>
          <InstrumentForm householdId={householdId} instrument={sheet.instrument}
            onSave={async () => { close(); await refreshDashboard(); await loadInstruments() }} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'edit_investment' && (
        <Sheet title={investmentEditTitle(sheet.investment, instrumentsFull)} onClose={close}>
          <InvestmentForm investment={sheet.investment}
            onSave={async () => { close(); await refreshDashboard(); await loadInvestments(); await loadMfDetails() }} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'category' && (
        <Sheet title={sheet.item ? 'Edit category' : 'New category'} onClose={close}>
          <AssetCategoryForm householdId={householdId} category={sheet.item}
            onSave={async () => { close(); await refreshCategories() }} onCancel={close} />
        </Sheet>
      )}
    </PageLayoutWrapper>
  )
}

/** Header + more-menu for the page (Export CSV, Link funds to NAV, Update prices). */
function PageLayoutWrapper({ memberName, canWrite, householdId, updatingPrices, onUpdatePrices, onLinkFunds, children, ...rest }: {
  memberName: string | null
  canWrite: boolean
  householdId: number
  updatingPrices: boolean
  onUpdatePrices: () => void
  onLinkFunds: () => void
  summary: React.ReactNode
  notices?: React.ReactNode
  toolbar: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <PageLayout
      title="Investments"
      description={memberName ? `${memberName}’s share` : undefined}
      primaryAction={{ label: 'Add holding', onClick: () => { window.location.hash = '/holdings/add' }, disabled: !canWrite }}
      moreActions={[
        { label: 'Export mutual funds (CSV)', icon: <Download />, href: `/api/instruments/export-mf-holdings/?household_id=${householdId}`, download: 'mutual_fund_holdings.csv', hint: 'One row per folio' },
        ...(canWrite ? [
          { label: 'Link funds to NAV', icon: <Link2 />, onSelect: onLinkFunds, hint: 'So fund values update daily' },
          { label: updatingPrices ? 'Updating prices…' : 'Update prices', icon: <RefreshCw />, onSelect: onUpdatePrices, disabled: updatingPrices, hint: 'Stocks at NSE close, funds at latest NAV' },
        ] : []),
      ]}
      {...rest}
    >
      {children}
    </PageLayout>
  )
}

