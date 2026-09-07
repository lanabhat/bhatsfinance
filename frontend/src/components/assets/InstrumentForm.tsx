import { useEffect, useState } from 'react'
import { aiInsightsApi } from '../../api/aiInsightsApi'
import { portfolioApi } from '../../api/portfolioApi'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { AiInsightCard } from '../common/AiInsightCard'
import type { ApiErrorMap, BondDetails, FDDetails, Instrument } from '../../types/domain'

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
const COMPOUNDING_OPTIONS = ['simple', 'monthly', 'quarterly', 'half_yearly', 'annually'] as const
const COUPON_FREQUENCY_OPTIONS = ['monthly', 'quarterly', 'half_yearly', 'annual', 'cumulative'] as const
const BOND_TYPE_OPTIONS = ['government', 'corporate', 'tax_free', 'sgb', 'ncd', 'other'] as const

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

type MfForm = { amc: string; fund_category: string; fund_sub_category: string; folio_no: string; expense_ratio: string | null }
const EMPTY_MF_FORM: MfForm = { amc: '', fund_category: '', fund_sub_category: '', folio_no: '', expense_ratio: null }

type BondForm = {
  issuer_name: string
  bond_type: BondDetails['bond_type']
  isin: string
  face_value: string
  quantity: string
  coupon_rate: string
  coupon_frequency: BondDetails['coupon_frequency']
  investment_date: string
  maturity_date: string
  first_coupon_date: string
  grace_days: string
  maturity_value: string
  credit_rating: string
  notes: string
}

const EMPTY_BOND_FORM: BondForm = {
  issuer_name: '', bond_type: 'other', isin: '', face_value: '', quantity: '1',
  coupon_rate: '', coupon_frequency: 'annual', investment_date: '', maturity_date: '',
  first_coupon_date: '', grace_days: '15', maturity_value: '', credit_rating: '', notes: '',
}

const BUCKET_LABELS: Record<string, string> = { equity: 'Equity', debt: 'Debt', hybrid: 'Hybrid' }
const RULE_LABELS: Record<string, string> = { growth: 'Growth (60%)', stability: 'Stability (40%)' }

