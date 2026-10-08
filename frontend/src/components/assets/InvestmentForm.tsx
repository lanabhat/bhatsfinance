import { useEffect, useState } from 'react'
import { investmentApi } from '../../api/investmentApi'
import { portfolioApi } from '../../api/portfolioApi'
import { useApp } from '../../context/AppContext'
import { FundClassificationCard } from './InstrumentForm'
import { isEquityInvestment, isEtfInvestment } from './investmentKind'
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

const CAP_BY_CATEGORY_NAME: Record<string, Investment['market_cap']> = { 'large cap': 'large_cap', 'mid cap': 'mid_cap', 'small cap': 'small_cap' }

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

type MfForm = { amc: string; fund_category: string; fund_sub_category: string; expense_ratio: string | null }
const EMPTY_MF_FORM: MfForm = { amc: '', fund_category: '', fund_sub_category: '', expense_ratio: null }

/**
 * Edits one holding under a shared shell — an Investment (name/symbol/isin/
 * owner). For a mutual fund/SIP it also edits the folio and MutualFundDetails
 * (AMC/category/expense ratio); a stock or ETF ("Equity"/"ETF" shells) has neither.
 * Unlike InstrumentForm, this is edit-only: new funds are created via
 * "Record Buy" on the Holdings page (investmentApi.getOrCreateMfInvestment),
 * matching how FD/Bond details are also only ever created via BuyForm.
 */
export function InvestmentForm({ investment, onSave, onCancel }: {
  investment: Investment
  onSave: () => void
  onCancel: () => void
}) {
  const { members, instrumentsFull, categories } = useApp()
  const isStock = isEquityInvestment(investment, instrumentsFull)
  const isEtf = isEtfInvestment(investment, instrumentsFull)
  const typeLabel = isEtf ? 'ETF' : isStock ? 'Stock' : 'Mutual Fund'
  const [form, setForm] = useState<Omit<Investment, 'id'>>({
    instrument: investment.instrument,
    member: investment.member,
    name: investment.name,
    symbol: investment.symbol,
    isin: investment.isin,
    folio_no: investment.folio_no,
    market_cap: investment.market_cap ?? '',
    market_cap_auto: investment.market_cap_auto ?? true,
    asset_category: investment.asset_category ?? null,
    category_auto: investment.category_auto ?? true,
    is_active: investment.is_active,
  })
  // What "Auto" currently resolves to: the holding's own category if one was assigned automatically.
  const autoCategoryName = investment.category_auto !== false && investment.asset_category
    ? categories.find((c) => c.id === investment.asset_category)?.name : undefined
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

      if (!isStock && (mfForm.amc || mfForm.fund_category || mfForm.fund_sub_category || mfForm.expense_ratio)) {
        if (existingMfDetailsId) {
          await portfolioApi.updateMutualFundDetails(existingMfDetailsId, mfForm)
        } else {
          await portfolioApi.createMutualFundDetails({ investment: investment.id, ...mfForm })
        }
      }

      onSave()
    } catch (e) {
      setError(firstErrorMessage(e, isStock ? 'Failed to save stock' : 'Failed to save fund'))
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">{isStock ? 'Company / Stock Name' : 'Fund / Scheme Name'}</label>
        <input className={INP} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
      {!isStock && (
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Folio Number</label>
          <input className={INP} value={form.folio_no} onChange={(e) => setForm((p) => ({ ...p, folio_no: e.target.value }))} /></div>
      )}
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">{isStock ? 'Symbol / Ticker' : 'Symbol / AMFI Code'}</label>
        <input className={INP} value={form.symbol} onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))} /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">ISIN</label>
        <input className={INP} value={form.isin} onChange={(e) => setForm((p) => ({ ...p, isin: e.target.value }))} /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Type</label>
        <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-2)]">{typeLabel}</p></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Category</label>
        <select className={INP}
          value={form.category_auto ? 'auto' : String(form.asset_category ?? '')}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'auto') {
              setForm((p) => ({ ...p, category_auto: true, market_cap_auto: true }))
              return
            }
            const id = v ? Number(v) : null
            // Picking a cap category on a stock also fixes its market cap, so the cap split agrees.
            const cap = isStock ? CAP_BY_CATEGORY_NAME[categories.find((c) => c.id === id)?.name.toLowerCase() ?? ''] : undefined
            setForm((p) => ({
              ...p, asset_category: id, category_auto: false,
              ...(cap ? { market_cap: cap, market_cap_auto: false } : {}),
            }))
          }}>
          <option value="auto">Auto{autoCategoryName ? ` (${autoCategoryName})` : ''}</option>
          <option value="">— Group default ({isEtf ? 'ETF' : isStock ? 'Equity' : 'Mutual Fund'} group) —</option>
          {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {isEtf
            ? 'Auto puts every ETF in the ETF category. Its market cap and asset class (equity, debt, gold) come from the index it tracks.'
            : isStock
            ? "Auto puts the stock in Large / Mid / Small Cap by NSE's Nifty 100 / Midcap 150 lists (SEBI bands), refreshed daily."
            : 'Auto puts large, mid and small cap funds in those categories; other funds stay in their group (e.g. Mutual Fund).'}
        </p>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Owner</label>
        <select className={INP} value={form.member ?? ''} onChange={(e) => setForm((p) => ({ ...p, member: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">— Unassigned —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">Which household member owns this {isStock ? 'stock' : 'fund'} — drives per-member net worth.</p>
      </div>
      <label className="flex items-center gap-2 py-1">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
        <span className="text-sm text-[var(--text-2)]">Active</span>
      </label>

      {!isStock && <div className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
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
      </div>}

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
