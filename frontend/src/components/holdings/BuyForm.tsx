import { useEffect, useMemo, useState } from 'react'
import { investmentApi } from '../../api/investmentApi'
import { ledgerApi } from '../../api/ledgerApi'
import { portfolioApi } from '../../api/portfolioApi'
import { SearchableSelect } from '../ui/SearchableSelect'
import { Sheet } from '../ui/Sheet'
import { InstrumentForm } from '../assets/InstrumentForm'
import { InvestmentForm } from '../assets/InvestmentForm'
import { useApp } from '../../context/AppContext'
import { TYPE_ICONS, TYPE_LABELS } from '../../lib/instrumentTypes'
import type { Account, BondDetails, FDDetails, Instrument, Investment } from '../../types/domain'

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

const MF_TYPES = new Set(['mutual_fund', 'sip'])

const INSTRUMENT_TYPES_OPTS = ['equity','mutual_fund','fd','rd','bond','epf','ppf','nps','gold','real_estate','insurance','lending','cash','other','vehicle','liability','sip'] as const
const COMPOUNDING_OPTIONS = ['simple', 'monthly', 'quarterly', 'half_yearly', 'annually'] as const
const COUPON_FREQUENCY_OPTIONS = ['monthly', 'quarterly', 'half_yearly', 'annual', 'cumulative'] as const
const BOND_TYPE_OPTIONS = ['government', 'corporate', 'tax_free', 'sgb', 'ncd', 'other'] as const

type FDFields = {
  account_number: string
  annual_rate: string
  maturity_date: string
  compounding: FDDetails['compounding']
  maturity_value: string
}
const EMPTY_FD_FIELDS: FDFields = { account_number: '', annual_rate: '', maturity_date: '', compounding: 'quarterly', maturity_value: '' }

type BondFields = {
  issuer_name: string
  bond_type: BondDetails['bond_type']
  isin: string
  coupon_rate: string
  coupon_frequency: BondDetails['coupon_frequency']
  maturity_date: string
  first_coupon_date: string
  grace_days: string
  maturity_value: string
  credit_rating: string
  notes: string
}
const EMPTY_BOND_FIELDS: BondFields = {
  issuer_name: '', bond_type: 'other', isin: '', coupon_rate: '', coupon_frequency: 'annual',
  maturity_date: '', first_coupon_date: '', grace_days: '15', maturity_value: '', credit_rating: '', notes: '',
}

/**
 * "Record Buy" — recording one investment. For FD/Bond instrument types this
 * IS the FD/Bond details form too (principal = amount, plus rate/maturity):
 * one submission creates the Transaction and the linked FDDetails/BondDetails
 * row in one step, instead of asking for principal/rate here and again on a
 * separate "Add Instrument" screen. One instrument can hold several of these
 * (e.g. two FD deposits under one "HDFC Bank FD" instrument).
 *
 * Mutual fund/SIP and equity holdings work differently: every fund/folio (or
 * per-member stock) in the household is an Investment under one shared
 * shell Instrument ("Mutual Fund" or "Equity" — see instruments/services.py's
 * get_or_create_mf_shell/get_or_create_equity_shell), not its own Instrument
 * — so picking/creating "the instrument" for a MF/SIP/equity buy really
 * means picking/creating the Investment, via investmentApi. Equity has no
 * natural folio to disambiguate, so a new equity Investment is scoped by
 * member instead (two members can hold the same stock name without
 * colliding — see instruments/models.py's Investment.unique_together).
 *
 * Used both as the body of a Sheet popup ("+ Buy More" on an existing
 * holding, where instrumentId/investmentId are pinned) and as the body of
 * the full-page AddHoldingPage ("+ Add Holding", nothing pinned) — the
 * `scroll` prop switches between the popup's capped-height scroll container
 * and the page's natural flow.
 */
