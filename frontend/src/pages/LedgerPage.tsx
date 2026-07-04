import { Fragment, useEffect, useState } from 'react'
import { ledgerApi } from '../api/ledgerApi'
import { getJson } from '../api/http'
import { EntityPageLayout } from '../components/common/EntityPageLayout'
import { DateField, MoneyInput, SelectField, TextField } from '../components/common/FormField'
import { DeleteButton } from '../components/common/DeleteButton'
import { useAuth } from '../context/AuthContext'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { normalizeApiError } from '../hooks/errorUtils'
import { TOOLTIPS } from '../data/helpContent'
import type { Account, OptionItem, Transaction } from '../types/domain'

type Props = {
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  onRefreshDashboard: () => Promise<void>
  canDelete: (e: DeleteEntity) => boolean
}

type GmailMeta = {
  message_id?: string
  from?: string
  to?: string
  subject?: string
  snippet?: string
}

type TxForm = {
  member: string
  account: string
  instrument: string
  tx_date: string
  amount: string
  quantity: string
  price_per_unit: string
  transaction_type: string
  external_reference: string
}

const TX_TYPE_LABELS: Record<string, string> = {
  deposit: 'Deposit', withdrawal: 'Withdrawal', buy: 'Buy', sell: 'Sell',
  dividend: 'Dividend', interest: 'Interest', salary: 'Salary',
  tax_payment: 'Tax Payment', tax_refund: 'Tax Refund', emi: 'EMI',
  loan_disbursal: 'Loan', premium: 'Premium', cc_bill_payment: 'CC Bill Payment', other: 'Other',
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: 'Bank Account', broker: 'Broker', pf: 'PF', loan: 'Loan',
  credit_card: 'Credit Card', insurance: 'Insurance', cash: 'Cash', other: 'Other',
}

const TX_TYPES: OptionItem[] = [
  'deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'interest', 'salary',
  'tax_payment', 'tax_refund', 'emi', 'loan_disbursal', 'premium', 'other',
].map((x, i) => ({ id: i + 1, label: x }))

const CLASSIFICATION_OPTIONS: OptionItem[] = [
  { id: 1, label: 'spend' }, { id: 2, label: 'income' }, { id: 3, label: 'internal_transfer' }, { id: 4, label: 'tracking' },
]

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'account', label: 'Account' },
  { value: 'member', label: 'Member' },
  { value: 'transaction_type', label: 'Type' },
]

type GroupBy = 'none' | 'account' | 'member' | 'transaction_type'

const PAGE_SIZE = 25

function blankForm(): TxForm {
  return {
    member: '', account: '', instrument: '',
    tx_date: new Date().toISOString().slice(0, 10),
    amount: '', quantity: '', price_per_unit: '',
    transaction_type: 'buy', external_reference: '',
  }
}

function txTypeId(label: string) { return String(TX_TYPES.find(x => x.label === label)?.id || 3) }
function txTypeLabel(id: string) { return TX_TYPES.find(x => x.id === Number(id))?.label || 'buy' }

function directionArrow(d: string) {
  return d === 'inflow'
    ? <span className="font-bold text-emerald-600 dark:text-emerald-400">↑</span>
    : <span className="font-bold text-rose-600 dark:text-rose-400">↓</span>
}

