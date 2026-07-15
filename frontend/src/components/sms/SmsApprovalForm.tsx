import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { InstrumentOption, OptionItem, SmsMessage } from '../../types/domain'
import { smsApi } from '../../api/smsApi'
import type { SmsApprovalOverrides } from '../../api/smsApi'
import { expenseApi } from '../../api/expenseApi'
import { useApp } from '../../context/AppContext'
import { QuickExpenseForm } from '../expenses/QuickExpenseForm'
import { normalizeApiError } from '../../hooks/errorUtils'
import { useEffect } from 'react'
import type { ExpenseCategory } from '../../types/domain'
import type { QuickFormSavePayload } from '../expenses/QuickExpenseForm'

type Props = {
  message: SmsMessage
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
  instrumentOptions: InstrumentOption[]
  onApproved: (transactionId: number | undefined) => void
  onCancel: () => void
  /** Optional queue navigation — lets the user move between pending messages without closing. */
  position?: { current: number; total: number }
  hasPrev?: boolean
  hasNext?: boolean
  onPrev?: () => void
  onNext?: () => void
  onReject?: () => void
}

type ApprovalMode = 'transaction' | 'balance' | 'investment'

function ConfidencePill({ value }: { value: number | null }) {
  if (value === null) return <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">No match</span>
  const pct = Math.round(value * 100)
  const color = value >= 0.7 ? 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-300 text-emerald-700 dark:text-emerald-300'
    : value >= 0.4 ? 'bg-amber-50 dark:bg-amber-900/15 border-amber-300 text-amber-700 dark:text-amber-300'
    : 'bg-red-50 dark:bg-red-900/15 border-red-300 text-red-700 dark:text-red-300'
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`} title="Auto-detection confidence">
      {pct}% match
    </span>
  )
}

const INP = 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500'

export function SmsApprovalForm({ message, accountOptions, memberOptions, instrumentOptions, onApproved, onCancel, position, hasPrev, hasNext, onPrev, onNext, onReject }: Props) {
  const { householdId } = useApp()
  const tx = message.parsed_tx ?? {}

  const bodyLower = message.body.toLowerCase()
  const looksLikeBalance = /\b(balance|avl bal|avail bal|available balance|closing bal)\b/.test(bodyLower) && !tx.amount
  const looksLikeSip = /\b(sip|mutual fund|mf|nav|units|folio)\b/.test(bodyLower)
  const defaultMode: ApprovalMode = looksLikeBalance ? 'balance' : looksLikeSip ? 'investment' : 'transaction'
  const [mode, setMode] = useState<ApprovalMode>(defaultMode)

  // Balance mode state
  const [account, setAccount] = useState(tx.account ?? '')
  const [txDate, setTxDate] = useState(tx.tx_date || message.received_at.slice(0, 10))
  const [balance, setBalance] = useState(tx.amount ?? '')
  const [balanceNotes, setBalanceNotes] = useState('')

  // Investment mode state
  const [instrument, setInstrument] = useState(String(tx.instrument ?? ''))
  const [investAmount, setInvestAmount] = useState(tx.amount ?? '')
  const [investMember, setInvestMember] = useState(tx.member ?? (message.owner ? String(message.owner) : ''))
  const [quantity, setQuantity] = useState('')
  const [investAccount, setInvestAccount] = useState(tx.account ?? '')
  const [investAffectsBalance, setInvestAffectsBalance] = useState(true)

  // Transaction mode — categories for QuickExpenseForm
  const [spendCategories, setSpendCategories] = useState<ExpenseCategory[]>([])
  useEffect(() => {
    if (!householdId) return
    expenseApi.listCategories(householdId).then(setSpendCategories).catch(() => {})
  }, [householdId])

  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Keyboard arrow navigation between queued messages (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in a field
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight' && hasNext) onNext?.()
      if (e.key === 'ArrowLeft' && hasPrev) onPrev?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasNext, hasPrev, onNext, onPrev])

  // Swipe navigation (mobile): swipe left → next, swipe right → prev
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!swipeStart.current) return
    const dx = e.changedTouches[0].clientX - swipeStart.current.x
    const dy = e.changedTouches[0].clientY - swipeStart.current.y
    swipeStart.current = null
    // Horizontal swipe, ignore mostly-vertical drags
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && hasNext) onNext?.()
      else if (dx > 0 && hasPrev) onPrev?.()
    }
  }

  // Instrument filtering for investment mode
  const linkedInstruments = investAccount
    ? instrumentOptions.filter((i) => !i.default_account || String(i.default_account) === investAccount)
    : instrumentOptions
  const otherInstruments = investAccount
    ? instrumentOptions.filter((i) => i.default_account && String(i.default_account) !== investAccount)
    : []
  const filteredInstruments = (investAccount && linkedInstruments.length === 0) ? instrumentOptions : linkedInstruments

  const handleInstrumentChange = (id: string) => {
    setInstrument(id)
    if (id) {
      const found = instrumentOptions.find((i) => String(i.id) === id)
      if (found?.default_account && !investAccount) setInvestAccount(String(found.default_account))
    }
  }
  const handleInvestAccountChange = (id: string) => {
    setInvestAccount(id)
    if (instrument) {
      const found = instrumentOptions.find((i) => String(i.id) === instrument)
      if (found?.default_account && String(found.default_account) !== id) setInstrument('')
    }
  }

  // Called by QuickExpenseForm on submit
  const handleTransactionSave = async (payload: QuickFormSavePayload) => {
    setSaving(true)
    setError('')
    try {
      const overrides: SmsApprovalOverrides = {
        account: payload.account ? String(payload.account) : undefined,
        member: payload.member ? String(payload.member) : undefined,
        direction: payload.direction,
        amount: payload.amount,
        transaction_type: payload.transaction_type,
        tx_date: payload.tx_date,
        classification: payload.classification as SmsApprovalOverrides['classification'],
        affects_balance: payload.affects_balance,
        spend_category: payload.spend_category ?? '',
        description: payload.description ?? '',
        notes: payload.notes ?? '',
        external_reference: '',
        tags: payload.tags && payload.tags.length > 0 ? payload.tags : undefined,
      }
      const result = await smsApi.approveStaged(message.id, overrides)
      onApproved(result.transaction_id)
    } catch (e) {
      setError(normalizeApiError(e))
      throw e
    } finally {
      setSaving(false)
    }
  }

  const handleBalanceSave = async () => {
    if (!account) { setError('Select an account.'); return }
    if (!balance) { setError('Enter a balance amount.'); return }
    setBusy(true)
    setError('')
    try {
      const result = await smsApi.recordBalance(message.id, {
        account,
        balance,
        valuation_date: txDate,
        notes: balanceNotes,
      })
      onApproved(result.transaction_id)
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setBusy(false)
    }
  }

  const handleInvestmentSave = async () => {
    if (!investAccount) { setError('Select a debit account.'); return }
    if (!instrument) { setError('Select an instrument.'); return }
    if (!investAmount) { setError('Enter an amount.'); return }
    setBusy(true)
    setError('')
    try {
      const overrides: SmsApprovalOverrides = {
        account: investAccount,
        member: investMember || undefined,
        direction: 'outflow',
        amount: investAmount,
        transaction_type: 'buy',
        tx_date: txDate,
        instrument,
        affects_balance: investAffectsBalance,
        ...(quantity ? { quantity } : {}),
      }
      const result = await smsApi.approveStaged(message.id, overrides)
      onApproved(result.transaction_id)
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />

      {/* Modal — bottom sheet on mobile, centered on desktop */}
      <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:p-4">
        <div
          className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-[var(--surface)] shadow-[var(--shadow-modal)] md:max-h-[88vh] md:rounded-2xl"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)]">
                Approve SMS
                {position && (
                  <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{position.current} of {position.total}</span>
                )}
              </p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                {message.sender} · {message.received_at.slice(0, 10)}{message.device_id && ` · 📱 ${message.device_id}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ConfidencePill value={message.confidence} />
              {/* Queue navigation */}
              {(onPrev || onNext) && (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={onPrev}
                    disabled={!hasPrev}
                    title="Previous (←)"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-30"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={onNext}
                    disabled={!hasNext}
                    title="Next (→)"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-30"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </button>
                </div>
              )}
              <button type="button" onClick={onCancel} className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">✕</button>
            </div>
          </div>

          <div className="main-content-sheet flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {/* Original SMS body */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="whitespace-pre-wrap text-xs text-[var(--text-muted)]">{message.body}</p>
            </div>

            {/* Quick queue actions: reject / skip to next */}
            {(onReject || onNext) && (
              <div className="flex items-center justify-between gap-2">
                {onReject ? (
                  <button
                    type="button"
                    onClick={onReject}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:bg-rose-900/15 dark:border-rose-800/40 dark:text-rose-400 dark:hover:bg-rose-900/20"
                  >
                    ✕ Reject &amp; next
                  </button>
                ) : <span />}
                {onNext && hasNext && (
                  <button
                    type="button"
                    onClick={onNext}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                  >
                    Skip →
                  </button>
                )}
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
              {([
                { key: 'transaction', label: '💳 Transaction' },
                { key: 'balance', label: '🏦 Balance' },
                { key: 'investment', label: '📊 Investment' },
              ] as { key: ApprovalMode; label: string }[]).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                    mode === m.key
                      ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* ── Transaction mode: reuse QuickExpenseForm ── */}
            {mode === 'transaction' && (
              <QuickExpenseForm
                householdId={householdId}
                memberOptions={memberOptions}
                accountOptions={accountOptions}
                categories={spendCategories}
                initialClassification={
                  tx.classification === 'income' ? 'income'
                  : tx.classification === 'internal_transfer' ? 'internal_transfer'
                  : tx.classification === 'tracking' ? 'tracking'
                  : 'spend'
                }
                onSave={handleTransactionSave}
                onCancel={onCancel}
                saving={saving}
                error={error}
              />
            )}

            {/* ── Balance mode ── */}
            {mode === 'balance' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Account *</span>
                    <select value={account} onChange={(e) => setAccount(e.target.value)} className={INP}>
                      <option value="">— select —</option>
                      {accountOptions.map((a) => <option key={a.id} value={String(a.id)}>{a.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Date *</span>
                    <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className={INP} />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Balance (₹) *</span>
                  <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="e.g. 12450.00" className={INP} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Notes</span>
                  <input type="text" value={balanceNotes} onChange={(e) => setBalanceNotes(e.target.value)} placeholder="Optional" className={INP} />
                </label>
                <p className="text-[11px] text-[var(--text-muted)]">Records a balance snapshot — useful for bank balance alerts.</p>
                {error && <p className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/15 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => void handleBalanceSave()} disabled={busy}
                    className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40">
                    {busy ? 'Saving…' : 'Save Balance'}
                  </button>
                  <button type="button" onClick={onCancel} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]">Cancel</button>
                </div>
              </div>
            )}

            {/* ── Investment mode ── */}
            {mode === 'investment' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Debit Account *</span>
                    <select value={investAccount} onChange={(e) => handleInvestAccountChange(e.target.value)} className={INP}>
                      <option value="">— select —</option>
                      {accountOptions.map((a) => <option key={a.id} value={String(a.id)}>{a.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Date *</span>
                    <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className={INP} />
                  </label>
                </div>
                {investAccount && (
                  <label className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={investAffectsBalance}
                      onChange={(e) => setInvestAffectsBalance(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border)] text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-xs text-[var(--text-2)]">
                      <span className="font-medium">Deduct from account balance</span>
                      <br />
                      <span className="text-[var(--text-muted)]">
                        Turn off if this account never actually held the money (e.g. NPS debited straight from payroll) — still recorded and tagged to the account, just excluded from its balance.
                      </span>
                    </span>
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Instrument (Fund / Stock) *</span>
                  <select value={instrument} onChange={(e) => handleInstrumentChange(e.target.value)} className={INP}>
                    <option value="">— select —</option>
                    {investAccount ? (
                      <>
                        {filteredInstruments.length > 0 && (
                          <optgroup label="Linked to selected account">
                            {filteredInstruments.map((i) => <option key={i.id} value={String(i.id)}>{i.label}</option>)}
                          </optgroup>
                        )}
                        {otherInstruments.length > 0 && (
                          <optgroup label="Other accounts">
                            {otherInstruments.map((i) => <option key={i.id} value={String(i.id)}>{i.label}</option>)}
                          </optgroup>
                        )}
                      </>
                    ) : instrumentOptions.map((i) => <option key={i.id} value={String(i.id)}>{i.label}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Amount Invested (₹) *</span>
                    <input type="number" step="0.01" value={investAmount} onChange={(e) => setInvestAmount(e.target.value)} placeholder="e.g. 5000.00" className={INP} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Units (optional)</span>
                    <input type="number" step="0.000001" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Leave blank if unknown" className={INP} />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Member</span>
                  <select value={investMember} onChange={(e) => setInvestMember(e.target.value)} className={INP}>
                    <option value="">— unassigned —</option>
                    {memberOptions.map((m) => <option key={m.id} value={String(m.id)}>{m.label}</option>)}
                  </select>
                </label>
                {error && <p className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/15 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => void handleInvestmentSave()} disabled={busy}
                    className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40">
                    {busy ? 'Saving…' : 'Record Investment'}
                  </button>
                  <button type="button" onClick={onCancel} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
