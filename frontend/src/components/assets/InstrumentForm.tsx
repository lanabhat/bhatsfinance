import { useState } from 'react'
import { portfolioApi } from '../../api/portfolioApi'
import { useApp } from '../../context/AppContext'
import type { Instrument } from '../../types/domain'

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const INSTRUMENT_TYPES = ['equity','mutual_fund','fd','rd','epf','ppf','nps','gold','real_estate','insurance','cash','other','vehicle','liability','sip'] as const

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

export function InstrumentForm({ householdId, instrument, onSave, onCancel, onDelete }: {
  householdId: number; instrument?: Instrument
  onSave: () => void; onCancel: () => void; onDelete?: () => void
}) {
  const { categories, accounts } = useApp()
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
  const investmentStartDate = metadataString(form.metadata, 'investment_start_date')
  const maturityDate = metadataString(form.metadata, 'maturity_date')

  const setMetadataValue = (key: string, value: string) => {
    setForm((current) => {
      const nextMetadata = { ...current.metadata }
      if (value) nextMetadata[key] = value
      else delete nextMetadata[key]
      return { ...current, metadata: nextMetadata }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      if (instrument) await portfolioApi.updateInstrument(instrument.id, form)
      else await portfolioApi.createInstrument(form)
      onSave()
    } catch { setError('Failed to save instrument') } finally { setSaving(false) }
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
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Symbol / Ticker</label>
        <input className={INP} value={form.symbol ?? ''} onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))} /></div>
      {form.instrument_type === 'fd' && (
        <div className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Fixed Deposit Details</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Investment Start Date (Optional)</label>
            <input type="date" className={INP} value={investmentStartDate} onChange={(e) => setMetadataValue('investment_start_date', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Maturity Date (Optional)</label>
            <input type="date" className={INP} value={maturityDate} onChange={(e) => setMetadataValue('maturity_date', e.target.value)} />
          </div>
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