export function BuyForm({ householdId, instrumentId: initId, investmentId: initInvestmentId, scroll = true, onSave, onCancel }: {
  householdId: number; instrumentId?: number; investmentId?: number; scroll?: boolean; onSave: () => void; onCancel: () => void
}) {
  const { members, categories, instrumentsFull } = useApp()
  // The single shared "Equity" shell Instrument (if it exists yet — older
  // households may still only have legacy per-stock Instruments, which stay
  // directly pickable) is never picked directly, same as the MF shell —
  // its holdings are picked via the investments list instead.
  const equityShell = useMemo(() => instrumentsFull.find((i) => i.instrument_type === 'equity' && i.label === 'Equity') ?? null, [instrumentsFull])
  const instruments = useMemo(
    () => instrumentsFull.filter((i) => !MF_TYPES.has(i.instrument_type) && i.id !== equityShell?.id),
    [instrumentsFull, equityShell],
  )
  const [investments, setInvestments] = useState<Investment[]>([])
  // Full Instrument records (category/sub-category/symbol/etc.) for the
  // selected-item details panel + edit sheet — instrumentsFull (context) is
  // a lighter OptionItem shape that doesn't carry these. Fetched once,
  // lazily, only when a details/edit view actually needs it.
  const [fullInstruments, setFullInstruments] = useState<Instrument[]>([])
  const [editSheet, setEditSheet] = useState<{ type: 'instrument'; instrument: Instrument } | { type: 'investment'; investment: Investment } | null>(null)
  const [instrumentId, setInstrumentId] = useState(initId ? String(initId) : '')
  const [investmentId, setInvestmentId] = useState(initInvestmentId ? String(initInvestmentId) : '')
  const [showNewInst, setShowNewInst] = useState(false)
  const [newInstName, setNewInstName] = useState('')
  const [newInstType, setNewInstType] = useState<Instrument['instrument_type']>('mutual_fund')
  const [newInstCategory, setNewInstCategory] = useState('')
  const [newFundFolio, setNewFundFolio] = useState('')
  const [memberId, setMemberId] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [quantity, setQuantity] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [amount, setAmount] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [affectsBalance, setAffectsBalance] = useState(true)
  const [fdFields, setFdFields] = useState<FDFields>(EMPTY_FD_FIELDS)
  const [bondFields, setBondFields] = useState<BondFields>(EMPTY_BOND_FIELDS)
  const [bondQuantity, setBondQuantity] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isNewMf = showNewInst && MF_TYPES.has(newInstType)
  const isNewEquity = showNewInst && newInstType === 'equity'
  // Both MF and equity route new holdings through the same get-or-create-
  // shell-then-Investment endpoint (investmentApi.getOrCreateMfInvestment,
  // which despite the name is generic — see instruments/views.py's
  // MutualFundInvestmentView).
  const isNewShellType = isNewMf || isNewEquity

  useEffect(() => { investmentApi.listInvestments({ household: householdId }).then(setInvestments).catch(() => {}) }, [householdId])
  useEffect(() => { portfolioApi.listAccounts(householdId).then(setAccounts).catch(() => {}) }, [householdId])
  const loadFullInstruments = () => portfolioApi.listInstruments(householdId).then(setFullInstruments).catch(() => {})
  useEffect(() => { void loadFullInstruments() }, [householdId])

  useEffect(() => {
    const inst = instruments.find((i) => String(i.id) === instrumentId)
    if (inst?.default_account) setAccountId(String(inst.default_account))
  }, [instrumentId, instruments])

  useEffect(() => {
    if (quantity && pricePerUnit) setAmount((parseFloat(quantity) * parseFloat(pricePerUnit)).toFixed(2))
  }, [quantity, pricePerUnit])

  const selectedInvestmentShellType = investmentId
    ? instrumentsFull.find((i) => i.id === investments.find((iv) => String(iv.id) === investmentId)?.instrument)?.instrument_type
    : undefined
  const selectedType: Instrument['instrument_type'] | '' = showNewInst
    ? newInstType
    : investmentId
      ? ((selectedInvestmentShellType ?? 'mutual_fund') as Instrument['instrument_type'])
      : ((instruments.find((i) => String(i.id) === instrumentId)?.instrument_type ?? '') as Instrument['instrument_type'] | '')
  const isFD = selectedType === 'fd' || selectedType === 'rd'
  const isBond = selectedType === 'bond'
  const isMf = MF_TYPES.has(selectedType)

  const save = async () => {
    if (!amount || parseFloat(amount) <= 0) { setError('Enter total amount paid.'); return }
    if (isFD && (!fdFields.annual_rate || !fdFields.maturity_date)) { setError('Enter the annual rate and maturity date.'); return }
    if (isBond && (!bondFields.coupon_rate || !bondFields.maturity_date)) { setError('Enter the coupon rate and maturity date.'); return }
    setSaving(true); setError('')
    try {
      let finalId = instrumentId ? Number(instrumentId) : null
      let finalInvestmentId = investmentId ? Number(investmentId) : null

      if (isNewShellType) {
        if (!newInstName.trim()) { setError(isNewEquity ? 'Enter stock name.' : 'Enter fund name.'); setSaving(false); return }
        const investment = await investmentApi.getOrCreateMfInvestment({
          household: householdId, name: newInstName.trim(), folio_no: isNewEquity ? '' : newFundFolio.trim(),
          member: memberId ? Number(memberId) : null,
          instrument_type: isNewEquity ? 'equity' : 'mutual_fund',
        })
        finalId = investment.instrument
        finalInvestmentId = investment.id
      } else if (showNewInst) {
        if (!newInstName.trim()) { setError('Enter instrument name.'); setSaving(false); return }
        const created = await portfolioApi.createInstrument({
          household: householdId, name: newInstName.trim(), instrument_type: newInstType,
          sub_category: '', asset_category: newInstCategory ? Number(newInstCategory) : null,
          symbol: '', default_account: null, metadata: {}, is_active: true, include_in_rebalancing: true,
        })
        finalId = created.id
      } else if (finalInvestmentId && !finalId) {
        finalId = investments.find((iv) => iv.id === finalInvestmentId)?.instrument ?? null
      }
      if (!finalId) { setError(isMf ? 'Select a fund.' : 'Select an instrument.'); setSaving(false); return }

      const tx = await ledgerApi.createTransaction({ household: householdId, member: memberId ? Number(memberId) : null, account: accountId ? Number(accountId) : null, instrument: finalId, investment: finalInvestmentId, tx_date: date, amount, quantity: quantity || null, price_per_unit: pricePerUnit || null, fees: '0.00', taxes: '0.00', currency: 'INR', direction: 'outflow', transaction_type: 'buy', external_reference: '', idempotency_key: `buy-${finalInvestmentId ?? finalId}-${Date.now()}`, metadata: {}, affects_balance: accountId ? affectsBalance : true })

      if (isFD) {
        await portfolioApi.createFDDetails({
          instrument: finalId,
          funding_transaction: tx.id,
          account_number: fdFields.account_number,
          principal: amount,
          annual_rate: fdFields.annual_rate,
          investment_date: date,
          maturity_date: fdFields.maturity_date,
          compounding: fdFields.compounding,
          maturity_value: fdFields.maturity_value || null,
        })
      }
      if (isBond) {
        await portfolioApi.createBondDetails({
          instrument: finalId,
          funding_transaction: tx.id,
          issuer_name: bondFields.issuer_name,
          bond_type: bondFields.bond_type,
          isin: bondFields.isin,
          face_value: amount,
          quantity: Number(bondQuantity || '1'),
          coupon_rate: bondFields.coupon_rate,
          coupon_frequency: bondFields.coupon_frequency,
          investment_date: date,
          maturity_date: bondFields.maturity_date,
          first_coupon_date: bondFields.first_coupon_date || null,
          grace_days: Number(bondFields.grace_days || '15'),
          maturity_value: bondFields.maturity_value || null,
          credit_rating: bondFields.credit_rating,
          notes: bondFields.notes,
        })
      }

      // Investment-backed (MF/SIP) ownership is the Investment.member field —
      // set on create above, or already correct for an existing Investment;
      // edited afterward via InvestmentForm, not InstrumentOwnership.
      if (memberId && !finalInvestmentId) {
        const existing = await portfolioApi.listInstrumentOwnerships(finalId)
        if (!existing.find((o) => o.member === Number(memberId)))
          await portfolioApi.createInstrumentOwnership({ instrument: finalId, member: Number(memberId), allocation_percent: '100.00' })
      }
      onSave()
    } catch (e: unknown) {
      setError(e && typeof e === 'object' && 'detail' in e ? String((e as { detail: unknown }).detail) : 'Failed to save.')
    } finally { setSaving(false) }
  }

  type PickerItem = { kind: 'inv' | 'inst'; id: number; label: string; group: string; icon: string; extra: string }
  const pickerItems: PickerItem[] = useMemo(() => [
    ...investments.map((iv): PickerItem => {
      const shellType = instrumentsFull.find((i) => i.id === iv.instrument)?.instrument_type ?? 'mutual_fund'
      return {
        kind: 'inv', id: iv.id, label: iv.name, group: TYPE_LABELS[shellType] ?? shellType, icon: TYPE_ICONS[shellType] ?? TYPE_ICONS.mutual_fund,
        extra: iv.folio_no ?? '',
      }
    }),
    ...instruments.map((i): PickerItem => ({
      kind: 'inst', id: i.id, label: i.label, group: TYPE_LABELS[i.instrument_type] ?? i.instrument_type,
      icon: TYPE_ICONS[i.instrument_type] ?? '💼', extra: '',
    })),
  ], [investments, instruments, instrumentsFull])

  const selectedPickerItem = pickerItems.find((p) =>
    (p.kind === 'inv' && String(p.id) === investmentId) || (p.kind === 'inst' && String(p.id) === instrumentId),
  ) ?? null

  const selectedInvestment = investmentId ? investments.find((iv) => iv.id === Number(investmentId)) ?? null : null
  const selectedFullInstrument = fullInstruments.find((i) =>
    i.id === (selectedInvestment ? selectedInvestment.instrument : Number(instrumentId)),
  ) ?? null
  const selectedCategory = selectedFullInstrument?.asset_category
    ? categories.find((c) => c.id === selectedFullInstrument.asset_category) ?? null
    : null
  const selectedAccount = selectedFullInstrument?.default_account
    ? accounts.find((a) => a.id === selectedFullInstrument.default_account) ?? null
    : null

  const closeEditSheet = async () => {
    setEditSheet(null)
    await Promise.all([loadFullInstruments(), investmentApi.listInvestments({ household: householdId }).then(setInvestments)])
  }

  return (
    <div className={`grid gap-3 ${scroll ? 'max-h-[70vh] overflow-y-auto' : ''}`}>
      {!initId && !initInvestmentId && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Instrument / Fund</label>
          {!showNewInst ? (
            <div className="flex gap-2">
              <div className="flex-1">
                <SearchableSelect
                  items={pickerItems}
                  getKey={(p) => `${p.kind}:${p.id}`}
                  getLabel={(p) => p.label}
                  getGroup={(p) => p.group}
                  getIcon={(p) => p.icon}
                  renderExtra={(p) => p.extra}
                  value={selectedPickerItem}
                  onChange={(p) => {
                    setInvestmentId(p.kind === 'inv' ? String(p.id) : '')
                    setInstrumentId(p.kind === 'inst' ? String(p.id) : '')
                  }}
                  placeholder="Search instruments and funds…"
                  emptyMessage="No matches — use + New to create one."
                />
              </div>
              <button type="button" onClick={() => setShowNewInst(true)} className="shrink-0 rounded-lg border border-dashed border-primary-400 px-3 text-xs text-primary-600 hover:bg-primary-50 dark:bg-primary-900/15">+ New</button>
            </div>
          ) : (
            <div className="rounded-xl border border-primary-200 bg-primary-50 dark:bg-primary-900/15 p-3 space-y-2">
              <p className="text-xs font-medium text-primary-700 dark:text-primary-300">{isNewMf ? 'New Fund/Folio' : isNewEquity ? 'New Stock' : 'New Instrument'}</p>
              <input placeholder={isNewMf ? 'Fund/scheme name' : isNewEquity ? 'Stock name' : 'Name'} value={newInstName} onChange={(e) => setNewInstName(e.target.value)} className={INP} />
              <select value={newInstType} onChange={(e) => setNewInstType(e.target.value as Instrument['instrument_type'])} className={INP}>
                {INSTRUMENT_TYPES_OPTS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
              {isNewMf ? (
                <input placeholder="Folio number (optional)" value={newFundFolio} onChange={(e) => setNewFundFolio(e.target.value)} className={INP} />
              ) : (
                <select value={newInstCategory} onChange={(e) => setNewInstCategory(e.target.value)} className={INP}>
                  <option value="">-- No category --</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <button type="button" onClick={() => setShowNewInst(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-2)]">{'<- back to existing'}</button>
            </div>
          )}
        </div>
      )}
      {!showNewInst && selectedFullInstrument && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text)]">
              <span>{TYPE_ICONS[selectedFullInstrument.instrument_type] ?? '💼'}</span>
              <span className="truncate">{selectedInvestment?.name ?? selectedFullInstrument.name}</span>
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
              <span>{TYPE_LABELS[selectedFullInstrument.instrument_type] ?? selectedFullInstrument.instrument_type}</span>
              {selectedInvestment?.folio_no && <span>Folio {selectedInvestment.folio_no}</span>}
              {selectedInvestment?.isin && <span>ISIN {selectedInvestment.isin}</span>}
              {!selectedInvestment && selectedFullInstrument.symbol && <span>{selectedFullInstrument.symbol}</span>}
              {selectedCategory && <span>{selectedCategory.name}</span>}
              {selectedAccount && <span>{selectedAccount.name}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditSheet(
              selectedInvestment ? { type: 'investment', investment: selectedInvestment } : { type: 'instrument', instrument: selectedFullInstrument },
            )}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)]"
          >
            Edit
          </button>
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Owner (member)</label>
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={INP}>
          <option value="">— Unassigned —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">{isFD || isBond ? 'Investment Date' : 'Purchase Date'}</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INP} /></div>
      {!isFD && !isBond && (
        <div className="grid grid-cols-2 gap-2">
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Units / Qty</label>
            <input type="number" min="0" step="0.000001" placeholder="e.g. 10.5" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={INP} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Price per unit</label>
            <input type="number" min="0" step="0.000001" placeholder="e.g. 94.50" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} className={INP} /></div>
        </div>
      )}
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
          {isFD ? 'Principal (₹) *' : isBond ? 'Face Value (₹, total) *' : 'Total amount paid (₹) *'}
        </label>
        <input type="number" min="0" step="0.01" placeholder="e.g. 5000" value={amount} onChange={(e) => setAmount(e.target.value)} className={INP} /></div>

      {isFD && (
        <div className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{selectedType === 'rd' ? 'Recurring' : 'Fixed'} Deposit Details</p>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Account / Receipt Number (optional)</label>
            <input className={INP} value={fdFields.account_number} onChange={(e) => setFdFields((p) => ({ ...p, account_number: e.target.value }))} />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">Used to detect a duplicate import of the same deposit.</p></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Annual Rate (%) *</label>
            <input type="number" step="0.01" className={INP} value={fdFields.annual_rate} onChange={(e) => setFdFields((p) => ({ ...p, annual_rate: e.target.value }))} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Maturity Date *</label>
            <input type="date" className={INP} value={fdFields.maturity_date} onChange={(e) => setFdFields((p) => ({ ...p, maturity_date: e.target.value }))} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Compounding</label>
            <select className={INP} value={fdFields.compounding} onChange={(e) => setFdFields((p) => ({ ...p, compounding: e.target.value as FDFields['compounding'] }))}>
              {COMPOUNDING_OPTIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Maturity Value (₹, optional — bank-stated if known)</label>
            <input type="number" className={INP} value={fdFields.maturity_value} onChange={(e) => setFdFields((p) => ({ ...p, maturity_value: e.target.value }))} /></div>
        </div>
      )}

      {isBond && (
        <div className="grid gap-3 rounded-xl border border-teal-100 bg-teal-50/60 p-3">
          <p className="text-xs font-medium text-teal-700 dark:text-teal-300">Bond Details</p>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Issuer Name</label>
            <input className={INP} value={bondFields.issuer_name} onChange={(e) => setBondFields((p) => ({ ...p, issuer_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Bond Type</label>
              <select className={INP} value={bondFields.bond_type} onChange={(e) => setBondFields((p) => ({ ...p, bond_type: e.target.value as BondFields['bond_type'] }))}>
                {BOND_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select></div>
            <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">ISIN</label>
              <input className={INP} value={bondFields.isin} onChange={(e) => setBondFields((p) => ({ ...p, isin: e.target.value }))} /></div>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Quantity (units)</label>
            <input type="number" className={INP} value={bondQuantity} onChange={(e) => setBondQuantity(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Coupon Rate (% p.a.) *</label>
              <input type="number" step="0.01" className={INP} value={bondFields.coupon_rate} onChange={(e) => setBondFields((p) => ({ ...p, coupon_rate: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Coupon Frequency</label>
              <select className={INP} value={bondFields.coupon_frequency} onChange={(e) => setBondFields((p) => ({ ...p, coupon_frequency: e.target.value as BondFields['coupon_frequency'] }))}>
                {COUPON_FREQUENCY_OPTIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select></div>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Maturity Date *</label>
            <input type="date" className={INP} value={bondFields.maturity_date} onChange={(e) => setBondFields((p) => ({ ...p, maturity_date: e.target.value }))} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">First Coupon Date (optional)</label>
            <input type="date" className={INP} value={bondFields.first_coupon_date} onChange={(e) => setBondFields((p) => ({ ...p, first_coupon_date: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Grace Days</label>
              <input type="number" className={INP} value={bondFields.grace_days} onChange={(e) => setBondFields((p) => ({ ...p, grace_days: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Credit Rating</label>
              <input className={INP} placeholder="e.g. AAA" value={bondFields.credit_rating} onChange={(e) => setBondFields((p) => ({ ...p, credit_rating: e.target.value }))} /></div>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Maturity Value (₹, optional)</label>
            <input type="number" className={INP} value={bondFields.maturity_value} onChange={(e) => setBondFields((p) => ({ ...p, maturity_value: e.target.value }))} /></div>
          <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Notes</label>
            <input className={INP} value={bondFields.notes} onChange={(e) => setBondFields((p) => ({ ...p, notes: e.target.value }))} /></div>
        </div>
      )}

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

      {editSheet?.type === 'instrument' && (
        <Sheet title="Edit Instrument" onClose={() => setEditSheet(null)}>
          <InstrumentForm householdId={householdId} instrument={editSheet.instrument} onSave={closeEditSheet} onCancel={() => setEditSheet(null)} />
        </Sheet>
      )}
      {editSheet?.type === 'investment' && (
        <Sheet title="Edit Fund" onClose={() => setEditSheet(null)}>
          <InvestmentForm investment={editSheet.investment} onSave={closeEditSheet} onCancel={() => setEditSheet(null)} />
        </Sheet>
      )}
    </div>
  )
}
