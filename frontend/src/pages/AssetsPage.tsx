import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { assetCategoryApi } from '../api/assetCategoryApi'
import { ledgerApi } from '../api/ledgerApi'
import { portfolioApi } from '../api/portfolioApi'
import { AssetCategoryForm } from '../components/assets/AssetCategoryForm'
import { AccountCard } from '../components/assets/AccountCard'
import { CategorySection } from '../components/assets/CategorySection'
import { InstrumentRow } from '../components/assets/InstrumentRow'
import { Sheet } from '../components/ui/Sheet'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { usePrivacy } from '../context/PrivacyContext'
import { computeGain } from '../lib/fmt'
import type { Account, AccountOwnership, AssetCategory, DashboardHolding, Instrument, InstrumentOwnership, Transaction } from '../types/domain'

type MainTab = 'holdings' | 'manage'
type ManageTab = 'accounts' | 'instruments' | 'categories'
type AccountGroupBy = 'none' | 'owner' | 'type'
type InstrumentGroupBy = 'none' | 'owner' | 'category' | 'type'

// ── generic grouping helper ───────────────────────────────────────────────────
function GroupHeader({ label, color }: { label: string; color?: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 first:mt-0">
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
    </div>
  )
}

// ── group-by pill selector ────────────────────────────────────────────────────
function GroupBySelector<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-xs text-[var(--text-muted)]">Group:</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            value === o.value
              ? 'bg-indigo-600 text-white'
              : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── slide-up sheet ────────────────────────────────────────────────────────────
