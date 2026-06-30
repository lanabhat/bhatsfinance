import { useState } from 'react'
import { alertsApi } from '../../api/alertsApi'
import { DateField, SelectField } from '../common/FormField'
import { Money } from '../common/Money'
import { normalizeApiError } from '../../hooks/errorUtils'
import type { MissedSipAlert, OptionItem } from '../../types/domain'

type Props = {
  alerts: MissedSipAlert[]
  accountOptions: OptionItem[]
  onClose: () => void
  onPaid: () => void | Promise<void>
}

const ACCOUNT_MODE = {
  PER_MANDATE: '_each',
} as const

export function MarkAllSipsPaidSheet({ alerts, accountOptions, onClose, onPaid }: Props) {
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [deduct, setDeduct] = useState(true)
  const [updateHolding, setUpdateHolding] = useState(true)
  const [accountChoice, setAccountChoice] = useState<string>(ACCOUNT_MODE.PER_MANDATE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalAmount = alerts.reduce((s, a) => s + parseFloat(a.expected_amount || '0'), 0)

  const accountSelectOptions: OptionItem[] = [
    { id: -1 as unknown as number, label: 'Each mandate’s default account' },
    ...accountOptions,
  ]

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const useGlobalAccount = accountChoice !== ACCOUNT_MODE.PER_MANDATE
      const globalAccountId = useGlobalAccount ? Number(accountChoice) : undefined
      await alertsApi.markAllSipsPaid({
        items: alerts.map((a) => ({ mandate_id: a.mandate_id, due_date: a.due_date })),
        deduct,
        update_holding: updateHolding,
        paid_on: paidOn,
        account_id: globalAccountId,
      })
      await onPaid()
      onClose()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  // SelectField uses numeric ids; we encode the "per mandate" sentinel as -1 and
  // map to the string sentinel before storing.
  const selectValue = accountChoice === ACCOUNT_MODE.PER_MANDATE ? '-1' : accountChoice

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-[var(--surface)] shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-base font-semibold text-[var(--text)]">Mark all SIPs as paid</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {alerts.length} item{alerts.length === 1 ? '' : 's'} · total <Money value={totalAmount} />
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xl text-[var(--text-muted)] hover:text-[var(--text-2)]">&times;</button>
        </div>
        <div className="space-y-3 px-5 py-4">
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
                value={selectValue}
                onChange={(v) => setAccountChoice(v === '-1' ? ACCOUNT_MODE.PER_MANDATE : v)}
                options={accountSelectOptions}
              />
              <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                <input
                  type="checkbox"
                  checked={updateHolding}
                  onChange={(e) => setUpdateHolding(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border-2)] text-primary-600 focus:ring-primary-500"
                />
                <span>Update holdings (BUY units when supported)</span>
              </label>
              <p className="text-[11px] text-[var(--text-muted)]">
                Bulk doesn’t collect per-row quantities — units aren’t added. Use the per-row "Mark paid" if you need to record specific quantities.
              </p>
            </>
          )}
          {!deduct && (
            <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
              All selected SIPs will be acknowledged without any transactions. No effect on net worth or account balances.
            </p>
          )}

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Affected SIPs</p>
            <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-[var(--text-2)]">
              {alerts.map((a) => (
                <li key={`${a.mandate_id}-${a.due_date}`} className="flex justify-between">
                  <span className="truncate">{a.instrument} · {a.due_date}</span>
                  <span className="ml-2 shrink-0"><Money value={a.expected_amount} /></span>
                </li>
              ))}
            </ul>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex gap-2 border-t border-[var(--border)] px-5 py-4">
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
            {saving ? 'Saving…' : `Mark ${alerts.length} paid`}
          </button>
        </div>
      </div>
    </div>
  )
}
