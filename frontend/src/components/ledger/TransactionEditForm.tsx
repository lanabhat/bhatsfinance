import { DateField, MoneyInput, SelectField, TextField } from '../common/FormField'
import { TOOLTIPS } from '../../data/helpContent'
import type { OptionItem, Transaction } from '../../types/domain'

export type TxForm = {
  member: string
  account: string
  instrument: string
  tx_date: string
  amount: string
  quantity: string
  price_per_unit: string
  transaction_type: string
  external_reference: string
  classification: string
}

export const TX_TYPES: OptionItem[] = [
  'deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'interest', 'salary',
  'tax_payment', 'tax_refund', 'emi', 'loan_disbursal', 'premium', 'other',
].map((x, i) => ({ id: i + 1, label: x }))

export const CLASSIFICATION_OPTIONS: OptionItem[] = [
  { id: 1, label: 'spend' }, { id: 2, label: 'income' }, { id: 3, label: 'internal_transfer' }, { id: 4, label: 'tracking' },
]

export function blankTxForm(): TxForm {
  return {
    member: '', account: '', instrument: '',
    tx_date: new Date().toISOString().slice(0, 10),
    amount: '', quantity: '', price_per_unit: '',
    transaction_type: 'buy', external_reference: '', classification: '',
  }
}

export function txFormFromTransaction(t: Transaction): TxForm {
  return {
    member: t.member ? String(t.member) : '',
    account: t.account ? String(t.account) : '',
    instrument: t.instrument ? String(t.instrument) : '',
    tx_date: t.tx_date,
    amount: t.amount,
    quantity: t.quantity || '',
    price_per_unit: t.price_per_unit || '',
    transaction_type: t.transaction_type,
    external_reference: t.external_reference,
    classification: t.classification || '',
  }
}

export function txTypeId(label: string) { return String(TX_TYPES.find(x => x.label === label)?.id || 3) }
export function txTypeLabel(id: string) { return TX_TYPES.find(x => x.id === Number(id))?.label || 'buy' }

export function classificationId(label: string) { return label ? String(CLASSIFICATION_OPTIONS.find(x => x.label === label)?.id ?? '') : '' }
export function classificationLabel(id: string) { return id ? CLASSIFICATION_OPTIONS.find(x => x.id === Number(id))?.label ?? '' : '' }

export function TxFormFields({ form, onChange, accountOptions, memberOptions, instrumentOptions, error, submitLabel, onSubmit, onCancel, canWrite }: {
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
        <SelectField
          label="Classification"
          value={classificationId(form.classification)}
          onChange={v => onChange({ ...form, classification: classificationLabel(v) })}
          options={CLASSIFICATION_OPTIONS}
          placeholder="Unset"
        />
      </div>
      <TextField label="Reference / Note" value={form.external_reference} onChange={set('external_reference')} />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" onClick={onSubmit} disabled={!canWrite} className="primary-btn">{submitLabel}</button>
        <button type="button" onClick={onCancel} className="secondary-btn">Cancel</button>
      </div>
    </>
  )
}