// ── valuation form ────────────────────────────────────────────────────────────
function ValuationForm({ householdId, instrumentId, instrumentName, onSave, onCancel }: {
  householdId: number
  instrumentId: number
  instrumentName: string
  onSave: () => void
  onCancel: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [unitPrice, setUnitPrice] = useState('')
  const [marketValue, setMarketValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!unitPrice && !marketValue) { setError('Enter either unit price or market value.'); return }
    setSaving(true)
    setError('')
    try {
      await fetch('/api/valuations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household: householdId,
          instrument: instrumentId,
          valuation_date: date,
          unit_price: unitPrice || null,
          market_value: marketValue || null,
          balance: '0.00',
          source: 'manual',
          notes: '',
        }),
      })
      onSave()
    } catch {
      setError('Failed to save valuation.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-[var(--text-muted)]">{instrumentName}</p>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Unit Price</label>
        <input type="number" min="0" step="0.000001" placeholder="e.g. 94.50" value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Market Value (total)</label>
        <input type="number" min="0" step="0.01" placeholder="e.g. 50000" value={marketValue}
          onChange={(e) => setMarketValue(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={onCancel}
          className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]">
          Cancel
        </button>
        <button type="button" disabled={saving} onClick={save}
          className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── buy form ─────────────────────────────────────────────────────────────────
const INSTRUMENT_TYPES_OPTS = ['equity','mutual_fund','fd','rd','epf','ppf','nps','gold','real_estate','insurance','cash','other','vehicle','liability','sip'] as const

function BuyForm({ householdId, instrumentId: initInstrumentId, onSave, onCancel }: {
  householdId: number
  instrumentId?: number
  onSave: () => void
  onCancel: () => void
}) {
  const { members, categories } = useApp()
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [instrumentId, setInstrumentId] = useState<string>(initInstrumentId ? String(initInstrumentId) : '')
  const [showNewInst, setShowNewInst] = useState(false)
  const [newInstName, setNewInstName] = useState('')
  const [newInstType, setNewInstType] = useState<Instrument['instrument_type']>('mutual_fund')
  const [newInstCategory, setNewInstCategory] = useState<string>('')
  const [memberId, setMemberId] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [quantity, setQuantity] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [amount, setAmount] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [account, setAccount] = useState('')
  const [affectsBalance, setAffectsBalance] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    portfolioApi.listInstruments(householdId).then(setInstruments).catch(() => {})
  }, [householdId])
  useEffect(() => {
    portfolioApi.listAccounts(householdId).then(setAccounts).catch(() => {})
  }, [householdId])

  useEffect(() => {
    const inst = instruments.find((i) => String(i.id) === instrumentId)
    if (inst?.default_account) setAccount(String(inst.default_account))
  }, [instrumentId, instruments])

  // auto-compute amount when qty + price both filled
  useEffect(() => {
    if (quantity && pricePerUnit) {
      const computed = (parseFloat(quantity) * parseFloat(pricePerUnit)).toFixed(2)
      setAmount(computed)
    }
  }, [quantity, pricePerUnit])

  const inp = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  const save = async () => {
    if (!amount || parseFloat(amount) <= 0) { setError('Enter total amount paid.'); return }
    setSaving(true); setError('')
    try {
      let finalInstrumentId = instrumentId ? Number(instrumentId) : null
      // create instrument if new
      if (showNewInst) {
        if (!newInstName.trim()) { setError('Enter instrument name.'); setSaving(false); return }
        const created = await portfolioApi.createInstrument({
          household: householdId,
          name: newInstName.trim(),
          instrument_type: newInstType,
          asset_category: newInstCategory ? Number(newInstCategory) : null,
          symbol: '',
          default_account: null,
          metadata: {},
          is_active: true,
        })
        finalInstrumentId = created.id
      }
      if (!finalInstrumentId) { setError('Select an instrument.'); setSaving(false); return }

      await ledgerApi.createTransaction({
        household: householdId,
        member: memberId ? Number(memberId) : null,
        account: account ? Number(account) : null,
        instrument: finalInstrumentId,
        tx_date: date,
        amount,
        quantity: quantity || null,
        price_per_unit: pricePerUnit || null,
        fees: '0.00',
        taxes: '0.00',
        currency: 'INR',
        direction: 'outflow',
        transaction_type: 'buy',
        external_reference: '',
        idempotency_key: `buy-${finalInstrumentId}-${Date.now()}`,
        metadata: {},
        affects_balance: account ? affectsBalance : true,
      })

      // create ownership if member selected and none exists yet
      if (memberId) {
        const existing = await portfolioApi.listInstrumentOwnerships(finalInstrumentId)
        const alreadyOwned = existing.find((o) => o.member === Number(memberId))
        if (!alreadyOwned) {
          await portfolioApi.createInstrumentOwnership({
            instrument: finalInstrumentId,
            member: Number(memberId),
            allocation_percent: '100.00',
          })
        }
      }
      onSave()
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'detail' in e ? String((e as {detail: unknown}).detail) : 'Failed to save.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 overflow-y-auto max-h-[70vh]">
      {/* instrument selector */}
      {!initInstrumentId && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Instrument</label>
          {!showNewInst ? (
            <div className="flex gap-2">
              <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} className={`flex-1 ${inp}`}>
                <option value="">— Select —</option>
                {instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowNewInst(true)}
                className="shrink-0 rounded-lg border border-dashed border-indigo-400 px-3 text-xs text-indigo-600 hover:bg-indigo-50 dark:bg-indigo-900/15">
                + New
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/15 p-3 space-y-2">
              <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">New Instrument</p>
              <input placeholder="Name" value={newInstName} onChange={(e) => setNewInstName(e.target.value)} className={inp} />
              <select value={newInstType} onChange={(e) => setNewInstType(e.target.value as Instrument['instrument_type'])} className={inp}>
                {INSTRUMENT_TYPES_OPTS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
              <select value={newInstCategory} onChange={(e) => setNewInstCategory(e.target.value)} className={inp}>
                <option value="">— No category —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowNewInst(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-2)]">← back to existing</button>
            </div>
          )}
        </div>
      )}

      {/* member */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Owner (member)</label>
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inp}>
          <option value="">— Unassigned —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      {/* date */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Purchase Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
      </div>

      {/* qty + price */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Units / Qty</label>
          <input type="number" min="0" step="0.000001" placeholder="e.g. 10.5" value={quantity}
            onChange={(e) => setQuantity(e.target.value)} className={inp} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Price per unit</label>
          <input type="number" min="0" step="0.000001" placeholder="e.g. 94.50" value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value)} className={inp} />
        </div>
      </div>

      {/* amount */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Total amount paid (₹) *</label>
        <input type="number" min="0" step="0.01" placeholder="e.g. 5000" value={amount}
          onChange={(e) => setAmount(e.target.value)} className={inp} />
      </div>

      {/* account */}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Paid from account (optional)</label>
        <select value={account} onChange={(e) => setAccount(e.target.value)} className={inp}>
          <option value="">— None —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {account && (
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
        <button type="button" onClick={onCancel}
          className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]">
          Cancel
        </button>
        <button type="button" disabled={saving} onClick={save}
          className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Record Buy'}
        </button>
      </div>
    </div>
  )
}

// ── holding detail sheet ──────────────────────────────────────────────────────
function HoldingDetailSheet({ householdId, holding, instrument, members, onBuy, onUpdateValue, onClose }: {
  householdId: number
  holding: DashboardHolding
  instrument: Instrument
  members: { id: number; label: string }[]
  onBuy?: () => void
  onUpdateValue?: () => void
  onClose: () => void
}) {
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [ownerships, setOwnerships] = useState<InstrumentOwnership[]>([])
  const { hidden } = usePrivacy()

  useEffect(() => {
    Promise.all([
      ledgerApi.listTransactionsForInstrument(householdId, instrument.id),
      portfolioApi.listInstrumentOwnerships(instrument.id),
    ]).then(([t, o]) => { setTxs(t); setOwnerships(o) }).finally(() => setLoading(false))
  }, [householdId, instrument.id])

  const buys = txs.filter((t) => t.transaction_type === 'buy')
  const { gain, gainPct: gainPctNum } = computeGain(parseFloat(holding.market_value), parseFloat(holding.net_invested), instrument.instrument_type)
  const gainPct = gainPctNum !== null ? gainPctNum.toFixed(1) : null

  function fmt(v: string | number) {
    if (hidden) return '••••'
    const n = parseFloat(String(v))
    const abs = Math.abs(n)
    const sign = n < 0 ? '-' : ''
    if (abs >= 10_00_000) return `${sign}₹${(abs / 10_00_000).toFixed(2)}L`
    if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`
    return `${sign}₹${abs.toFixed(0)}`
  }

  const ownerLabel = ownerships.length > 0
    ? ownerships.map((o) => members.find((m) => m.id === o.member)?.label ?? `#${o.member}`).join(', ')
    : 'Unassigned'

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center md:p-4" onClick={onClose}>
      <div className="dialog-panel w-full max-w-lg rounded-t-2xl bg-[var(--surface)] shadow-xl md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-base font-semibold text-[var(--text)]">{instrument.name}</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)] capitalize">{instrument.instrument_type.replace(/_/g, ' ')} · {ownerLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-2)]">✕</button>
        </div>

        {/* stats */}
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

        {/* buy history */}
        <div className="max-h-52 overflow-y-auto px-5 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Buy History</p>
          {loading ? (
            <p className="py-3 text-center text-xs text-[var(--text-muted)]">Loading…</p>
          ) : buys.length === 0 ? (
            <p className="py-3 text-center text-xs text-[var(--text-muted)]">No buy transactions recorded.</p>
          ) : (
            buys.map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0">
                <div>
                  <p className="text-xs font-medium text-[var(--text-2)]">{t.tx_date}</p>
                  {t.quantity && <p className="text-xs text-[var(--text-muted)]">{parseFloat(t.quantity).toFixed(4)} units</p>}
                </div>
                <p className="text-xs font-semibold text-[var(--text)]">{fmt(t.amount)}</p>
              </div>
            ))
          )}
        </div>

        {/* actions */}
        <div className="flex gap-2 border-t border-[var(--border)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4">
          <button type="button" onClick={onBuy}
            className="flex-1 rounded-xl border border-indigo-300 py-2.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:bg-indigo-900/15">
            + Buy More
          </button>
          <button type="button" onClick={onUpdateValue}
            className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
            Update Value
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── account form (inline within Manage) ──────────────────────────────────────
const ACCOUNT_TYPES = ['bank', 'broker', 'pf', 'loan', 'credit_card', 'insurance', 'cash', 'other'] as const

