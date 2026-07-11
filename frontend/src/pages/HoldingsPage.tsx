import { Fragment, useEffect, useMemo, useState } from 'react'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { postJson } from '../api/http'
import { ledgerApi } from '../api/ledgerApi'
import { portfolioApi } from '../api/portfolioApi'
import { CategorySection } from '../components/assets/CategorySection'
import { InstrumentForm } from '../components/assets/InstrumentForm'
import { InstrumentRow } from '../components/assets/InstrumentRow'
import { InstrumentExpandedDetail } from '../components/assets/InstrumentExpandedDetail'
import { AssetCategoryForm } from '../components/assets/AssetCategoryForm'
import { ExpandableGridCard } from '../components/common/ExpandableGridCard'
import { Money } from '../components/common/Money'
import { useExpandable } from '../hooks/useExpandable'
import { Sheet } from '../components/ui/Sheet'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { computeGain } from '../lib/fmt'
import type { Account, AssetCategory, DashboardHolding, Instrument, InstrumentOwnership } from '../types/domain'

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

// ── buy form ──────────────────────────────────────────────────────────────────
const INSTRUMENT_TYPES_OPTS = ['equity','mutual_fund','fd','rd','epf','ppf','nps','gold','real_estate','insurance','lending','cash','other','vehicle','liability','sip'] as const

