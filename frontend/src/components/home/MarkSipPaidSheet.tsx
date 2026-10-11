import { useState } from 'react'
import { alertsApi } from '../../api/alertsApi'
import { DateField, MoneyInput, SelectField, TextField } from '../common/FormField'
import { normalizeApiError } from '../../hooks/errorUtils'
import type { MissedSipAlert, OptionItem } from '../../types/domain'
import { Sheet } from '../ui/Sheet'

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
  const [deduct, setDeduct] = useState(false)
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
    <Sheet
      title="Mark SIP as Paid"
      subtitle={<>
        <p>{alert.instrument} · due {alert.due_date}</p>
      </>}
      onClose={onClose}
      footer={<>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
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
      </>}
    >
      <div className="space-y-3">
        <DateField label="Paid On" value={paidOn} onChange={setPaidOn} />
        <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
          <input
            type="checkbox"
            checked={deduct}
            onChange={(e) => setDeduct(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border-2)] text-primary-600 focus:ring-primary-500"
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
            <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
              <input
                type="checkbox"
                checked={updateHolding}
                onChange={(e) => setUpdateHolding(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border-2)] text-primary-600 focus:ring-primary-500"
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
          <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
            The alert will clear without recording a transaction. No effect on net worth or account balances.
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </Sheet>
  )
}