function AccountForm({
  householdId,
  account,
  onSave,
  onCancel,
}: {
  householdId: number
  account?: Account
  onSave: () => void
  onCancel: () => void
}) {
  const { members } = useApp()
  const [form, setForm] = useState<Omit<Account, 'id'>>({
    household: householdId,
    name: account?.name ?? '',
    account_type: account?.account_type ?? 'bank',
    institution_name: account?.institution_name ?? '',
    primary_member: account?.primary_member ?? null,
    opening_balance: account?.opening_balance ?? '0',
    credit_limit: account?.credit_limit ?? null,
    statement_due_day: account?.statement_due_day ?? null,
    is_active: account?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (account) {
        await portfolioApi.updateAccount(account.id, form)
      } else {
        await portfolioApi.createAccount(form)
      }
      onSave()
    } catch {
      setError('Failed to save account')
    } finally {
      setSaving(false)
    }
  }

  const sel = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">{label}</label>
      {node}
    </div>
  )

  const inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      {...props}
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
    />
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {field('Name', inp({ value: form.name, onChange: (e) => setForm((p) => ({ ...p, name: e.target.value })), required: true }))}
      {field('Type',
        <select value={form.account_type} onChange={(e) => setForm((p) => ({ ...p, account_type: e.target.value as Account['account_type'] }))} className={sel}>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
      )}
      {field('Primary Owner',
        <select value={form.primary_member ?? ''} onChange={(e) => setForm((p) => ({ ...p, primary_member: e.target.value ? Number(e.target.value) : null }))} className={sel}>
          <option value="">— None —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      )}
      {field('Institution', inp({ value: form.institution_name, onChange: (e) => setForm((p) => ({ ...p, institution_name: e.target.value })) }))}
      {field('Opening Balance', inp({ type: 'number', value: form.opening_balance, onChange: (e) => setForm((p) => ({ ...p, opening_balance: e.target.value })) }))}
      {form.account_type === 'credit_card' && field('Credit Limit', inp({ type: 'number', value: form.credit_limit ?? '', onChange: (e) => setForm((p) => ({ ...p, credit_limit: e.target.value || null })) }))}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : account ? 'Update' : 'Add Account'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
      </div>
    </form>
  )
}