const BADGE_BASE = 'rounded text-[0.65rem] font-semibold px-1.5 py-px'
function sourceBadge(source: string) {
  if (source === 'api') return <span className={`${BADGE_BASE} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300`}>Gmail</span>
  if (source === 'csv') return <span className={`${BADGE_BASE} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}>CSV</span>
  return <span className={`${BADGE_BASE} bg-[var(--surface-2)] text-[var(--text-2)]`}>Manual</span>
}

function TxFormFields({ form, onChange, accountOptions, memberOptions, instrumentOptions, error, submitLabel, onSubmit, onCancel, canWrite }: {
  form: TxForm
  onChange: (f: TxForm) => void
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  error: string
  submitLabel: string
  onSubmit: () => void
  onCancel: () => void
  canWrite: boolean
}) {
  const set = (k: keyof TxForm) => (v: string) => onChange({ ...form, [k]: v })
  return (
    <>
      {error && <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="form-grid">
        <SelectField label="Member" value={form.member} onChange={set('member')} options={memberOptions} placeholder="Optional" />
        <SelectField label="Account" value={form.account} onChange={set('account')} options={accountOptions} placeholder="Optional" />
        <SelectField label="Instrument" value={form.instrument} onChange={set('instrument')} options={instrumentOptions} placeholder="Optional" />
        <DateField label="Date" value={form.tx_date} onChange={set('tx_date')} />
        <MoneyInput label="Amount" value={form.amount} onChange={set('amount')} />
        <TextField label="Quantity" type="number" min="0" step="0.000001" value={form.quantity} onChange={set('quantity')} />
        <TextField label="Price Per Unit" type="number" min="0" step="0.000001" value={form.price_per_unit} onChange={set('price_per_unit')} />
        <SelectField label="Type" helpTooltip={TOOLTIPS.transaction_type} value={txTypeId(form.transaction_type)} onChange={v => onChange({ ...form, transaction_type: txTypeLabel(v) })} options={TX_TYPES} />
      </div>
      <TextField label="Reference / Note" value={form.external_reference} onChange={set('external_reference')} />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" onClick={onSubmit} disabled={!canWrite} className="primary-btn">{submitLabel}</button>
        <button type="button" onClick={onCancel} className="secondary-btn">Cancel</button>
      </div>
    </>
  )
}

function TransactionDetailRow({ t, accountFull, colSpan }: { t: Transaction; accountFull: Account | undefined; colSpan: number }) {
  const gmailMeta = (t.metadata?.gmail as GmailMeta | undefined) ?? null
  return (
    <tr>
      <td colSpan={colSpan} className="bg-[var(--surface-2)] px-4 py-3 text-xs text-[var(--text-2)]">
        {gmailMeta ? (
          <table className="w-full border-collapse">
            <tbody>
              {gmailMeta.from && <tr><td className="pr-3 align-top whitespace-nowrap text-[var(--text-muted)]">From</td><td>{gmailMeta.from}</td></tr>}
              {gmailMeta.to && <tr><td className="pr-3 align-top whitespace-nowrap text-[var(--text-muted)]">To</td><td>{gmailMeta.to}</td></tr>}
              {gmailMeta.subject && <tr><td className="pr-3 align-top whitespace-nowrap text-[var(--text-muted)]">Subject</td><td>{gmailMeta.subject}</td></tr>}
              {gmailMeta.snippet && <tr><td className="pr-3 align-top whitespace-nowrap text-[var(--text-muted)]">Preview</td><td>{gmailMeta.snippet}</td></tr>}
              {gmailMeta.message_id && <tr><td className="pr-3 align-top whitespace-nowrap text-[var(--text-muted)]">Message ID</td><td className="break-all text-[var(--text-faint)]">{gmailMeta.message_id}</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              <tr><td className="pr-3 text-[var(--text-muted)]">Source</td><td>{t.source === 'csv' ? 'Imported from CSV' : t.source === 'api' ? 'Imported via Gmail' : 'Manually entered'}</td></tr>
              {accountFull && <tr><td className="pr-3 text-[var(--text-muted)]">Account type</td><td>{ACCOUNT_TYPE_LABELS[accountFull.account_type] ?? accountFull.account_type}{accountFull.institution_name ? ` · ${accountFull.institution_name}` : ''}</td></tr>}
              {t.quantity && <tr><td className="pr-3 text-[var(--text-muted)]">Quantity</td><td>{t.quantity}{t.price_per_unit ? ` @ ₹${t.price_per_unit}` : ''}</td></tr>}
              {(parseFloat(t.fees) > 0 || parseFloat(t.taxes) > 0) && <tr><td className="pr-3 text-[var(--text-muted)]">Fees/Taxes</td><td>₹{t.fees} / ₹{t.taxes}</td></tr>}
              {t.idempotency_key && <tr><td className="pr-3 text-[var(--text-muted)]">Key</td><td className="text-[var(--text-faint)]">{t.idempotency_key}</td></tr>}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  )
}

export function LedgerPage({ householdId, memberOptions, accountOptions, instrumentOptions, onRefreshDashboard, canDelete }: Props) {
  const { canWrite } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [fullAccounts, setFullAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [snapshotPrompt, setSnapshotPrompt] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Search / filter / sort / group / pagination state
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [filterMember, setFilterMember] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterClassification, setFilterClassification] = useState('')
  const [dateAfter, setDateAfter] = useState('')
  const [dateBefore, setDateBefore] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [ordering, setOrdering] = useState('-tx_date')
  const [page, setPage] = useState(1)

  // Create form visibility
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<TxForm>(blankForm())

  // Inline edit state: null = no edit open, number = transaction id being edited
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<TxForm>(blankForm())

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset to page 1 whenever a filter/search/group/order changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, filterAccount, filterMember, filterType, filterClassification, dateAfter, dateBefore, groupBy, ordering])

  const loadAccounts = async () => {
    try {
      const accs = await getJson<Account[] | { results: Account[] }>(`/api/accounts/?household=${householdId}`)
      setFullAccounts(Array.isArray(accs) ? accs : accs.results ?? [])
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const loadTransactions = async () => {
    setLoading(true)
    try {
      const effectiveOrdering = groupBy !== 'none' ? groupBy : ordering
      const res = await ledgerApi.listTransactionsPage({
        householdId,
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        account: filterAccount ? Number(filterAccount) : undefined,
        member: filterMember ? Number(filterMember) : undefined,
        transactionType: filterType || undefined,
        classification: filterClassification || undefined,
        txDateAfter: dateAfter || undefined,
        txDateBefore: dateBefore || undefined,
        ordering: effectiveOrdering,
      })
      setTransactions(res.results)
      setTotalCount(res.count)
      setError('')
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  useEffect(() => {
    void loadTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, page, debouncedSearch, filterAccount, filterMember, filterType, filterClassification, dateAfter, dateBefore, groupBy, ordering])

  const resetFilters = () => {
    setSearch('')
    setFilterAccount('')
    setFilterMember('')
    setFilterType('')
    setFilterClassification('')
    setDateAfter('')
    setDateBefore('')
    setGroupBy('none')
    setOrdering('-tx_date')
  }

  const hasActiveFilters = !!(search || filterAccount || filterMember || filterType || filterClassification || dateAfter || dateBefore || groupBy !== 'none')

  const saveTransaction = async () => {
    try {
      setFormError('')
      await ledgerApi.createTransaction({
        household: householdId,
        member: createForm.member ? Number(createForm.member) : null,
        account: createForm.account ? Number(createForm.account) : null,
        instrument: createForm.instrument ? Number(createForm.instrument) : null,
        tx_date: createForm.tx_date,
        amount: createForm.amount,
        quantity: createForm.quantity || null,
        price_per_unit: createForm.price_per_unit || null,
        fees: '0.00',
        taxes: '0.00',
        currency: 'INR',
        direction: 'outflow',
        transaction_type: createForm.transaction_type as Transaction['transaction_type'],
        external_reference: createForm.external_reference,
        idempotency_key: `manual-${Date.now()}`,
        metadata: {},
      })
      setCreateForm(blankForm())
      setShowCreate(false)
      await loadTransactions()
      await onRefreshDashboard()
      setSnapshotPrompt(true)
    } catch (e) {
      setFormError(normalizeApiError(e))
    }
  }

  const openEdit = (t: Transaction) => {
    setEditingId(t.id)
    setEditForm({
      member: t.member ? String(t.member) : '',
      account: t.account ? String(t.account) : '',
      instrument: t.instrument ? String(t.instrument) : '',
      tx_date: t.tx_date,
      amount: t.amount,
      quantity: t.quantity || '',
      price_per_unit: t.price_per_unit || '',
      transaction_type: t.transaction_type,
      external_reference: t.external_reference,
    })
    setFormError('')
  }

  const saveEdit = async () => {
    if (editingId === null) return
    try {
      setFormError('')
      await ledgerApi.updateTransaction(editingId, {
        member: editForm.member ? Number(editForm.member) : null,
        account: editForm.account ? Number(editForm.account) : null,
        instrument: editForm.instrument ? Number(editForm.instrument) : null,
        tx_date: editForm.tx_date,
        amount: editForm.amount,
        quantity: editForm.quantity || null,
        price_per_unit: editForm.price_per_unit || null,
        direction: 'outflow',
        transaction_type: editForm.transaction_type as Transaction['transaction_type'],
        external_reference: editForm.external_reference,
      })
      setEditingId(null)
      await loadTransactions()
      await onRefreshDashboard()
    } catch (e) {
      setFormError(normalizeApiError(e))
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // Compute group-divider labels when a group-by is active (rows already
  // arrive sorted by the grouped field from the backend `ordering` param).
  const groupLabel = (t: Transaction): string => {
    if (groupBy === 'account') return accountOptions.find(a => a.id === t.account)?.label ?? 'No account'
    if (groupBy === 'member') return memberOptions.find(m => m.id === t.member)?.label ?? 'Unassigned'
    if (groupBy === 'transaction_type') return TX_TYPE_LABELS[t.transaction_type] ?? t.transaction_type
    return ''
  }

  let lastGroupLabel: string | null = null

  const thCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] cursor-pointer select-none whitespace-nowrap'
  const sortIndicator = (field: string) => {
    if (groupBy !== 'none') return null
    if (ordering === field) return ' ▲'
    if (ordering === `-${field}`) return ' ▼'
    return null
  }
  const toggleSort = (field: string) => {
    if (groupBy !== 'none') return
    setOrdering(prev => (prev === `-${field}` ? field : `-${field}`))
  }

  return (
    <>
      {snapshotPrompt && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-100 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
          <span className="text-amber-900 dark:text-amber-200">Net worth has changed — take a snapshot to record today's value?</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => { setSnapshotPrompt(false); window.location.hash = '#/valuation' }}>Go to Valuation</button>
            <button className="secondary-btn" onClick={() => setSnapshotPrompt(false)}>Dismiss</button>
          </div>
        </div>
      )}
      {error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <EntityPageLayout
        title="Transactions"
        subtitle="Immutable ledger entries"
        list={
          <article className="panel">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="m-0">Transactions</h3>
              {canWrite && (
                <button type="button" className="primary-btn" style={{ fontSize: '0.8rem', padding: '4px 12px' }} onClick={() => { setShowCreate(v => !v); setFormError('') }}>
                  {showCreate ? 'Cancel' : '+ Add Transaction'}
                </button>
              )}
            </div>

            {showCreate && (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-2)' }}>New Transaction</p>
                <TxFormFields
                  form={createForm} onChange={setCreateForm}
                  accountOptions={accountOptions} memberOptions={memberOptions} instrumentOptions={instrumentOptions}
                  error={formError} submitLabel="Save" canWrite={canWrite}
                  onSubmit={saveTransaction}
                  onCancel={() => { setShowCreate(false); setCreateForm(blankForm()); setFormError('') }}
                />
              </div>
            )}

            {editingId !== null && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/15 p-4 dark:border-amber-800/40 dark:bg-amber-900/20">
                <p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">Editing #{editingId}</p>
                <TxFormFields
                  form={editForm} onChange={setEditForm}
                  accountOptions={accountOptions} memberOptions={memberOptions} instrumentOptions={instrumentOptions}
                  error={formError} submitLabel="Update" canWrite={canWrite}
                  onSubmit={saveEdit}
                  onCancel={() => { setEditingId(null); setFormError('') }}
                />
              </div>
            )}

            {/* Search + filter toolbar */}
            <div className="mb-3 grid gap-2">
              <input
                type="search"
                placeholder="Search reference, description, notes, or amount…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]"
              />
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                  Account
                  <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]">
                    <option value="">All</option>
                    {accountOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                  Member
                  <select value={filterMember} onChange={e => setFilterMember(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]">
                    <option value="">All</option>
                    {memberOptions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                  Type
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]">
                    <option value="">All</option>
                    {TX_TYPES.map(t => <option key={t.id} value={t.label}>{TX_TYPE_LABELS[t.label] ?? t.label}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                  Classification
                  <select value={filterClassification} onChange={e => setFilterClassification(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]">
                    <option value="">All</option>
                    {CLASSIFICATION_OPTIONS.map(c => <option key={c.id} value={c.label}>{c.label.replace('_', ' ')}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                  From
                  <input type="date" value={dateAfter} onChange={e => setDateAfter(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]" />
                </label>
                <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                  To
                  <input type="date" value={dateBefore} onChange={e => setDateBefore(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]" />
                </label>
                <label className="grid gap-1 text-xs text-[var(--text-muted)]">
                  Group by
                  <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]">
                    {GROUP_BY_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </label>
                {hasActiveFilters && (
                  <button type="button" onClick={resetFilters} className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-300">
                    Reset filters
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-2)]">
                  <tr>
                    <th className={thCls} onClick={() => toggleSort('tx_date')}>Date{sortIndicator('tx_date')}</th>
                    <th className={thCls}>Type</th>
                    <th className={thCls}>Account / Member / Instrument</th>
                    <th className={thCls}>Reference</th>
                    <th className={`${thCls} text-right`} onClick={() => toggleSort('amount')}>Amount{sortIndicator('amount')}</th>
                    <th className={thCls}>Source</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--text-muted)]">Loading…</td></tr>
                  ) : transactions.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--text-muted)]">No transactions match these filters.</td></tr>
                  ) : (
                    transactions.map((t) => {
                      const accountName = accountOptions.find(a => a.id === t.account)?.label ?? null
                      const memberName = memberOptions.find(m => m.id === t.member)?.label ?? null
                      const instrumentName = instrumentOptions.find(i => i.id === t.instrument)?.label ?? null
                      const accountFull = fullAccounts.find(a => a.id === t.account)
                      const amount = parseFloat(t.amount)
                      const amountStr = `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      const isExpanded = expandedId === t.id

                      const label = groupBy !== 'none' ? groupLabel(t) : ''
                      const showDivider = groupBy !== 'none' && label !== lastGroupLabel
                      if (groupBy !== 'none') lastGroupLabel = label

                      return (
                        <Fragment key={t.id}>
                          {showDivider && (
                            <tr key={`group-${label}`}>
                              <td colSpan={7} className="bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                {label}
                              </td>
                            </tr>
                          )}
                          <tr
                            key={t.id}
                            className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface-2)]"
                            onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          >
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-faint)]">{t.tx_date}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                {directionArrow(t.direction)}
                                <span className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
                                  {TX_TYPE_LABELS[t.transaction_type] ?? t.transaction_type}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs text-[var(--text-2)]">
                              {[
                                accountFull ? `${accountName} (${ACCOUNT_TYPE_LABELS[accountFull.account_type] ?? accountFull.account_type})` : accountName,
                                memberName,
                                instrumentName,
                              ].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className="max-w-[16rem] truncate px-3 py-2 text-xs italic text-[var(--text-muted)]" title={t.external_reference}>
                              {t.external_reference || '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold">{amountStr}</td>
                            <td className="px-3 py-2">{sourceBadge(t.source)}</td>
                            <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {canWrite && (
                                  <button
                                    type="button"
                                    onClick={() => openEdit(t)}
                                    title="Edit transaction"
                                    className="rounded px-1 py-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                                  >
                                    ✏️
                                  </button>
                                )}
                                <DeleteButton disabled={!canDelete('transaction')} onDelete={async () => { await ledgerApi.deleteTransaction(t.id); await loadTransactions(); await onRefreshDashboard() }} />
                              </div>
                            </td>
                          </tr>
                          {isExpanded && <TransactionDetailRow key={`detail-${t.id}`} t={t} accountFull={accountFull} colSpan={7} />}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalCount > 0 && (
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 disabled:opacity-40">
                    ← Prev
                  </button>
                  <span>Page {page} of {totalPages}</span>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 disabled:opacity-40">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </article>
        }
        form={null}
      />
    </>
  )
}
