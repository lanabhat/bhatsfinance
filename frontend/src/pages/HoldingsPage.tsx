import { useEffect, useMemo, useState } from 'react'
import { postJson } from '../api/http'
import { useMaskedFmt } from '../components/common/Money'
import { ledgerApi } from '../api/ledgerApi'
import { portfolioApi } from '../api/portfolioApi'
import { CategorySection } from '../components/assets/CategorySection'
import { InstrumentForm } from '../components/assets/InstrumentForm'
import { InstrumentRow } from '../components/assets/InstrumentRow'
import { AssetCategoryForm } from '../components/assets/AssetCategoryForm'
import { Sheet } from '../components/ui/Sheet'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import type { AssetCategory, DashboardHolding, Instrument, InstrumentOwnership, Transaction } from '../types/domain'

// ── shared helpers ────────────────────────────────────────────────────────────
const INP = 'w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

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
        <button type="button" disabled={saving} onClick={save} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}

// ── buy form ──────────────────────────────────────────────────────────────────
const INSTRUMENT_TYPES_OPTS = ['equity','mutual_fund','fd','rd','epf','ppf','nps','gold','real_estate','insurance','cash','other','vehicle','liability','sip'] as const

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { portfolioApi.listInstruments(householdId).then(setInstruments).catch(() => {}) }, [householdId])

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
      await ledgerApi.createTransaction({ household: householdId, member: memberId ? Number(memberId) : null, account: null, instrument: finalId, tx_date: date, amount, quantity: quantity || null, price_per_unit: pricePerUnit || null, fees: '0.00', taxes: '0.00', currency: 'INR', direction: 'outflow', transaction_type: 'buy', external_reference: '', idempotency_key: `buy-${finalId}-${Date.now()}`, metadata: {} })
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
              <button type="button" onClick={() => setShowNewInst(true)} className="shrink-0 rounded-lg border border-dashed border-indigo-400 px-3 text-xs text-indigo-600 hover:bg-indigo-50">+ New</button>
            </div>
          ) : (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2">
              <p className="text-xs font-medium text-indigo-700">New Instrument</p>
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
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
        <button type="button" disabled={saving} onClick={save} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving…' : 'Record Buy'}</button>
      </div>
    </div>
  )
}

