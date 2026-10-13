import type { OptionItem, Transaction } from '../../types/domain'

// Form state and option lists for TxFormFields (TransactionEditForm.tsx).

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
