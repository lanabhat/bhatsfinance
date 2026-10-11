import { useState } from 'react'
import { insuranceApi } from '../../api/insuranceApi'
import { DateField, SelectField } from '../common/FormField'
import { normalizeApiError } from '../../hooks/errorUtils'
import type { MissedPremiumAlert, OptionItem } from '../../types/domain'
import { Sheet } from '../ui/Sheet'

type Props = {
  items: MissedPremiumAlert[]
  accountOptions: OptionItem[]
  onClose: () => void
  onDone: () => void | Promise<void>
}

export function BulkPremiumSheet({ items, accountOptions, onClose, onDone }: Props) {
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!accountId) {
      setError('Select an account to deduct premiums from.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await Promise.all(
        items.map((item) =>
          insuranceApi.markPremiumPaid(item.policy_id, {
            due_date: item.due_date,
            paid_on: paidOn,
            account_id: Number(accountId),
            amount: item.premium_amount,
            deduct: true,
          })
        )
      )
      await onDone()
      onClose()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const total = items.reduce((s, i) => s + parseFloat(i.premium_amount || '0'), 0)

  return (
    <Sheet
      title="Mark All Premiums Paid"
      subtitle={<>
        <p>
          {items.length} {items.length === 1 ? 'premium' : 'premiums'} · total ₹{total.toLocaleString('en-IN')}
        </p>
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
          {saving ? 'Saving…' : `Mark ${items.length} Paid`}
        </button>
      </>}
    >
      <div className="mb-3 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] px-3 py-1">
        {items.map((item) => (
          <div key={`${item.policy_id}-${item.due_date}`} className="flex items-center justify-between py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[var(--text)]">{item.policy_name}</p>
              <p className="text-xs text-[var(--text-muted)]">due {item.due_date}</p>
            </div>
            <p className="shrink-0 text-sm font-medium text-[var(--text-2)]">
              {parseFloat(item.premium_amount) > 0 ? `₹${parseFloat(item.premium_amount).toLocaleString('en-IN')}` : '—'}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <DateField label="Paid On" value={paidOn} onChange={setPaidOn} />
        <SelectField
          label="Deduct From Account"
          value={accountId}
          onChange={setAccountId}
          options={accountOptions}
          placeholder="Select account"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </Sheet>
  )
}