// ── holding detail sheet ──────────────────────────────────────────────────────
function BuyHistoryEditor({ transaction, onSave, onCancel }: {
  transaction: Transaction
  onSave: () => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    tx_date: transaction.tx_date,
    amount: transaction.amount,
    quantity: transaction.quantity ?? '',
    price_per_unit: transaction.price_per_unit ?? '',
    external_reference: transaction.external_reference ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await ledgerApi.updateTransaction(transaction.id, {
        household: transaction.household,
        member: transaction.member,
        account: transaction.account,
        instrument: transaction.instrument,
        tx_date: form.tx_date,
        amount: form.amount,
        quantity: form.quantity || null,
        price_per_unit: form.price_per_unit || null,
        fees: transaction.fees,
        taxes: transaction.taxes,
        currency: transaction.currency,
        direction: transaction.direction,
        transaction_type: transaction.transaction_type,
        external_reference: form.external_reference,
        idempotency_key: transaction.idempotency_key,
        metadata: transaction.metadata,
      })
      await onSave()
    } catch {
      setError('Failed to update buy entry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-[var(--border)] px-5 py-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Edit Buy Entry</p>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Date</label>
            <input type="date" value={form.tx_date} onChange={(e) => setForm((p) => ({ ...p, tx_date: e.target.value }))} className={INP} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Amount</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Quantity</label>
            <input type="number" min="0" step="0.000001" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} className={INP} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Price per unit</label>
            <input type="number" min="0" step="0.000001" value={form.price_per_unit} onChange={(e) => setForm((p) => ({ ...p, price_per_unit: e.target.value }))} className={INP} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Reference</label>
          <input value={form.external_reference} onChange={(e) => setForm((p) => ({ ...p, external_reference: e.target.value }))} className={INP} />
        </div>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HoldingDetailSheet({ householdId, holding, instrument, onBuy, onUpdateValue, onEdit, onClose, onTransactionsChanged }: {
  householdId: number; holding: DashboardHolding; instrument: Instrument
  onBuy: () => void; onUpdateValue: () => void; onEdit: () => void; onClose: () => void; onTransactionsChanged: () => Promise<void>
}) {
  const { canWrite } = useAuth()
  const { members } = useApp()
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [ownerships, setOwnerships] = useState<InstrumentOwnership[]>([])
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [busyTxId, setBusyTxId] = useState<number | null>(null)
  const [actionError, setActionError] = useState('')

  const loadHistory = async () => {
    setLoading(true)
    const [t, o] = await Promise.all([
      ledgerApi.listTransactionsForInstrument(householdId, instrument.id),
      portfolioApi.listInstrumentOwnerships(instrument.id),
    ])
    setTxs(t)
    setOwnerships(o)
    setLoading(false)
  }

  useEffect(() => {
    void loadHistory()
  }, [householdId, instrument.id])

  const handleDeleteBuy = async (tx: Transaction) => {
    if (!confirm(`Delete buy entry from ${tx.tx_date}?`)) return
    setBusyTxId(tx.id)
    setActionError('')
    try {
      await ledgerApi.deleteTransaction(tx.id)
      await loadHistory()
      await onTransactionsChanged()
    } catch {
      setActionError('Failed to delete buy entry.')
    } finally {
      setBusyTxId(null)
    }
  }

  const buys = txs.filter((t) => t.transaction_type === 'buy')
  const gain = parseFloat(holding.market_value) - parseFloat(holding.net_invested)
  const gainPct = parseFloat(holding.net_invested) > 0 ? ((gain / parseFloat(holding.net_invested)) * 100).toFixed(1) : null

  const fmt = useMaskedFmt()

  const ownerLabel = ownerships.length > 0
    ? ownerships.map((o) => members.find((m) => m.id === o.member)?.label ?? `#${o.member}`).join(', ')
    : 'Unassigned'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-2xl bg-[var(--surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-base font-semibold text-[var(--text)]">{instrument.name}</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)] capitalize">{instrument.instrument_type.replace(/_/g, ' ')} · {ownerLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-2)]">✕</button>
        </div>
        <div className="grid grid-cols-3 gap-px bg-[var(--surface-2)] border-b border-[var(--border)]">
          {[
            { label: 'Current Value', value: fmt(holding.market_value) },
            { label: 'Invested', value: fmt(holding.net_invested) },
            { label: 'Gain / Loss', value: gainPct ? `${gain >= 0 ? '+' : ''}${gainPct}%` : '—' },
          ].map((s) => (
            <div key={s.label} className="bg-[var(--surface)] px-4 py-3 text-center">
              <p className={`text-sm font-bold ${s.label === 'Gain / Loss' ? (gain >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-[var(--text)]'}`}>{s.value}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="max-h-52 overflow-y-auto px-5 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Buy History</p>
          {actionError ? <p className="mb-2 text-xs text-red-500">{actionError}</p> : null}
          {loading ? <p className="py-3 text-center text-xs text-[var(--text-muted)]">Loading...</p>
          : buys.length === 0 ? <p className="py-3 text-center text-xs text-[var(--text-muted)]">No buy transactions recorded.</p>
          : buys.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0">
              <div>
                <p className="text-xs font-medium text-[var(--text-2)]">{t.tx_date}</p>
                {t.quantity && <p className="text-xs text-[var(--text-muted)]">{parseFloat(t.quantity).toFixed(4)} units</p>}
                {t.external_reference ? <p className="text-xs text-[var(--text-muted)]">{t.external_reference}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-[var(--text)]">{fmt(t.amount)}</p>
                {canWrite ? (
                  <>
                    <button type="button" onClick={() => setEditingTx(t)} className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-2)] hover:bg-[var(--surface-2)]">
                      Edit
                    </button>
                    <button type="button" disabled={busyTxId === t.id} onClick={() => void handleDeleteBuy(t)} className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50">
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {editingTx ? (
          <BuyHistoryEditor
            transaction={editingTx}
            onSave={async () => {
              setEditingTx(null)
              await loadHistory()
              await onTransactionsChanged()
            }}
            onCancel={() => setEditingTx(null)}
          />
        ) : null}
        <div className="flex gap-2 border-t border-[var(--border)] p-4">
          <button type="button" onClick={onBuy} disabled={!canWrite} className="flex-1 rounded-xl border border-indigo-300 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">+ Buy More</button>
          <button type="button" onClick={onUpdateValue} disabled={!canWrite} className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Update Value</button>
          <button type="button" onClick={onEdit} disabled={!canWrite} className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50" title="Edit instrument">✏️</button>
        </div>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
type SheetState =
  | { type: 'none' }
  | { type: 'valuation'; instrumentId: number; instrumentName: string }
  | { type: 'buy'; instrumentId?: number }
  | { type: 'holding_detail'; holding: DashboardHolding; instrument: Instrument }
  | { type: 'edit_instrument'; instrument: Instrument }
  | { type: 'category'; item?: AssetCategory }

export function HoldingsPage() {
  const { canWrite } = useAuth()
  const { householdId, categories, refreshCategories, dashboard, members, asOf, refreshDashboard } = useApp()
  const [activeMemberId, setActiveMemberId] = useState<number | null>(null)
  const [memberHoldings, setMemberHoldings] = useState<typeof dashboard.holdings | null>(null)
  const [holdingsLoading, setHoldingsLoading] = useState(false)
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' })

  const loadInstruments = () => portfolioApi.listInstruments(householdId).then(setInstruments).catch(() => {})

  useEffect(() => { void loadInstruments() }, [householdId])

  useEffect(() => {
    if (activeMemberId === null) { setMemberHoldings(null); return }
    setHoldingsLoading(true)
    const q = new URLSearchParams({ household_id: String(householdId), as_of: asOf, member_id: String(activeMemberId) })
    fetch(`/api/holdings?${q}`).then((r) => r.json()).then((d) => setMemberHoldings(d.holdings ?? [])).catch(() => setMemberHoldings([])).finally(() => setHoldingsLoading(false))
  }, [activeMemberId, householdId, asOf])

  const close = () => setSheet({ type: 'none' })
  const afterBuy = async () => { close(); await refreshDashboard(); await loadInstruments() }
  const afterValuation = async () => { close(); await refreshDashboard() }

  const activeHoldings = activeMemberId !== null ? (memberHoldings ?? []) : dashboard.holdings

  const holdingsSections = useMemo(() => {
    const catMap = new Map<number | null, typeof activeHoldings>()
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
      sections.push(
        <CategorySection key={cat.id} name={cat.name} color={cat.color} totalValue={total}>
          {group.map((h) => {
            const inst = instruments.find((i) => i.id === h.instrument_id)
            return inst ? (
              <InstrumentRow key={h.instrument_id} instrument={inst} holding={h} category={cat}
                onClick={() => setSheet({ type: 'holding_detail', holding: h, instrument: inst })}
                onBuy={canWrite ? () => setSheet({ type: 'buy', instrumentId: inst.id }) : undefined}
                onUpdateValue={canWrite ? () => setSheet({ type: 'valuation', instrumentId: inst.id, instrumentName: inst.name }) : undefined}
              />
            ) : null
          })}
        </CategorySection>
      )
    }
    const uncat = catMap.get(null) ?? []
    if (uncat.length > 0) {
      const total = uncat.reduce((s, h) => s + parseFloat(h.market_value), 0).toFixed(2)
      sections.push(
        <CategorySection key="uncat" name="Uncategorised" color="#94a3b8" totalValue={total}>
          {uncat.map((h) => {
            const inst = instruments.find((i) => i.id === h.instrument_id)
            return inst ? (
              <InstrumentRow key={h.instrument_id} instrument={inst} holding={h}
                onClick={() => setSheet({ type: 'holding_detail', holding: h, instrument: inst })}
                onBuy={canWrite ? () => setSheet({ type: 'buy', instrumentId: inst.id }) : undefined}
                onUpdateValue={canWrite ? () => setSheet({ type: 'valuation', instrumentId: inst.id, instrumentName: inst.name }) : undefined}
              />
            ) : null
          })}
        </CategorySection>
      )
    }
    return sections
  }, [activeHoldings, categories, instruments, canWrite])

  return (
    <div className="grid gap-3">
      {/* toolbar: member filter + add button */}
      <div className="flex items-center justify-between gap-2">
        {members.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveMemberId(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${activeMemberId === null ? 'bg-indigo-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'}`}>
            All
          </button>
          {members.map((m) => (
            <button key={m.id} type="button" onClick={() => setActiveMemberId(m.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${activeMemberId === m.id ? 'bg-indigo-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'}`}>
              {m.label}
            </button>
          ))}
        </div>
        )}
        <button type="button" onClick={() => setSheet({ type: 'buy' })} disabled={!canWrite}
          className="ml-auto shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          + Add Holding
        </button>
      </div>

      {holdingsLoading ? (
        <p className="py-6 text-center text-xs text-[var(--text-muted)]">Loading…</p>
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
      {sheet.type === 'holding_detail' && (
        <HoldingDetailSheet householdId={householdId} holding={sheet.holding} instrument={sheet.instrument}
          onBuy={() => setSheet({ type: 'buy', instrumentId: sheet.instrument.id })}
          onUpdateValue={() => setSheet({ type: 'valuation', instrumentId: sheet.instrument.id, instrumentName: sheet.instrument.name })}
          onEdit={() => setSheet({ type: 'edit_instrument', instrument: sheet.instrument })}
          onTransactionsChanged={async () => { await refreshDashboard(); await loadInstruments() }}
          onClose={close} />
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
