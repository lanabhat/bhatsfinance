import { useEffect, useState } from 'react'
import { portfolioApi } from '../../api/portfolioApi'
import { useApp } from '../../context/AppContext'
import type { ApiErrorMap, FDDetails, Instrument } from '../../types/domain'

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
const INSTRUMENT_TYPES = ['equity','mutual_fund','fd','rd','epf','ppf','nps','gold','real_estate','insurance','cash','other','vehicle','liability','sip'] as const
const COMPOUNDING_OPTIONS = ['simple', 'monthly', 'quarterly', 'half_yearly', 'annually'] as const

type FDForm = {
  principal: string
  annual_rate: string
  investment_date: string
  maturity_date: string
  compounding: FDDetails['compounding']
  maturity_value: string
}

const EMPTY_FD_FORM: FDForm = {
  principal: '', annual_rate: '', investment_date: '', maturity_date: '', compounding: 'quarterly', maturity_value: '',
}

export function InstrumentForm({ householdId, instrument, onSave, onCancel, onDelete }: {
  householdId: number; instrument?: Instrument
  onSave: () => void; onCancel: () => void; onDelete?: () => void
}) {
  const { categories, accounts, members } = useApp()
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
  const [ownerId, setOwnerId] = useState<string>('')
  const [existingOwnershipId, setExistingOwnershipId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fdForm, setFdForm] = useState<FDForm>(EMPTY_FD_FORM)
  const [existingFDDetailsId, setExistingFDDetailsId] = useState<number | null>(null)
  const [fdLoaded, setFdLoaded] = useState(!instrument)

  useEffect(() => {
    if (!instrument) return
    portfolioApi.listInstrumentOwnerships(instrument.id).then((owns) => {
      if (owns.length > 0) {
        setOwnerId(String(owns[0].member))
        setExistingOwnershipId(owns[0].id)
      }
    }).catch(() => {})
  }, [instrument])

  useEffect(() => {
    if (!instrument || instrument.instrument_type !== 'fd') { setFdLoaded(true); return }
    portfolioApi.getFDDetails(instrument.id).then((details) => {
      if (details) {
        setExistingFDDetailsId(details.id)
        setFdForm({
          principal: details.principal,
          annual_rate: details.annual_rate,
          investment_date: details.investment_date,
          maturity_date: details.maturity_date,
          compounding: details.compounding,
          maturity_value: details.maturity_value ?? '',
        })
      }
    }).finally(() => setFdLoaded(true))
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

      if (form.instrument_type === 'fd' && fdForm.principal && fdForm.annual_rate && fdForm.investment_date && fdForm.maturity_date) {
        const payload = {
          instrument: saved.id,
          principal: fdForm.principal,
          annual_rate: fdForm.annual_rate,
          investment_date: fdForm.investment_date,
          maturity_date: fdForm.maturity_date,
          compounding: fdForm.compounding,
          maturity_value: fdForm.maturity_value || null,
        }
        if (existingFDDetailsId) {
          await portfolioApi.updateFDDetails(existingFDDetailsId, payload)
        } else {
          await portfolioApi.createFDDetails(payload)
        }
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
          {INSTRUMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select></div>
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
        {form.instrument_type === 'fd' && (
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">For FDs, this is the bank account number — used to detect duplicate FDs.</p>
        )}
      </div>
      <label className="flex items-center gap-2 py-1">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
        <span className="text-sm text-[var(--text-2)]">Active</span>
      </label>
      {form.instrument_type === 'fd' && (
        <div className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Fixed Deposit Details</p>
          {!fdLoaded ? (
            <p className="text-xs text-[var(--text-muted)]">Loading…</p>
          ) : (
            <>
              <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Principal (₹)</label>
                <input type="number" className={INP} value={fdForm.principal} onChange={(e) => setFdForm((p) => ({ ...p, principal: e.target.value }))} /></div>
              <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Annual Rate (%)</label>
                <input type="number" step="0.01" className={INP} value={fdForm.annual_rate} onChange={(e) => setFdForm((p) => ({ ...p, annual_rate: e.target.value }))} /></div>
              <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Investment Date</label>
                <input type="date" className={INP} value={fdForm.investment_date} onChange={(e) => setFdForm((p) => ({ ...p, investment_date: e.target.value }))} /></div>
              <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Maturity Date</label>
                <input type="date" className={INP} value={fdForm.maturity_date} onChange={(e) => setFdForm((p) => ({ ...p, maturity_date: e.target.value }))} /></div>
              <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Compounding</label>
                <select className={INP} value={fdForm.compounding} onChange={(e) => setFdForm((p) => ({ ...p, compounding: e.target.value as FDForm['compounding'] }))}>
                  {COMPOUNDING_OPTIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select></div>
              <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Maturity Value (₹, optional — bank-stated if known)</label>
                <input type="number" className={INP} value={fdForm.maturity_value} onChange={(e) => setFdForm((p) => ({ ...p, maturity_value: e.target.value }))} /></div>
              <p className="text-[11px] text-[var(--text-muted)]">Fill in principal, rate, and both dates to save/update the FD's maturity details.</p>
            </>
          )}
        </div>
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