// ── instrument form (simplified) ─────────────────────────────────────────────
const INSTRUMENT_TYPES = ['equity','mutual_fund','fd','rd','epf','ppf','nps','gold','real_estate','insurance','cash','other','vehicle','liability','sip'] as const

function InstrumentForm({
  householdId,
  instrument,
  categories,
  onSave,
  onCancel,
}: {
  householdId: number
  instrument?: Instrument
  categories: AssetCategory[]
  onSave: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Omit<Instrument, 'id'>>({
    household: householdId,
    name: instrument?.name ?? '',
    instrument_type: instrument?.instrument_type ?? 'equity',
    symbol: instrument?.symbol ?? '',
    default_account: instrument?.default_account ?? null,
    asset_category: instrument?.asset_category ?? null,
    metadata: instrument?.metadata ?? {},
    is_active: instrument?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (instrument) {
        await portfolioApi.updateInstrument(instrument.id, form)
      } else {
        await portfolioApi.createInstrument(form)
      }
      onSave()
    } catch {
      setError('Failed to save instrument')
    } finally {
      setSaving(false)
    }
  }

  const inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
  )
  const sel = (value: string, onChange: (v: string) => void, children: React.ReactNode) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
      {children}
    </select>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Name</label>
        {inp({ value: form.name, onChange: (e) => setForm((p) => ({ ...p, name: e.target.value })), required: true })}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Type</label>
        {sel(form.instrument_type, (v) => setForm((p) => ({ ...p, instrument_type: v as Instrument['instrument_type'] })),
          INSTRUMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Category</label>
        {sel(String(form.asset_category ?? ''), (v) => setForm((p) => ({ ...p, asset_category: v ? Number(v) : null })),
          <>
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Symbol / Ticker (optional)</label>
        {inp({ value: form.symbol ?? '', onChange: (e) => setForm((p) => ({ ...p, symbol: e.target.value })) })}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : instrument ? 'Update' : 'Add Instrument'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
      </div>
    </form>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export function AssetsPage() {
  const { canWrite } = useAuth()
  const { householdId, categories, refreshCategories, dashboard, members, asOf, refreshDashboard } = useApp()

  const [mainTab, setMainTab] = useState<MainTab>('holdings')
  const [manageTab, setManageTab] = useState<ManageTab>('accounts')
  const [activeMemberId, setActiveMemberId] = useState<number | null>(null)
  const [memberHoldings, setMemberHoldings] = useState<typeof dashboard.holdings | null>(null)
  const [holdingsLoading, setHoldingsLoading] = useState(false)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [loading, setLoading] = useState(false)
  const [accountOwnerships, setAccountOwnerships] = useState<AccountOwnership[]>([])
  const [instrumentOwnerships, setInstrumentOwnerships] = useState<InstrumentOwnership[]>([])
  const [accountGroupBy, setAccountGroupBy] = useState<AccountGroupBy>('none')
  const [instrumentGroupBy, setInstrumentGroupBy] = useState<InstrumentGroupBy>('none')

  // sheet state
  type SheetState =
    | { type: 'none' }
    | { type: 'account'; item?: Account }
    | { type: 'instrument'; item?: Instrument }
    | { type: 'category'; item?: AssetCategory }
    | { type: 'valuation'; instrumentId: number; instrumentName: string }
    | { type: 'buy'; instrumentId?: number }
    | { type: 'holding_detail'; holding: DashboardHolding; instrument: Instrument }
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' })

  const loadData = async () => {
    setLoading(true)
    try {
      const [a, i, ao, io] = await Promise.all([
        portfolioApi.listAccounts(householdId),
        portfolioApi.listInstruments(householdId),
        portfolioApi.listAccountOwnerships(),
        portfolioApi.listInstrumentOwnerships(),
      ])
      setAccounts(a)
      setInstruments(i)
      setAccountOwnerships(ao)
      setInstrumentOwnerships(io)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [householdId])

  // Fetch member-filtered holdings when a member pill is selected
  useEffect(() => {
    if (activeMemberId === null) { setMemberHoldings(null); return }
    setHoldingsLoading(true)
    const q = new URLSearchParams({ household_id: String(householdId), as_of: asOf, member_id: String(activeMemberId) })
    fetch(`/api/holdings?${q}`)
      .then((r) => r.json())
      .then((data) => setMemberHoldings(data.holdings ?? []))
      .catch(() => setMemberHoldings([]))
      .finally(() => setHoldingsLoading(false))
  }, [activeMemberId, householdId, asOf])

  const afterSave = async () => {
    setSheet({ type: 'none' })
    await loadData()
    await refreshCategories()
  }

  const deleteCategory = async (id: number) => {
    if (!confirm('Delete this category? Instruments will become uncategorised.')) return
    await assetCategoryApi.delete(id)
    await refreshCategories()
  }

  // ── Holdings sections (memoised) ────────────────────────────────────────
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
              <InstrumentRow
                key={h.instrument_id}
                instrument={inst}
                holding={h}
                category={cat}
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
              <InstrumentRow
                key={h.instrument_id}
                instrument={inst}
                holding={h}
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
  }, [activeHoldings, categories, instruments])

  // ── Holdings view ────────────────────────────────────────────────────────
  const holdingsView = () => {
    return (
      <div className="grid gap-3">
        {/* member filter pills — only show when there are multiple members */}
        {members.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveMemberId(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeMemberId === null ? 'bg-indigo-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
              }`}
            >
              All
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveMemberId(m.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeMemberId === m.id ? 'bg-indigo-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {holdingsLoading ? (
          <p className="py-6 text-center text-xs text-[var(--text-muted)]">Loading…</p>
        ) : activeHoldings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <p className="text-3xl">📊</p>
            <p className="mt-2 text-sm font-medium text-[var(--text-2)]">
              {activeMemberId !== null ? 'No holdings for this member' : 'No holdings yet'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Tap + to add your first holding.</p>
          </div>
        ) : (
          <div className="grid gap-1">{holdingsSections}</div>
        )}

        {/* FAB — add new holding */}
        <button
          type="button"
          onClick={() => setSheet({ type: 'buy' })}
          disabled={!canWrite}
          className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-2xl text-white shadow-lg hover:bg-indigo-700 disabled:opacity-50 md:bottom-8 md:right-8"
          title="Add holding"
        >
          +
        </button>
      </div>
    )
  }

  // ── Manage: derived grouping data ────────────────────────────────────────

  // map accountId → owner label
  const accountOwnerMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const a of accounts) {
      const owners = accountOwnerships.filter((o) => o.account === a.id)
      m.set(a.id, owners.length
        ? owners.map((o) => members.find((mb) => mb.id === o.member)?.label ?? `#${o.member}`).join(', ')
        : 'Unassigned')
    }
    return m
  }, [accounts, accountOwnerships, members])

  // map instrumentId → owner label
  const instrumentOwnerMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const i of instruments) {
      const owners = instrumentOwnerships.filter((o) => o.instrument === i.id)
      m.set(i.id, owners.length
        ? owners.map((o) => members.find((mb) => mb.id === o.member)?.label ?? `#${o.member}`).join(', ')
        : 'Unassigned')
    }
    return m
  }, [instruments, instrumentOwnerships, members])

  // grouped accounts: Map<groupLabel, Account[]>
  const groupedAccounts = useMemo(() => {
    const grouped = new Map<string, Account[]>()
    for (const a of accounts) {
      let key: string
      if (accountGroupBy === 'owner') key = accountOwnerMap.get(a.id) ?? 'Unassigned'
      else if (accountGroupBy === 'type') key = a.account_type.replace(/_/g, ' ')
      else key = '__flat__'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(a)
    }
    return grouped
  }, [accounts, accountGroupBy, accountOwnerMap])

  // grouped instruments: Map<groupLabel, {instruments, color?}>
  const groupedInstruments = useMemo(() => {
    const grouped = new Map<string, { items: Instrument[]; color?: string }>()
    for (const inst of instruments) {
      let key: string
      let color: string | undefined
      if (instrumentGroupBy === 'owner') { key = instrumentOwnerMap.get(inst.id) ?? 'Unassigned' }
      else if (instrumentGroupBy === 'category') {
        const cat = categories.find((c) => c.id === inst.asset_category)
        key = cat?.name ?? 'Uncategorised'; color = cat?.color
      } else if (instrumentGroupBy === 'type') { key = inst.instrument_type.replace(/_/g, ' ') }
      else { key = '__flat__' }
      if (!grouped.has(key)) grouped.set(key, { items: [], color })
      grouped.get(key)!.items.push(inst)
    }
    return grouped
  }, [instruments, instrumentGroupBy, instrumentOwnerMap, categories])

  const unownedAccounts = useMemo(
    () => accounts.filter(a => {
      const owners = accountOwnerships.filter(o => o.account === a.id)
      return owners.length === 0 && !a.primary_member
    }),
    [accounts, accountOwnerships]
  )

  const unownedInstruments = useMemo(
    () => instruments.filter(i => !instrumentOwnerships.some(o => o.instrument === i.id)),
    [instruments, instrumentOwnerships]
  )

  const manageView = () => (
    <div>
      {/* sub-tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-[var(--surface-2)] p-1">
        {(['accounts', 'instruments', 'categories'] as ManageTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setManageTab(t)}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition-colors ${
              manageTab === t ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {manageTab === 'accounts' && (
        <div className="grid grid-cols-1 min-w-0 gap-2">
          {!loading && unownedAccounts.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/15 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
              <span className="mt-0.5 text-lg">⚠️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {unownedAccounts.length} account{unownedAccounts.length > 1 ? 's' : ''} without an owner
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {unownedAccounts.map(a => a.name).join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAccountGroupBy('owner')}
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                View
              </button>
            </div>
          )}
          <GroupBySelector<AccountGroupBy>
            value={accountGroupBy}
            options={[
              { value: 'none', label: 'None' },
              { value: 'owner', label: 'Owner' },
              { value: 'type', label: 'Type' },
            ]}
            onChange={setAccountGroupBy}
          />
          {loading ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">No accounts yet.</p>
          ) : accountGroupBy === 'none' ? (
            accounts.map((a) => (
              <AccountCard key={a.id} account={a} onClick={canWrite ? () => setSheet({ type: 'account', item: a }) : undefined} />
            ))
          ) : (
            Array.from(groupedAccounts.entries()).map(([label, group]) => (
              <div key={label} className="grid grid-cols-1 min-w-0 gap-2">
                <GroupHeader label={label} />
                {group.map((a) => (
                  <AccountCard key={a.id} account={a} onClick={canWrite ? () => setSheet({ type: 'account', item: a }) : undefined} />
                ))}
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => setSheet({ type: 'account' })}
            disabled={!canWrite}
            className="mt-1 w-full rounded-xl border border-dashed border-[var(--border-2)] py-3 text-sm font-medium text-[var(--text-muted)] hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
          >
            + Add Account
          </button>
        </div>
      )}

      {manageTab === 'instruments' && (
        <div className="grid grid-cols-1 min-w-0 gap-2">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => { window.location.hash = '/instruments' }}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Manage all instruments →
            </button>
          </div>
          {!loading && unownedInstruments.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/15 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
              <span className="mt-0.5 text-lg">⚠️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {unownedInstruments.length} instrument{unownedInstruments.length > 1 ? 's' : ''} without an owner
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {unownedInstruments.map(i => i.name).join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInstrumentGroupBy('owner')}
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                View
              </button>
            </div>
          )}
          <GroupBySelector<InstrumentGroupBy>
            value={instrumentGroupBy}
            options={[
              { value: 'none', label: 'None' },
              { value: 'owner', label: 'Owner' },
              { value: 'category', label: 'Category' },
              { value: 'type', label: 'Type' },
            ]}
            onChange={setInstrumentGroupBy}
          />
          {loading ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">Loading…</p>
          ) : instruments.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">No instruments yet.</p>
          ) : instrumentGroupBy === 'none' ? (
            instruments.map((inst) => {
              const cat = categories.find((c) => c.id === inst.asset_category)
              return (
                <InstrumentRow key={inst.id} instrument={inst} category={cat} onClick={canWrite ? () => setSheet({ type: 'instrument', item: inst }) : undefined} />
              )
            })
          ) : (
            Array.from(groupedInstruments.entries()).map(([label, { items, color }]) => (
              <div key={label} className="grid grid-cols-1 min-w-0 gap-1">
                <GroupHeader label={label} color={color} />
                {items.map((inst) => {
                  const cat = categories.find((c) => c.id === inst.asset_category)
                  return (
                    <InstrumentRow key={inst.id} instrument={inst} category={cat} onClick={canWrite ? () => setSheet({ type: 'instrument', item: inst }) : undefined} />
                  )
                })}
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => setSheet({ type: 'instrument' })}
            disabled={!canWrite}
            className="mt-1 w-full rounded-xl border border-dashed border-[var(--border-2)] py-3 text-sm font-medium text-[var(--text-muted)] hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
          >
            + Add Instrument
          </button>
        </div>
      )}

      {manageTab === 'categories' && (
        <div className="grid gap-2">
          {categories.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">No categories yet.</p>
          ) : (
            categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: cat.color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text)]">{cat.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{cat.instrument_count} instrument{cat.instrument_count !== 1 ? 's' : ''}</p>
                </div>
                <button type="button" onClick={() => setSheet({ type: 'category', item: cat })} disabled={!canWrite} className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 disabled:opacity-50">Edit</button>
                <button type="button" onClick={() => deleteCategory(cat.id)} disabled={!canWrite} className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">Delete</button>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => setSheet({ type: 'category' })}
            disabled={!canWrite}
            className="mt-1 w-full rounded-xl border border-dashed border-[var(--border-2)] py-3 text-sm font-medium text-[var(--text-muted)] hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
          >
            + Add Category
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="grid gap-4">
      {/* main pill switcher */}
      <div className="flex gap-1 rounded-xl bg-[var(--surface-2)] p-1">
        {(['holdings', 'manage'] as MainTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMainTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors ${
              mainTab === t ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'
            }`}
          >
            {t === 'holdings' ? 'Holdings' : 'Manage'}
          </button>
        ))}
      </div>

      {mainTab === 'holdings' ? holdingsView() : manageView()}

      {/* sheets */}
      {sheet.type === 'account' && (
        <Sheet
          title={sheet.item ? 'Edit Account' : 'Add Account'}
          onClose={() => setSheet({ type: 'none' })}
        >
          <AccountForm
            householdId={householdId}
            account={sheet.item}
            onSave={afterSave}
            onCancel={() => setSheet({ type: 'none' })}
          />
        </Sheet>
      )}

      {sheet.type === 'instrument' && (
        <Sheet
          title={sheet.item ? 'Edit Instrument' : 'Add Instrument'}
          onClose={() => setSheet({ type: 'none' })}
        >
          <InstrumentForm
            householdId={householdId}
            instrument={sheet.item}
            categories={categories}
            onSave={afterSave}
            onCancel={() => setSheet({ type: 'none' })}
          />
        </Sheet>
      )}

      {sheet.type === 'category' && (
        <Sheet
          title={sheet.item ? 'Edit Category' : 'New Category'}
          onClose={() => setSheet({ type: 'none' })}
        >
          <AssetCategoryForm
            householdId={householdId}
            category={sheet.item}
            onSave={afterSave}
            onCancel={() => setSheet({ type: 'none' })}
          />
        </Sheet>
      )}

      {sheet.type === 'valuation' && (
        <Sheet title="Update Value" onClose={() => setSheet({ type: 'none' })}>
          <ValuationForm
            householdId={householdId}
            instrumentId={sheet.instrumentId}
            instrumentName={sheet.instrumentName}
            onSave={async () => { setSheet({ type: 'none' }); await refreshDashboard() }}
            onCancel={() => setSheet({ type: 'none' })}
          />
        </Sheet>
      )}

      {sheet.type === 'buy' && (
        <Sheet title={sheet.instrumentId ? 'Record Buy' : 'Add Holding'} onClose={() => setSheet({ type: 'none' })}>
          <BuyForm
            householdId={householdId}
            instrumentId={sheet.instrumentId}
            onSave={async () => { setSheet({ type: 'none' }); await refreshDashboard(); await loadData() }}
            onCancel={() => setSheet({ type: 'none' })}
          />
        </Sheet>
      )}

      {sheet.type === 'holding_detail' && (
        <HoldingDetailSheet
          householdId={householdId}
          holding={sheet.holding}
          instrument={sheet.instrument}
          members={members}
          onBuy={canWrite ? () => setSheet({ type: 'buy', instrumentId: sheet.instrument.id }) : undefined}
          onUpdateValue={canWrite ? () => setSheet({ type: 'valuation', instrumentId: sheet.instrument.id, instrumentName: sheet.instrument.name }) : undefined}
          onClose={() => setSheet({ type: 'none' })}
        />
      )}
    </div>
  )
}
