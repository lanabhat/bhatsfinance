import { DateField, MoneyInput, SelectField, TextField } from '../common/FormField'
import { TOOLTIPS } from '../../data/helpContent'
import type { OptionItem } from '../../types/domain'
import { CLASSIFICATION_OPTIONS, TX_TYPES, classificationId, classificationLabel, txTypeId, txTypeLabel, type TxForm } from './txForm'

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
