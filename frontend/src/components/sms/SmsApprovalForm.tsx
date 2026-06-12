import { useState } from 'react'
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
}

type ApprovalMode = 'transaction' | 'balance' | 'investment'

function ConfidencePill({ value }: { value: number | null }) {
  if (value === null) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">No match</span>
  const pct = Math.round(value * 100)
  const color = value >= 0.7 ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
    : value >= 0.4 ? 'bg-amber-50 border-amber-300 text-amber-700'
    : 'bg-red-50 border-red-300 text-red-700'
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`} title="Auto-detection confidence">
      {pct}% match
    </span>
  )
}

const INP = 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500'

export function SmsApprovalForm({ message, accountOptions, memberOptions, instrumentOptions, onApproved, onCancel }: Props) {
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

  // Transaction mode — categories for QuickExpenseForm
  const [spendCategories, setSpendCategories] = useState<ExpenseCategory[]>([])
  useEffect(() => {
    if (!householdId) return
    expenseApi.listCategories(householdId).then(setSpendCategories).catch(() => {})
  }, [householdId])

  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
        spend_category: payload.spend_category ?? '',
        description: payload.description ?? '',
        notes: payload.notes ?? '',
        external_reference: '',
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

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="relative w-full max-w-lg rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-modal)] my-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Approve SMS</p>
              <p className="text-xs text-[var(--text-muted)]">{message.sender} · {message.received_at.slice(0, 10)}</p>
            </div>
            <div className="flex items-center gap-2">
              <ConfidencePill value={message.confidence} />
              <button type="button" onClick={onCancel} className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">✕</button>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Original SMS body */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="whitespace-pre-wrap text-xs text-[var(--text-muted)]">{message.body}</p>
            </div>

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
                {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
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
                {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
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
    </>
  )
}
