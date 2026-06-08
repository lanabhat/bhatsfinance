import { useState } from 'react'
import { alertsApi } from '../../api/alertsApi'
import { DateField, MoneyInput, SelectField, TextField } from '../common/FormField'
import { normalizeApiError } from '../../hooks/errorUtils'
import type { MissedSipAlert, OptionItem } from '../../types/domain'

type Props = {
  alert: MissedSipAlert
  accountOptions: OptionItem[]
  onClose: () => void
  onPaid: () => void | Promise<void>
}

export function MarkSipPaidSheet({ alert, accountOptions, onClose, onPaid }: Props) {
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState<number>(alert.account_id)
  const [amount, setAmount] = useState(alert.expected_amount)
  const [deduct, setDeduct] = useState(true)
  const [updateHolding, setUpdateHolding] = useState(true)
  const [quantity, setQuantity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      await alertsApi.markSipPaid(alert.mandate_id, {
        due_date: alert.due_date,
        paid_on: paidOn,
        account_id: deduct ? accountId : undefined,
        amount: deduct ? amount : undefined,
        quantity: deduct && updateHolding && quantity ? quantity : null,
        update_holding: deduct ? updateHolding : false,
        deduct,
      })
      await onPaid()
      onClose()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-base font-semibold text-slate-900">Mark SIP as Paid</p>
            <p className="mt-0.5 text-xs text-slate-500">{alert.instrument} · due {alert.due_date}</p>
          </div>
          <button type="button" onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">&times;</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <DateField label="Paid On" value={paidOn} onChange={setPaidOn} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={deduct}
              onChange={(e) => setDeduct(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span>Deduct amount from a tracked account</span>
          </label>
          {deduct && (
            <>
              <SelectField
                label="Source Account"
                value={String(accountId)}
                onChange={(v) => setAccountId(Number(v))}
                options={accountOptions}
              />
              <MoneyInput label="Amount" value={amount} onChange={setAmount} />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={updateHolding}
                  onChange={(e) => setUpdateHolding(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span>Update holding (add units to investment)</span>
              </label>
              {updateHolding && (
                <TextField
                  label="Quantity (optional)"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={quantity}
                  onChange={setQuantity}
                />
              )}
            </>
          )}
          {!deduct && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              The alert will clear without recording a transaction. No effect on net worth or account balances.
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Mark Paid'}
          </button>
        </div>
      </div>
    </div>
  )
}