/** AI classification entry point — manual trigger only, cached result. */
function FundClassificationCard({ instrumentId }: { instrumentId: number }) {
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
    include_in_rebalancing: instrument?.include_in_rebalancing ?? true,
  })
  const [ownerId, setOwnerId] = useState<string>('')
  const [existingOwnershipId, setExistingOwnershipId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fdForm, setFdForm] = useState<FDForm>(EMPTY_FD_FORM)
  const [existingFDDetailsId, setExistingFDDetailsId] = useState<number | null>(null)
  const [fdLoaded, setFdLoaded] = useState(!instrument)
  const [mfForm, setMfForm] = useState<MfForm>(EMPTY_MF_FORM)
  const [existingMfDetailsId, setExistingMfDetailsId] = useState<number | null>(null)
  const [bondForm, setBondForm] = useState<BondForm>(EMPTY_BOND_FORM)
  const [existingBondDetailsId, setExistingBondDetailsId] = useState<number | null>(null)
  const [bondLoaded, setBondLoaded] = useState(!instrument)

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
    const isMutualFund = instrument?.instrument_type === 'mutual_fund' || instrument?.instrument_type === 'sip'
    if (!instrument || !isMutualFund) return
    portfolioApi.getMutualFundDetails(instrument.id).then((d) => {
      if (!d) return
      setExistingMfDetailsId(d.id)
      setMfForm({ amc: d.amc, fund_category: d.fund_category, fund_sub_category: d.fund_sub_category, folio_no: d.folio_no, expense_ratio: d.expense_ratio })
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

  useEffect(() => {
    if (!instrument || instrument.instrument_type !== 'bond') { setBondLoaded(true); return }
    portfolioApi.getBondDetails(instrument.id).then((details) => {
      if (details) {
        setExistingBondDetailsId(details.id)
        setBondForm({
          issuer_name: details.issuer_name,
          bond_type: details.bond_type,
          isin: details.isin,
          face_value: details.face_value,
          quantity: String(details.quantity),
          coupon_rate: details.coupon_rate,
          coupon_frequency: details.coupon_frequency,
          investment_date: details.investment_date,
          maturity_date: details.maturity_date,
          first_coupon_date: details.first_coupon_date ?? '',
          grace_days: String(details.grace_days),
          maturity_value: details.maturity_value ?? '',
          credit_rating: details.credit_rating,
          notes: details.notes,
        })
      }
    }).finally(() => setBondLoaded(true))
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

      const isMutualFund = form.instrument_type === 'mutual_fund' || form.instrument_type === 'sip'
      if (isMutualFund && (mfForm.amc || mfForm.fund_category || mfForm.fund_sub_category || mfForm.folio_no || mfForm.expense_ratio)) {
        if (existingMfDetailsId) {
          await portfolioApi.updateMutualFundDetails(existingMfDetailsId, mfForm)
        } else {
          await portfolioApi.createMutualFundDetails({ instrument: saved.id, ...mfForm })
        }
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

      if (form.instrument_type === 'bond' && bondForm.face_value && bondForm.coupon_rate && bondForm.investment_date && bondForm.maturity_date) {
        const payload = {
          instrument: saved.id,
          issuer_name: bondForm.issuer_name,
          bond_type: bondForm.bond_type,
          isin: bondForm.isin,
          face_value: bondForm.face_value,
          quantity: Number(bondForm.quantity || '1'),
          coupon_rate: bondForm.coupon_rate,
          coupon_frequency: bondForm.coupon_frequency,
          investment_date: bondForm.investment_date,
          maturity_date: bondForm.maturity_date,
          first_coupon_date: bondForm.first_coupon_date || null,
          grace_days: Number(bondForm.grace_days || '15'),
          maturity_value: bondForm.maturity_value || null,
          credit_rating: bondForm.credit_rating,
          notes: bondForm.notes,
        }
        if (existingBondDetailsId) {
          await portfolioApi.updateBondDetails(existingBondDetailsId, payload)
        } else {
          await portfolioApi.createBondDetails(payload)
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
      {(form.instrument_type === 'mutual_fund' || form.instrument_type === 'sip') && (
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
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Folio Number</label>
            <input className={INP} value={mfForm.folio_no} onChange={(e) => setMfForm((p) => ({ ...p, folio_no: e.target.value }))} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Expense Ratio (%)</label>
            <input className={INP} type="number" step="0.001" placeholder="e.g. 0.45" value={mfForm.expense_ratio ?? ''} onChange={(e) => setMfForm((p) => ({ ...p, expense_ratio: e.target.value || null }))} /></div>
          {instrument && <FundClassificationCard instrumentId={instrument.id} />}
        </div>
      )}
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
      {form.instrument_type === 'bond' && (
        <div className="grid gap-3 rounded-xl border border-teal-100 bg-teal-50/60 p-3">
          <p className="text-xs font-medium text-teal-700 dark:text-teal-300">Bond Details</p>
          {!bondLoaded ? (
            <p className="text-xs text-[var(--text-muted)]">Loading…</p>
          ) : (
            <>
              <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Issuer Name</label>
                <input className={INP} value={bondForm.issuer_name} onChange={(e) => setBondForm((p) => ({ ...p, issuer_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Bond Type</label>
                  <select className={INP} value={bondForm.bond_type} onChange={(e) => setBondForm((p) => ({ ...p, bond_type: e.target.value as BondForm['bond_type'] }))}>
                    {BOND_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select></div>
                <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">ISIN</label>
                  <input className={INP} value={bondForm.isin} onChange={(e) => setBondForm((p) => ({ ...p, isin: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Face Value (₹, per unit)</label>
                  <input type="number" className={INP} value={bondForm.face_value} onChange={(e) => setBondForm((p) => ({ ...p, face_value: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Quantity</label>
                  <input type="number" className={INP} value={bondForm.quantity} onChange={(e) => setBondForm((p) => ({ ...p, quantity: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Coupon Rate (% p.a.)</label>
                  <input type="number" step="0.01" className={INP} value={bondForm.coupon_rate} onChange={(e) => setBondForm((p) => ({ ...p, coupon_rate: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Coupon Frequency</label>
                  <select className={INP} value={bondForm.coupon_frequency} onChange={(e) => setBondForm((p) => ({ ...p, coupon_frequency: e.target.value as BondForm['coupon_frequency'] }))}>
                    {COUPON_FREQUENCY_OPTIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Investment Date</label>
                  <input type="date" className={INP} value={bondForm.investment_date} onChange={(e) => setBondForm((p) => ({ ...p, investment_date: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Maturity Date</label>
                  <input type="date" className={INP} value={bondForm.maturity_date} onChange={(e) => setBondForm((p) => ({ ...p, maturity_date: e.target.value }))} /></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">First Coupon Date (optional)</label>
                <input type="date" className={INP} value={bondForm.first_coupon_date} onChange={(e) => setBondForm((p) => ({ ...p, first_coupon_date: e.target.value }))} />
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">Leave blank to assume one coupon period after the investment date.</p></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Grace Days</label>
                  <input type="number" className={INP} value={bondForm.grace_days} onChange={(e) => setBondForm((p) => ({ ...p, grace_days: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Credit Rating</label>
                  <input className={INP} placeholder="e.g. AAA" value={bondForm.credit_rating} onChange={(e) => setBondForm((p) => ({ ...p, credit_rating: e.target.value }))} /></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Maturity Value (₹, optional — issuer-stated if known)</label>
                <input type="number" className={INP} value={bondForm.maturity_value} onChange={(e) => setBondForm((p) => ({ ...p, maturity_value: e.target.value }))} /></div>
              <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Notes</label>
                <input className={INP} value={bondForm.notes} onChange={(e) => setBondForm((p) => ({ ...p, notes: e.target.value }))} /></div>
              <p className="text-[11px] text-[var(--text-muted)]">Fill in face value, coupon rate, and both dates to save/update the bond's schedule.</p>
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
