import { useEffect, useState } from 'react'
import { smsApi } from '../../api/smsApi'
import { valuationApi } from '../../api/valuationApi'
import { normalizeApiError } from '../../hooks/errorUtils'
import type { Account, SmsMessage } from '../../types/domain'

type Props = {
  account: Account
  householdId: number
  onSave: () => void
  onCancel: () => void
}

const INP = 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500'

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function UpdateBalanceForm({ account, householdId, onSave, onCancel }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [balance, setBalance] = useState('')
  const [valuationDate, setValuationDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [showSmsPicker, setShowSmsPicker] = useState(false)
  const [smsLoading, setSmsLoading] = useState(false)
  const [candidates, setCandidates] = useState<SmsMessage[]>([])
  const [linkedSms, setLinkedSms] = useState<SmsMessage | null>(null)

  useEffect(() => {
    if (!showSmsPicker || !householdId) return
    setSmsLoading(true)
    const sender = account.institution_name?.trim()
    smsApi.listMessagesPage(householdId, {
      status: 'pending',
      search: sender || account.name,
      ordering: '-received_at',
      page_size: 20,
    })
      .then((res) => setCandidates(res.results))
      .catch(() => setCandidates([]))
      .finally(() => setSmsLoading(false))
  }, [showSmsPicker, householdId, account.institution_name, account.name])

  const pickSms = (msg: SmsMessage) => {
    setLinkedSms(msg)
    setShowSmsPicker(false)
    if (msg.parsed_tx?.amount) setBalance(msg.parsed_tx.amount)
    setValuationDate(msg.received_at.slice(0, 10))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!balance) { setError('Enter a balance amount.'); return }
    setSaving(true)
    setError('')
    try {
      if (linkedSms) {
        await smsApi.recordBalance(linkedSms.id, { account: String(account.id), balance, valuation_date: valuationDate, notes })
      } else {
        await valuationApi.createValuation({
          household: householdId,
          account: account.id,
          instrument: null,
          unit_price: null,
          market_value: null,
          balance,
          valuation_date: valuationDate,
          source: 'manual',
          notes,
        })
      }
      onSave()
    } catch (e2) {
      setError(normalizeApiError(e2))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Balance (₹) *</span>
          <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="e.g. 12450.00" className={INP} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Date *</span>
          <input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} className={INP} required />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Notes</span>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={INP} />
      </label>

      {/* SMS link */}
      <div className="rounded-xl border border-[var(--border)] p-3">
        {linkedSms ? (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-2)]">Linked SMS</p>
              <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{linkedSms.sender} · {formatDateTime(linkedSms.received_at)}</p>
              <p className="mt-1 line-clamp-2 text-[11px] text-[var(--text-faint)]">{linkedSms.body}</p>
            </div>
            <button type="button" onClick={() => setLinkedSms(null)} className="shrink-0 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400">Unlink</button>
          </div>
        ) : showSmsPicker ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--text-2)]">Choose a related SMS</p>
              <button type="button" onClick={() => setShowSmsPicker(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">Cancel</button>
            </div>
            {smsLoading ? (
              <p className="py-3 text-center text-xs text-[var(--text-muted)]">Loading…</p>
            ) : candidates.length === 0 ? (
              <p className="py-3 text-center text-xs text-[var(--text-muted)]">No pending SMS found for this account.</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {candidates.map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => pickSms(msg)}
                    className="block w-full rounded-lg border border-[var(--border)] px-2.5 py-2 text-left hover:bg-[var(--surface-2)]"
                  >
                    <p className="text-xs font-medium text-[var(--text)]">{msg.sender} · {formatDateTime(msg.received_at)}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--text-muted)]">{msg.body}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setShowSmsPicker(true)} className="w-full text-left text-xs font-medium text-primary-600 hover:underline dark:text-primary-400">
            + Link a related SMS (marks it processed)
          </button>
        )}
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/15 dark:border-rose-800/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save Balance'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]">Cancel</button>
      </div>
    </form>
  )
}
