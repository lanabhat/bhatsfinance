import { useEffect, useState } from 'react'
import { aiInsightsApi } from '../../api/aiInsightsApi'
import { portfolioApi } from '../../api/portfolioApi'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { AiInsightCard } from '../common/AiInsightCard'
import type { ApiErrorMap, Instrument } from '../../types/domain'

function firstErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const map = err as ApiErrorMap
    for (const key of ['symbol', 'name', 'non_field_errors', 'detail']) {
      const val = map[key]
      if (Array.isArray(val) && val.length > 0) return val[0]
      if (typeof val === 'string') return val
    }
  }
  return fallback
}

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const INSTRUMENT_TYPES = ['equity','mutual_fund','fd','rd','bond','epf','ppf','nps','gold','real_estate','insurance','cash','other','vehicle','liability','sip'] as const
// A household has exactly one shared "Mutual Fund"/"SIP" shell Instrument
// (auto-created lazily server-side — see instruments/services.py's
// get_or_create_mf_shell) with each fund/folio living underneath it as an
// Investment, not as its own Instrument. So these types are hidden from
// "Add Instrument" — there is never a reason for a user to hand-create a
// second shell. Adding a new fund happens via "Record Buy" (HoldingsPage.tsx),
// and editing a fund's AMC/category/folio/expense-ratio happens via
// InvestmentForm.tsx. Still selectable when editing a pre-existing Instrument
// of this type (legacy data from before the shell/Investment migration).
const CREATE_HIDDEN_TYPES = new Set(['mutual_fund', 'sip'])
const SUB_CATEGORIES = ['', 'debt', 'equity', 'liquid', 'retirement', 'hybrid', 'gold', 'real_asset', 'other'] as const
const SUB_CATEGORY_LABELS: Record<string, string> = {
  '': '— Unclassified —', debt: 'Debt', equity: 'Equity', liquid: 'Liquid',
  retirement: 'Retirement', hybrid: 'Hybrid', gold: 'Gold', real_asset: 'Real Asset', other: 'Other',
}

const BUCKET_LABELS: Record<string, string> = { equity: 'Equity', debt: 'Debt', hybrid: 'Hybrid' }
const RULE_LABELS: Record<string, string> = { growth: 'Growth (60%)', stability: 'Stability (40%)' }

/** AI classification entry point — manual trigger only, cached result. */
export function FundClassificationCard({ instrumentId }: { instrumentId: number }) {
  const { canWrite } = useAuth()
  return (
    <AiInsightCard
      title="Classify with AI"
      canWrite={canWrite}
      emptyHint="Get an AI classification of this fund's equity/debt/hybrid bucket and 60-40 rule category."
      fetchCached={() => aiInsightsApi.getClassification(instrumentId)}
      generate={() => aiInsightsApi.classifyFund(instrumentId)}
    >
      {(c) => (
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--text)]">
            {BUCKET_LABELS[c.bucket] ?? c.bucket} · {RULE_LABELS[c.rule_60_40_category] ?? c.rule_60_40_category}
          </p>
          <p className="text-xs text-[var(--text-muted)]">{c.reasoning}</p>
        </div>
      )}
    </AiInsightCard>
  )
}

/**
 * Defines what an instrument IS (name/type/category/account/owner) — nothing
 * about a specific purchase. FD/Bond principal, rate, and maturity date are
 * per-investment details entered via "Record Buy" (HoldingsPage.tsx's
 * BuyForm), since one instrument (e.g. "HDFC Bank FD") can hold several
 * distinct deposits with different rates/maturities.
 */
