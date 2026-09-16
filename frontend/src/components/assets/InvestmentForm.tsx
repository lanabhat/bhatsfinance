import { useEffect, useState } from 'react'
import { investmentApi } from '../../api/investmentApi'
import { portfolioApi } from '../../api/portfolioApi'
import { useApp } from '../../context/AppContext'
import { FundClassificationCard } from './InstrumentForm'
import type { ApiErrorMap, Investment } from '../../types/domain'

function firstErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const map = err as ApiErrorMap
    for (const key of ['name', 'folio_no', 'non_field_errors', 'detail']) {
      const val = map[key]
      if (Array.isArray(val) && val.length > 0) return val[0]
      if (typeof val === 'string') return val
    }
  }
  return fallback
}

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

type MfForm = { amc: string; fund_category: string; fund_sub_category: string; expense_ratio: string | null }
const EMPTY_MF_FORM: MfForm = { amc: '', fund_category: '', fund_sub_category: '', expense_ratio: null }

/**
 * Edits one mutual fund/SIP holding — an Investment (name/symbol/isin/
 * folio_no/owner) plus its MutualFundDetails (AMC/category/expense ratio).
 * Unlike InstrumentForm, this is edit-only: new funds are created via
 * "Record Buy" on the Holdings page (investmentApi.getOrCreateMfInvestment),
 * matching how FD/Bond details are also only ever created via BuyForm.
 */
export function InvestmentForm({ investment, onSave, onCancel }: {
  investment: Investment
  onSave: () => void
  onCancel: () => void
}) {
  const { members } = useApp()
  const [form, setForm] = useState<Omit<Investment, 'id'>>({
    instrument: investment.instrument,
    member: investment.member,
    name: investment.name,
    symbol: investment.symbol,
    isin: investment.isin,
    folio_no: investment.folio_no,
    is_active: investment.is_active,
  })
  const [mfForm, setMfForm] = useState<MfForm>(EMPTY_MF_FORM)
  const [existingMfDetailsId, setExistingMfDetailsId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    portfolioApi.getMutualFundDetails(investment.id).then((d) => {
      if (!d) return
      setExistingMfDetailsId(d.id)
      setMfForm({ amc: d.amc, fund_category: d.fund_category, fund_sub_category: d.fund_sub_category, expense_ratio: d.expense_ratio })
    }).catch(() => {})
  }, [investment.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await investmentApi.updateInvestment(investment.id, form)

      if (mfForm.amc || mfForm.fund_category || mfForm.fund_sub_category || mfForm.expense_ratio) {
        if (existingMfDetailsId) {
          await portfolioApi.updateMutualFundDetails(existingMfDetailsId, mfForm)
        } else {
          await portfolioApi.createMutualFundDetails({ investment: investment.id, ...mfForm })
        }
      }

      onSave()
    } catch (e) {
      setError(firstErrorMessage(e, 'Failed to save fund'))
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Fund / Scheme Name</label>
        <input className={INP} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Folio Number</label>
        <input className={INP} value={form.folio_no} onChange={(e) => setForm((p) => ({ ...p, folio_no: e.target.value }))} /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Symbol / AMFI Code</label>
        <input className={INP} value={form.symbol} onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))} /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">ISIN</label>
        <input className={INP} value={form.isin} onChange={(e) => setForm((p) => ({ ...p, isin: e.target.value }))} /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Owner</label>
        <select className={INP} value={form.member ?? ''} onChange={(e) => setForm((p) => ({ ...p, member: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">— Unassigned —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">Which household member owns this fund — drives per-member net worth.</p>
      </div>
      <label className="flex items-center gap-2 py-1">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
        <span className="text-sm text-[var(--text-2)]">Active</span>
      </label>

      <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <p className="text-xs font-medium text-[var(--text-2)]">Mutual Fund Details</p>
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">AMC</label>
          <input className={INP} value={mfForm.amc} onChange={(e) => setMfForm((p) => ({ ...p, amc: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Fund Category</label>
            <input className={INP} placeholder="e.g. Equity" value={mfForm.fund_category} onChange={(e) => setMfForm((p) => ({ ...p, fund_category: e.target.value }))} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Sub-category</label>
            <input className={INP} placeholder="e.g. Large Cap" value={mfForm.fund_sub_category} onChange={(e) => setMfForm((p) => ({ ...p, fund_sub_category: e.target.value }))} /></div>
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">Sub-category drives which benchmark index (Nifty 50 / Midcap 150 / Smallcap 250 / 500) this fund is compared against.</p>
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Expense Ratio (%)</label>
          <input className={INP} type="number" step="0.001" placeholder="e.g. 0.45" value={mfForm.expense_ratio ?? ''} onChange={(e) => setMfForm((p) => ({ ...p, expense_ratio: e.target.value || null }))} /></div>
        <FundClassificationCard instrumentId={investment.instrument} />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Update'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
      </div>
    </form>
  )
}
