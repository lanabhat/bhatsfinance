import { useEffect, useState } from 'react'
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
  loan_disbursal: 'Loan', premium: 'Premium', other: 'Other',
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: 'Bank Account', broker: 'Broker', pf: 'PF', loan: 'Loan',
  credit_card: 'Credit Card', insurance: 'Insurance', cash: 'Cash', other: 'Other',
}

const TX_TYPES: OptionItem[] = [
  'deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'interest', 'salary',
  'tax_payment', 'tax_refund', 'emi', 'loan_disbursal', 'premium', 'other',
].map((x, i) => ({ id: i + 1, label: x }))

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
    ? <span style={{ color: '#16a34a', fontWeight: 700 }}>↑</span>
    : <span style={{ color: '#dc2626', fontWeight: 700 }}>↓</span>
}

function sourceBadge(source: string) {
  if (source === 'api') return <span style={{ fontSize: '0.65rem', background: '#dbeafe', color: '#1d4ed8', borderRadius: '4px', padding: '1px 5px', fontWeight: 600 }}>Gmail</span>
  if (source === 'csv') return <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#92400e', borderRadius: '4px', padding: '1px 5px', fontWeight: 600 }}>CSV</span>
  return <span style={{ fontSize: '0.65rem', background: '#f1f5f9', color: '#475569', borderRadius: '4px', padding: '1px 5px', fontWeight: 600 }}>Manual</span>
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
      {error && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{error}</p>}
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

function TransactionRow({ t, accountOptions, memberOptions, instrumentOptions, accounts, canDelete, canWrite, onDelete, onEdit }: {
  t: Transaction
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  accounts: Account[]
  canDelete: boolean
  canWrite: boolean
  onDelete: () => Promise<void>
  onEdit: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const accountName = accountOptions.find(a => a.id === t.account)?.label ?? null
  const memberName = memberOptions.find(m => m.id === t.member)?.label ?? null
  const instrumentName = instrumentOptions.find(i => i.id === t.instrument)?.label ?? null
  const accountFull = accounts.find(a => a.id === t.account)
  const gmailMeta = (t.metadata?.gmail as GmailMeta | undefined) ?? null
  const amount = parseFloat(t.amount)
  const amountStr = `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <li style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          style={{ flex: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', minWidth: '6rem' }}>{t.tx_date}</span>
            {directionArrow(t.direction)}
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{amountStr}</span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '1px 6px' }}>
              {TX_TYPE_LABELS[t.transaction_type] ?? t.transaction_type}
            </span>
            {sourceBadge(t.source)}
            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>#{t.id}</span>
          </div>
          {(accountName || memberName || instrumentName) && (
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
              {accountName && (
                <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                  {accountFull ? `${accountName} (${ACCOUNT_TYPE_LABELS[accountFull.account_type] ?? accountFull.account_type})` : accountName}
                </span>
              )}
              {memberName && <span style={{ fontSize: '0.75rem', color: '#475569' }}>· {memberName}</span>}
              {instrumentName && <span style={{ fontSize: '0.75rem', color: '#475569' }}>· {instrumentName}</span>}
            </div>
          )}
          {t.external_reference && (
            <div style={{ marginTop: '0.15rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40rem' }}>
              {t.external_reference}
            </div>
          )}
        </button>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          {canWrite && (
            <button
              type="button"
              onClick={onEdit}
              title="Edit transaction"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#64748b', fontSize: '0.8rem' }}
            >
              ✏️
            </button>
          )}
          <DeleteButton disabled={!canDelete} onDelete={onDelete} />
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', color: '#334155' }}>
          {gmailMeta ? (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {gmailMeta.from && <tr><td style={{ color: '#64748b', paddingRight: '0.75rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>From</td><td>{gmailMeta.from}</td></tr>}
                {gmailMeta.to && <tr><td style={{ color: '#64748b', paddingRight: '0.75rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>To</td><td>{gmailMeta.to}</td></tr>}
                {gmailMeta.subject && <tr><td style={{ color: '#64748b', paddingRight: '0.75rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>Subject</td><td>{gmailMeta.subject}</td></tr>}
                {gmailMeta.snippet && <tr><td style={{ color: '#64748b', paddingRight: '0.75rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>Preview</td><td style={{ color: '#475569' }}>{gmailMeta.snippet}</td></tr>}
                {gmailMeta.message_id && <tr><td style={{ color: '#64748b', paddingRight: '0.75rem', whiteSpace: 'nowrap', verticalAlign: 'top' }}>Message ID</td><td style={{ fontSize: '0.7rem', color: '#94a3b8', wordBreak: 'break-all' }}>{gmailMeta.message_id}</td></tr>}
              </tbody>
            </table>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                <tr><td style={{ color: '#64748b', paddingRight: '0.75rem' }}>Source</td><td>{t.source === 'csv' ? 'Imported from CSV' : 'Manually entered'}</td></tr>
                {accountFull && <tr><td style={{ color: '#64748b', paddingRight: '0.75rem' }}>Account type</td><td>{ACCOUNT_TYPE_LABELS[accountFull.account_type] ?? accountFull.account_type}{accountFull.institution_name ? ` · ${accountFull.institution_name}` : ''}</td></tr>}
                {t.quantity && <tr><td style={{ color: '#64748b', paddingRight: '0.75rem' }}>Quantity</td><td>{t.quantity}{t.price_per_unit ? ` @ ₹${t.price_per_unit}` : ''}</td></tr>}
                {(parseFloat(t.fees) > 0 || parseFloat(t.taxes) > 0) && <tr><td style={{ color: '#64748b', paddingRight: '0.75rem' }}>Fees/Taxes</td><td>₹{t.fees} / ₹{t.taxes}</td></tr>}
                {t.idempotency_key && <tr><td style={{ color: '#64748b', paddingRight: '0.75rem' }}>Key</td><td style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{t.idempotency_key}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  )
}

export function LedgerPage({ householdId, memberOptions, accountOptions, instrumentOptions, onRefreshDashboard, canDelete }: Props) {
  const { canWrite } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [fullAccounts, setFullAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [snapshotPrompt, setSnapshotPrompt] = useState(false)

  // Create form visibility
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<TxForm>(blankForm())

  // Inline edit state: null = no edit open, number = transaction id being edited
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<TxForm>(blankForm())

  const loadData = async () => {
    try {
      const [data, accs] = await Promise.all([
        ledgerApi.listTransactions(householdId),
        getJson<Account[] | { results: Account[] }>(`/api/accounts/?household=${householdId}`),
      ])
      setTransactions(data)
      setFullAccounts(Array.isArray(accs) ? accs : accs.results ?? [])
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

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
      await loadData()
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
      await loadData()
      await onRefreshDashboard()
    } catch (e) {
      setFormError(normalizeApiError(e))
    }
  }

  return (
    <>
      {snapshotPrompt && (
        <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: '6px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
          <span>Net worth has changed — take a snapshot to record today's value?</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => { setSnapshotPrompt(false); window.location.hash = '#/valuation' }}>Go to Valuation</button>
            <button className="secondary-btn" onClick={() => setSnapshotPrompt(false)}>Dismiss</button>
          </div>
        </div>
      )}
      {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}

      <EntityPageLayout
        title="Transactions"
        subtitle="Immutable ledger entries"
        list={
          <article className="panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0 }}>Recent Transactions</h3>
              {canWrite && (
                <button type="button" className="primary-btn" style={{ fontSize: '0.8rem', padding: '4px 12px' }} onClick={() => { setShowCreate(v => !v); setFormError('') }}>
                  {showCreate ? 'Cancel' : '+ Add Transaction'}
                </button>
              )}
            </div>

            {showCreate && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: '#334155' }}>New Transaction</p>
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
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: '#92400e' }}>Editing #{editingId}</p>
                <TxFormFields
                  form={editForm} onChange={setEditForm}
                  accountOptions={accountOptions} memberOptions={memberOptions} instrumentOptions={instrumentOptions}
                  error={formError} submitLabel="Update" canWrite={canWrite}
                  onSubmit={saveEdit}
                  onCancel={() => { setEditingId(null); setFormError('') }}
                />
              </div>
            )}

            <ul className="simple-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {transactions.slice().reverse().slice(0, 50).map((t) => (
                <TransactionRow
                  key={t.id}
                  t={t}
                  accountOptions={accountOptions}
                  memberOptions={memberOptions}
                  instrumentOptions={instrumentOptions}
                  accounts={fullAccounts}
                  canDelete={canDelete('transaction')}
                  canWrite={canWrite}
                  onEdit={() => openEdit(t)}
                  onDelete={async () => { await ledgerApi.deleteTransaction(t.id); await loadData(); await onRefreshDashboard() }}
                />
              ))}
            </ul>
          </article>
        }
        form={null}
      />
    </>
  )
}
