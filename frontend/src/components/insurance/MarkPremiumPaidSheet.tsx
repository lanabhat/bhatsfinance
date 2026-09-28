import { useEffect, useState } from 'react'
import { insuranceApi } from '../../api/insuranceApi'
import { DateField, MoneyInput, SelectField } from '../common/FormField'
import { normalizeApiError } from '../../hooks/errorUtils'
import type { MissedPremiumAlert, OptionItem, SmsPaymentMatch } from '../../types/domain'

type Props = {
  alert: MissedPremiumAlert
  accountOptions: OptionItem[]
  onClose: () => void
  onPaid: () => void | Promise<void>
}

export function MarkPremiumPaidSheet({ alert, accountOptions, onClose, onPaid }: Props) {
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState<string>('')
  const [amount, setAmount] = useState(alert.premium_amount)
  const [deduct, setDeduct] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [smsMatches, setSmsMatches] = useState<SmsPaymentMatch[]>([])
  const [selectedSmsId, setSelectedSmsId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    insuranceApi.listSmsMatches(alert.policy_id, alert.due_date).then((matches) => {
      if (!cancelled) setSmsMatches(matches)
    }).catch(() => { /* silent — suggestion is a convenience, not required */ })
    return () => { cancelled = true }
  }, [alert.policy_id, alert.due_date])

  const applySuggestion = (match: SmsPaymentMatch) => {
    setSelectedSmsId(match.sms_id)
    setPaidOn(match.received_at.slice(0, 10))
    if (match.matched_amount) setAmount(match.matched_amount)
  }

  const submit = async () => {
    if (deduct && !accountId) {
      setError('Select an account to deduct from.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await insuranceApi.markPremiumPaid(alert.policy_id, {
        due_date: alert.due_date,
        paid_on: paidOn,
        account_id: deduct ? Number(accountId) : undefined,
        amount: deduct ? amount : undefined,
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
      <div className="w-full max-w-md rounded-t-2xl bg-[var(--surface)] shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-base font-semibold text-[var(--text)]">Mark Premium as Paid</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {alert.policy_name}
              {alert.policy_number ? ` · ${alert.policy_number}` : ''}
              {' · due '}{alert.due_date}
            </p>
            {alert.member_name && (
              <p className="text-xs text-[var(--text-muted)]">Insured: {alert.member_name}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-xl text-[var(--text-muted)] hover:text-[var(--text-2)]">&times;</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {smsMatches.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <p className="text-xs font-medium text-[var(--text-2)]">Suggested from SMS</p>
              {smsMatches.map((match) => (
                <button
                  key={match.sms_id}
                  type="button"
                  onClick={() => applySuggestion(match)}
                  className={`block w-full rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                    selectedSmsId === match.sms_id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-[var(--border)] hover:bg-[var(--surface)]'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-[var(--text)]">{match.sender}</span>
                    <span className="shrink-0 text-[var(--text-muted)]">{match.received_at.slice(0, 10)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[var(--text-muted)]">{match.body}</span>
                  {match.confidence === 'low' && (
                    <span className="mt-0.5 block text-[10px] text-amber-600 dark:text-amber-400">Amount match only — policy number not found in message</span>
                  )}
                </button>
              ))}
              <p className="text-[10px] text-[var(--text-faint)]">Selecting a suggestion only fills the form below — it won't change the original SMS message.</p>
            </div>
          )}
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
                value={accountId}
                onChange={setAccountId}
                options={accountOptions}
                placeholder="Select account"
              />
              <MoneyInput label="Amount" value={amount} onChange={setAmount} />
            </>
          )}
          {!deduct && (
            <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
              The reminder will clear without recording a transaction. No effect on net worth or account balances.
            </p>
          )}
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
            {saving ? 'Saving…' : 'Mark Paid'}
          </button>
        </div>
      </div>
    </div>
  )
}