function BuyForm({ householdId, instrumentId: initId, onSave, onCancel }: {
  householdId: number; instrumentId?: number; onSave: () => void; onCancel: () => void
}) {
  const { members, categories } = useApp()
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [instrumentId, setInstrumentId] = useState(initId ? String(initId) : '')
  const [showNewInst, setShowNewInst] = useState(false)
  const [newInstName, setNewInstName] = useState('')
  const [newInstType, setNewInstType] = useState<Instrument['instrument_type']>('mutual_fund')
  const [newInstCategory, setNewInstCategory] = useState('')
  const [newInstInvestmentStartDate, setNewInstInvestmentStartDate] = useState('')
  const [newInstMaturityDate, setNewInstMaturityDate] = useState('')
  const [memberId, setMemberId] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [quantity, setQuantity] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [amount, setAmount] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [affectsBalance, setAffectsBalance] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { portfolioApi.listInstruments(householdId).then(setInstruments).catch(() => {}) }, [householdId])
  useEffect(() => { portfolioApi.listAccounts(householdId).then(setAccounts).catch(() => {}) }, [householdId])

  useEffect(() => {
    const inst = instruments.find((i) => String(i.id) === instrumentId)
    if (inst?.default_account) setAccountId(String(inst.default_account))
  }, [instrumentId, instruments])

  useEffect(() => {
    if (quantity && pricePerUnit) setAmount((parseFloat(quantity) * parseFloat(pricePerUnit)).toFixed(2))
  }, [quantity, pricePerUnit])

  const save = async () => {
    if (!amount || parseFloat(amount) <= 0) { setError('Enter total amount paid.'); return }
    setSaving(true); setError('')
    try {
      let finalId = instrumentId ? Number(instrumentId) : null
      if (showNewInst) {
        if (!newInstName.trim()) { setError('Enter instrument name.'); setSaving(false); return }
        const metadata: Record<string, unknown> = {}
        if (newInstType === 'fd') {
          if (newInstInvestmentStartDate) metadata.investment_start_date = newInstInvestmentStartDate
          if (newInstMaturityDate) metadata.maturity_date = newInstMaturityDate
        }
        const created = await portfolioApi.createInstrument({ household: householdId, name: newInstName.trim(), instrument_type: newInstType, asset_category: newInstCategory ? Number(newInstCategory) : null, symbol: '', default_account: null, metadata, is_active: true })
        finalId = created.id
      }
      if (!finalId) { setError('Select an instrument.'); setSaving(false); return }
      await ledgerApi.createTransaction({ household: householdId, member: memberId ? Number(memberId) : null, account: accountId ? Number(accountId) : null, instrument: finalId, tx_date: date, amount, quantity: quantity || null, price_per_unit: pricePerUnit || null, fees: '0.00', taxes: '0.00', currency: 'INR', direction: 'outflow', transaction_type: 'buy', external_reference: '', idempotency_key: `buy-${finalId}-${Date.now()}`, metadata: {}, affects_balance: accountId ? affectsBalance : true })
      if (memberId) {
        const existing = await portfolioApi.listInstrumentOwnerships(finalId)
        if (!existing.find((o) => o.member === Number(memberId)))
          await portfolioApi.createInstrumentOwnership({ instrument: finalId, member: Number(memberId), allocation_percent: '100.00' })
      }
      onSave()
    } catch (e: unknown) {
      setError(e && typeof e === 'object' && 'detail' in e ? String((e as { detail: unknown }).detail) : 'Failed to save.')
    } finally { setSaving(false) }
  }

  return (
    <div className="grid gap-3 max-h-[70vh] overflow-y-auto">
      {!initId && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Instrument</label>
          {!showNewInst ? (
            <div className="flex gap-2">
              <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} className={`flex-1 ${INP}`}>
                <option value="">— Select —</option>
                {instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowNewInst(true)} className="shrink-0 rounded-lg border border-dashed border-primary-400 px-3 text-xs text-primary-600 hover:bg-primary-50 dark:bg-primary-900/15">+ New</button>
            </div>
          ) : (
            <div className="rounded-xl border border-primary-200 bg-primary-50 dark:bg-primary-900/15 p-3 space-y-2">
              <p className="text-xs font-medium text-primary-700 dark:text-primary-300">New Instrument</p>
              <input placeholder="Name" value={newInstName} onChange={(e) => setNewInstName(e.target.value)} className={INP} />
              <select value={newInstType} onChange={(e) => setNewInstType(e.target.value as Instrument['instrument_type'])} className={INP}>
                {INSTRUMENT_TYPES_OPTS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
              <select value={newInstCategory} onChange={(e) => setNewInstCategory(e.target.value)} className={INP}>
                <option value="">-- No category --</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {newInstType === 'fd' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Investment Start Date (Optional)</label>
                    <input type="date" value={newInstInvestmentStartDate} onChange={(e) => setNewInstInvestmentStartDate(e.target.value)} className={INP} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Maturity Date (Optional)</label>
                    <input type="date" value={newInstMaturityDate} onChange={(e) => setNewInstMaturityDate(e.target.value)} className={INP} />
                  </div>
                </>
              )}
              <button type="button" onClick={() => setShowNewInst(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-2)]">{'<- back to existing'}</button>
            </div>
          )}
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Owner (member)</label>
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={INP}>
          <option value="">— Unassigned —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Purchase Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INP} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Units / Qty</label>
          <input type="number" min="0" step="0.000001" placeholder="e.g. 10.5" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={INP} /></div>
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Price per unit</label>
          <input type="number" min="0" step="0.000001" placeholder="e.g. 94.50" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} className={INP} /></div>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Total amount paid (₹) *</label>
        <input type="number" min="0" step="0.01" placeholder="e.g. 5000" value={amount} onChange={(e) => setAmount(e.target.value)} className={INP} /></div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Paid from account (optional)</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={INP}>
          <option value="">— None —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {accountId && (
        <label className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
          <input
            type="checkbox"
            checked={affectsBalance}
            onChange={(e) => setAffectsBalance(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border)] text-primary-600 focus:ring-primary-500"
          />
          <span className="text-xs text-[var(--text-2)]">
            <span className="font-medium">Deduct from account balance</span>
            <br />
            <span className="text-[var(--text-muted)]">
              Turn off if this account never actually held the money (e.g. NPS debited straight from payroll) — still recorded and tagged to the account, just excluded from its balance.
            </span>
          </span>
        </label>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
        <button type="button" disabled={saving} onClick={save} className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">{saving ? 'Saving…' : 'Record Buy'}</button>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
type SheetState =
  | { type: 'none' }
  | { type: 'valuation'; instrumentId: number; instrumentName: string }
  | { type: 'buy'; instrumentId?: number }
  | { type: 'edit_instrument'; instrument: Instrument }
  | { type: 'category'; item?: AssetCategory }

type HoldingGroupBy = 'type' | 'category' | 'none'
type HoldingSortBy = 'value' | 'gain' | 'gainPct' | 'name' | 'invested'

const TYPE_LABELS: Record<string, string> = {
  equity: 'Equity', mutual_fund: 'Mutual Fund', fd: 'FD', rd: 'RD',
  epf: 'EPF', ppf: 'PPF', nps: 'NPS', gold: 'Gold',
  real_estate: 'Real Estate', sip: 'SIP', insurance: 'Insurance',
  cash: 'Cash', vehicle: 'Vehicle', liability: 'Liability', other: 'Other',
}

const TYPE_ICONS: Record<string, string> = {
  mutual_fund: '📊', equity: '📈', fd: '🏦', rd: '🏦', epf: '🛡',
  ppf: '🛡', nps: '🛡', gold: '🪙', real_estate: '🏠', sip: '🔄',
  insurance: '☂️', cash: '💵', other: '💼', vehicle: '🚗', liability: '⚠️',
}

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
  const [ownerships, setOwnerships] = useState<InstrumentOwnership[]>([])
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' })
  const [groupBy, setGroupBy] = useState<HoldingGroupBy>('type')
  const [sortBy, setSortBy] = useState<HoldingSortBy>('value')
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  const cardExpand = useExpandable<number>()
  const tableExpand = useExpandable<number>()

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem(VIEW_MODE_KEY, mode) } catch { /* ignore */ }
  }

  const loadInstruments = () => portfolioApi.listInstruments(householdId).then(setInstruments).catch(() => {})
  const loadOwnerships = () => portfolioApi.listInstrumentOwnerships(undefined, 200).then(setOwnerships).catch(() => {})

  useEffect(() => { void loadInstruments(); void loadOwnerships() }, [householdId])

  // Resync instruments whenever holdings change (e.g. after an import adds new instruments)
  useEffect(() => { void loadInstruments() }, [dashboard.holdings])

  const ownerMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const o of ownerships) {
      const label = members.find((mb) => mb.id === o.member)?.label ?? `#${o.member}`
      m.set(o.instrument, m.has(o.instrument) ? `${m.get(o.instrument)}, ${label}` : label)
    }
    return m
  }, [ownerships, members])

  useEffect(() => {
    if (activeMemberId === null) { setMemberHoldings(null); return }
    setHoldingsLoading(true)
    const q = new URLSearchParams({ household_id: String(householdId), as_of: asOf, member_id: String(activeMemberId) })
    fetch(`/api/holdings?${q}`).then((r) => r.json()).then((d) => setMemberHoldings(d.holdings ?? [])).catch(() => setMemberHoldings([])).finally(() => setHoldingsLoading(false))
  }, [activeMemberId, householdId, asOf])

  const close = () => setSheet({ type: 'none' })
  const afterBuy = async () => { close(); await refreshDashboard(); await loadInstruments(); await loadOwnerships() }
  const afterValuation = async () => { close(); await refreshDashboard() }

  const activeHoldings = activeMemberId !== null ? (memberHoldings ?? []) : dashboard.holdings

  const holdingsSections = useMemo(() => {
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

    const resolveInstrument = (h: DashboardHolding): Instrument =>
      instruments.find((i) => i.id === h.instrument_id) ?? {
        id: h.instrument_id,
        name: h.instrument_name,
        instrument_type: h.instrument_type as Instrument['instrument_type'],
        asset_category: h.asset_category,
        household: householdId,
        default_account: null,
        symbol: '',
        metadata: {},
        is_active: true,
      }

    const renderRow = (h: DashboardHolding, catOverride?: AssetCategory) => {
      const cat = catOverride ?? categories.find(c => c.id === h.asset_category)
      const inst = resolveInstrument(h)
      const isExpanded = cardExpand.isExpanded(h.instrument_id)
      return (
        <ExpandableGridCard
          key={h.instrument_id}
          expanded={isExpanded}
          onToggle={() => cardExpand.toggle(h.instrument_id)}
          className={isExpanded ? 'ring-2 ring-primary-400 ring-offset-1 rounded-xl' : ''}
          collapsed={
            <InstrumentRow instrument={inst} holding={h} category={cat}
              onBuy={canWrite ? () => setSheet({ type: 'buy', instrumentId: inst.id }) : undefined}
              onUpdateValue={canWrite ? () => setSheet({ type: 'valuation', instrumentId: inst.id, instrumentName: inst.name }) : undefined}
            />
          }
        >
          <InstrumentExpandedDetail
            householdId={householdId}
            holding={h}
            instrument={inst}
            onBuy={() => setSheet({ type: 'buy', instrumentId: inst.id })}
            onUpdateValue={() => setSheet({ type: 'valuation', instrumentId: inst.id, instrumentName: inst.name })}
            onEdit={() => setSheet({ type: 'edit_instrument', instrument: inst })}
            onTransactionsChanged={async () => { await refreshDashboard(); await loadInstruments() }}
            onDeleted={async () => { await refreshDashboard(); await loadInstruments() }}
          />
        </ExpandableGridCard>
      )
    }

    const thCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap'

    const TABLE_COLS = 8

    const renderTableRow = (h: DashboardHolding, catOverride?: AssetCategory) => {
      const cat = catOverride ?? categories.find(c => c.id === h.asset_category)
      const inst = resolveInstrument(h)
      const invested = parseFloat(h.net_invested)
      const marketValue = parseFloat(h.market_value)
      const { gain, gainPct } = computeGain(marketValue, invested, h.instrument_type)
      const isExpanded = tableExpand.isExpanded(h.instrument_id)
      return (
        <Fragment key={h.instrument_id}>
          <tr
            className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface-2)]"
            onClick={() => tableExpand.toggle(h.instrument_id)}
          >
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm">
                  {TYPE_ICONS[inst.instrument_type] ?? '💼'}
                </span>
                <span className="truncate text-sm font-medium text-[var(--text)]">{inst.name}</span>
              </div>
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-xs capitalize text-[var(--text-2)]">{TYPE_LABELS[inst.instrument_type] ?? inst.instrument_type}</td>
            <td className="px-3 py-2 text-xs text-[var(--text-2)]">
              {cat ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat.color }} />
                  {cat.name}
                </span>
              ) : <span className="text-[var(--text-faint)]">Uncategorised</span>}
            </td>
            <td className="px-3 py-2 text-xs text-[var(--text-2)]">{ownerMap.get(inst.id) ?? 'Unassigned'}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-[var(--text-2)]">{invested > 0 ? <Money value={invested} /> : '—'}</td>
            <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold"><Money value={marketValue} /></td>
            <td className={`whitespace-nowrap px-3 py-2 text-right text-xs font-medium ${gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {h.instrument_type !== 'cash' && invested > 0 ? <>{gain >= 0 ? '+' : ''}<Money value={gain} />{gainPct !== null ? ` (${gain >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)` : ''}</> : '—'}
            </td>
            <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-end gap-1">
                <button type="button" onClick={() => setSheet({ type: 'buy', instrumentId: inst.id })} disabled={!canWrite}
                  className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                  Buy
                </button>
                <button type="button" onClick={() => setSheet({ type: 'valuation', instrumentId: inst.id, instrumentName: inst.name })} disabled={!canWrite}
                  className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                  Update Value
                </button>
              </div>
            </td>
          </tr>
          {isExpanded && (
            <tr>
              <td colSpan={TABLE_COLS} className="bg-[var(--surface-2)] px-4 py-3">
                <InstrumentExpandedDetail
                  householdId={householdId}
                  holding={h}
                  instrument={inst}
                  onBuy={() => setSheet({ type: 'buy', instrumentId: inst.id })}
                  onUpdateValue={() => setSheet({ type: 'valuation', instrumentId: inst.id, instrumentName: inst.name })}
                  onEdit={() => setSheet({ type: 'edit_instrument', instrument: inst })}
                  onTransactionsChanged={async () => { await refreshDashboard(); await loadInstruments() }}
                  onDeleted={async () => { tableExpand.toggle(h.instrument_id); await refreshDashboard(); await loadInstruments() }}
                />
              </td>
            </tr>
          )}
        </Fragment>
      )
    }

    const renderTable = (list: DashboardHolding[], cat?: AssetCategory) => (
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)]">
            <tr>
              <th className={thCls}>Name</th>
              <th className={thCls}>Type</th>
              <th className={thCls}>Category</th>
              <th className={thCls}>Owner</th>
              <th className={`${thCls} text-right`}>Invested</th>
              <th className={`${thCls} text-right`}>Value</th>
              <th className={`${thCls} text-right`}>Gain</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>{list.map(h => renderTableRow(h, cat))}</tbody>
        </table>
      </div>
    )

    if (groupBy === 'none') {
      const sorted = [...activeHoldings].sort(sortFn)
      return viewMode === 'table' ? renderTable(sorted) : <div className="card-grid grid gap-3">{sorted.map(h => renderRow(h))}</div>
    }

    if (groupBy === 'type') {
      const groups = new Map<string, DashboardHolding[]>()
      for (const h of activeHoldings) {
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
          <CategorySection key={label} name={label} color="#b4521f" totalValue={total} count={group.length} gridChildren={viewMode === 'card'}>
            {viewMode === 'table' ? renderTable(sorted) : sorted.map(h => renderRow(h))}
          </CategorySection>
        )
      })
    }

    // groupBy === 'category'
    const catMap = new Map<number | null, DashboardHolding[]>()
    catMap.set(null, [])
    for (const h of activeHoldings) {
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
        <CategorySection key={cat.id} name={cat.name} color={cat.color} totalValue={total} count={group.length} gridChildren={viewMode === 'card'}>
          {viewMode === 'table' ? renderTable(sorted, cat) : sorted.map(h => renderRow(h, cat))}
        </CategorySection>
      )
    }
    const uncat = catMap.get(null) ?? []
    if (uncat.length > 0) {
      const total = uncat.reduce((s, h) => s + parseFloat(h.market_value), 0).toFixed(2)
      const sorted = [...uncat].sort(sortFn)
      sections.push(
        <CategorySection key="uncat" name="Uncategorised" color="#94a3b8" totalValue={total} count={uncat.length} gridChildren={viewMode === 'card'}>
          {viewMode === 'table' ? renderTable(sorted) : sorted.map(h => renderRow(h))}
        </CategorySection>
      )
    }
    return sections
  }, [activeHoldings, categories, instruments, canWrite, groupBy, sortBy, viewMode, householdId, cardExpand, refreshDashboard, loadInstruments])

  const pillCls = (active: boolean) =>
    `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${active ? 'bg-primary-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'}`

  return (
    <div className="grid gap-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
            {([['type', 'Type'], ['category', 'Category'], ['none', 'None']] as [HoldingGroupBy, string][]).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setGroupBy(v)} className={pillCls(groupBy === v)}>{l}</button>
            ))}
          </div>
          {/* Sort by */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">Sort:</span>
            {([['value', 'Value'], ['gain', 'Gain ₹'], ['gainPct', 'Gain %'], ['invested', 'Invested'], ['name', 'Name']] as [HoldingSortBy, string][]).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setSortBy(v)} className={pillCls(sortBy === v)}>{l}</button>
            ))}
          </div>
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
          <button type="button" onClick={() => setSheet({ type: 'buy' })} disabled={!canWrite}
            className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            + Add Holding
          </button>
        </div>
      </div>

      {holdingsLoading ? (
        <div className="flex justify-center py-8"><CoinSpinner size={48} /></div>
      ) : activeHoldings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-3xl">📊</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-2)]">{activeMemberId !== null ? 'No holdings for this member' : 'No holdings yet'}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Tap + to add your first holding.</p>
        </div>
      ) : (
        <div className="grid gap-1">{holdingsSections}</div>
      )}

      {/* sheets */}
      {sheet.type === 'buy' && (
        <Sheet title={sheet.instrumentId ? 'Record Buy' : 'Add Holding'} onClose={close}>
          <BuyForm householdId={householdId} instrumentId={sheet.instrumentId} onSave={afterBuy} onCancel={close} />
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
      {sheet.type === 'category' && (
        <Sheet title={sheet.item ? 'Edit Category' : 'New Category'} onClose={close}>
          <AssetCategoryForm householdId={householdId} category={sheet.item}
            onSave={async () => { close(); await refreshCategories() }} onCancel={close} />
        </Sheet>
      )}
    </div>
  )
}