export function InstrumentForm({ householdId, instrument, onSave, onCancel, onDelete }: {
  householdId: number; instrument?: Instrument
  onSave: () => void; onCancel: () => void; onDelete?: () => void
}) {
  const { categories, accounts, members } = useApp()
  const [form, setForm] = useState<Omit<Instrument, 'id'>>({
    household: householdId,
    name: instrument?.name ?? '',
    instrument_type: instrument?.instrument_type ?? 'equity',
    sub_category: instrument?.sub_category ?? '',
    symbol: instrument?.symbol ?? '',
    default_account: instrument?.default_account ?? null,
    asset_category: instrument?.asset_category ?? null,
    metadata: instrument?.metadata ?? {},
    is_active: instrument?.is_active ?? true,
    include_in_rebalancing: instrument?.include_in_rebalancing ?? true,
  })
  const [ownerId, setOwnerId] = useState<string>('')
  const [existingOwnershipId, setExistingOwnershipId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!instrument) return
    portfolioApi.listInstrumentOwnerships(instrument.id).then((owns) => {
      if (owns.length > 0) {
        setOwnerId(String(owns[0].member))
        setExistingOwnershipId(owns[0].id)
      }
    }).catch(() => {})
  }, [instrument])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const saved = instrument
        ? await portfolioApi.updateInstrument(instrument.id, form)
        : await portfolioApi.createInstrument(form)

      if (ownerId) {
        if (existingOwnershipId) {
          await portfolioApi.updateInstrumentOwnership(existingOwnershipId, { member: Number(ownerId) })
        } else {
          await portfolioApi.createInstrumentOwnership({ instrument: saved.id, member: Number(ownerId), allocation_percent: '100.00' })
        }
      } else if (existingOwnershipId) {
        await portfolioApi.deleteInstrumentOwnership(existingOwnershipId)
      }

      onSave()
    } catch (e) {
      setError(firstErrorMessage(e, 'Failed to save instrument'))
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Name</label>
        <input className={INP} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Type</label>
        <select className={INP} value={form.instrument_type} onChange={(e) => setForm((p) => ({ ...p, instrument_type: e.target.value as Instrument['instrument_type'] }))}>
          {INSTRUMENT_TYPES.filter((t) => !CREATE_HIDDEN_TYPES.has(t) || instrument?.instrument_type === t).map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Sub-category</label>
        <select className={INP} value={form.sub_category} onChange={(e) => setForm((p) => ({ ...p, sub_category: e.target.value as Instrument['sub_category'] }))}>
          {SUB_CATEGORIES.map((s) => <option key={s} value={s}>{SUB_CATEGORY_LABELS[s]}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">Cross-cutting risk/liquidity grouping (e.g. group FDs + EPF + debt funds together as "Debt").</p>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Category</label>
        <select className={INP} value={form.asset_category ?? ''} onChange={(e) => setForm((p) => ({ ...p, asset_category: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">— None —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Linked Account</label>
        <select className={INP} value={form.default_account ?? ''} onChange={(e) => setForm((p) => ({ ...p, default_account: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">— None —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">The bank/demat account SIP debits come from. Used to filter instruments when approving SMS.</p>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Owner</label>
        <select className={INP} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">— Unassigned —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">Which household member owns this holding — drives per-member net worth.</p>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Symbol / Ticker</label>
        <input className={INP} value={form.symbol ?? ''} onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))} />
      </div>
      <label className="flex items-center gap-2 py-1">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
        <span className="text-sm text-[var(--text-2)]">Active</span>
      </label>
      {(form.instrument_type === 'mutual_fund' || form.instrument_type === 'sip') && (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
          AMC, category, folio number, and expense ratio are edited per-fund from the Holdings
          page — this shell instrument holds every mutual fund/SIP in the household as separate
          funds underneath it.
        </p>
      )}
      {(form.instrument_type === 'fd' || form.instrument_type === 'bond') && (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
          Principal, rate, and maturity date are entered per-deposit via <strong>Record Buy</strong> on the
          Investments page — one instrument can hold several {form.instrument_type === 'fd' ? 'FD deposits' : 'bond investments'}.
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : instrument ? 'Update' : 'Add Instrument'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
      </div>
      {instrument && onDelete && (
        <div className="border-t border-[var(--border)] pt-3">
          <button type="button" onClick={onDelete} className="w-full rounded-lg border border-red-200 py-2 text-sm text-red-500 hover:bg-red-50 dark:bg-red-900/15">
            Delete Instrument…
          </button>
        </div>
      )}
    </form>
  )
}
