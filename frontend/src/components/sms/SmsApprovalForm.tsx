import { useEffect, useState } from 'react'
import type { ExpenseCategory, OptionItem, SmsMessage } from '../../types/domain'
import { smsApi } from '../../api/smsApi'
import type { SmsApprovalOverrides } from '../../api/smsApi'
import { expenseApi } from '../../api/expenseApi'
import { useApp } from '../../context/AppContext'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { normalizeApiError } from '../../hooks/errorUtils'

type Props = {
  message: SmsMessage
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
  onApproved: (transactionId: number | undefined) => void
  onCancel: () => void
}

const CLASSIFICATIONS = [
  { value: '', label: '— none —' },
  { value: 'spend', label: 'Spend' },
  { value: 'income', label: 'Income' },
  { value: 'internal_transfer', label: 'Internal Transfer' },
  { value: 'tracking', label: 'Tracking Only' },
]

const TX_TYPES = ['other', 'deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'interest', 'salary', 'emi', 'premium', 'cc_bill_payment']

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

type ApprovalMode = 'transaction' | 'balance'

export function SmsApprovalForm({ message, accountOptions, memberOptions, onApproved, onCancel }: Props) {
  const { householdId } = useApp()
  const tx = message.parsed_tx ?? {}

  // Guess initial mode: if the body contains "balance" keywords and no amount, default to balance
  const bodyLower = message.body.toLowerCase()
  const looksLikeBalance = /\b(balance|avl bal|avail bal|available balance|closing bal)\b/.test(bodyLower) && !tx.amount
  const [mode, setMode] = useState<ApprovalMode>(looksLikeBalance ? 'balance' : 'transaction')

  // Shared
  const [account, setAccount] = useState(tx.account ?? '')
  const [txDate, setTxDate] = useState(tx.tx_date || message.received_at.slice(0, 10))

  // Transaction fields
  const [member, setMember] = useState(tx.member ?? (message.owner ? String(message.owner) : ''))
  const [direction, setDirection] = useState<'inflow' | 'outflow'>(tx.direction || 'outflow')
  const [amount, setAmount] = useState(tx.amount ?? '')
  const [txType, setTxType] = useState(tx.transaction_type || 'other')
  const [classification, setClassification] = useState(tx.classification ?? '')
  const [spendCategory, setSpendCategory] = useState(tx.spend_category ?? '')
  const [extRef, setExtRef] = useState(tx.external_reference ?? '')
  const [merchant, setMerchant] = useState(tx.merchant ?? '')

  // Balance fields
  const [balance, setBalance] = useState(tx.amount ?? '')
  const [balanceNotes, setBalanceNotes] = useState('')

  const [spendCategories, setSpendCategories] = useState<ExpenseCategory[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!householdId) return
    expenseApi.listCategories(householdId).then(setSpendCategories).catch(() => {})
  }, [householdId])

  const handleApprove = async () => {
    setError('')
    if (!account) { setError('Select an account.'); return }
    if (!txDate) { setError('Enter a date.'); return }

    setBusy(true)
    try {
      if (mode === 'balance') {
        if (!balance) { setError('Enter a balance amount.'); setBusy(false); return }
        const result = await smsApi.recordBalance(message.id, {
          account,
          balance,
          valuation_date: txDate,
          notes: balanceNotes,
        })
        onApproved(result.transaction_id)
      } else {
        if (!amount) { setError('Enter an amount.'); setBusy(false); return }
        const result = await smsApi.approveStaged(message.id, {
          account,
          member: member || undefined,
          direction: direction as 'inflow' | 'outflow',
          amount,
          transaction_type: txType,
          tx_date: txDate,
          classification: classification as SmsApprovalOverrides['classification'],
          spend_category: classification === 'spend' ? spendCategory : '',
          external_reference: extRef,
          merchant,
        })
        onApproved(result.transaction_id)
      }
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 text-sm">
      {/* Original message */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Original message</span>
          <ConfidencePill value={message.confidence} />
        </div>
        <p className="whitespace-pre-wrap text-xs text-slate-600">{message.body}</p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
        {(['transaction', 'balance'] as ApprovalMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              mode === m
                ? 'bg-white shadow-sm text-slate-800 border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {m === 'transaction' ? 'Record Transaction' : 'Record Balance'}
          </button>
        ))}
      </div>

      {/* Shared: Account + Date */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Account *</span>
          <select value={account} onChange={(e) => setAccount(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
            <option value="">— select —</option>
            {accountOptions.map((a) => <option key={a.id} value={String(a.id)}>{a.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Date *</span>
          <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
      </div>

      {mode === 'balance' ? (
        /* Balance mode */
        <div className="grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Balance (INR) *</span>
            <input
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="e.g. 12450.00"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Notes</span>
            <input
              type="text"
              value={balanceNotes}
              onChange={(e) => setBalanceNotes(e.target.value)}
              placeholder="Optional note"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <p className="text-[11px] text-slate-400">
            Records a balance snapshot on the account — useful for tracking account balances from bank alerts.
          </p>
        </div>
      ) : (
        /* Transaction mode */
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Member</span>
            <select value={member} onChange={(e) => setMember(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              <option value="">— unassigned —</option>
              {memberOptions.map((m) => <option key={m.id} value={String(m.id)}>{m.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Direction *</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'inflow' | 'outflow')} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              <option value="outflow">Outflow (Debit)</option>
              <option value="inflow">Inflow (Credit)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Amount (INR) *</span>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Type</span>
            <select value={txType} onChange={(e) => setTxType(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              {TX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Classification</span>
            <select value={classification} onChange={(e) => setClassification(e.target.value as typeof classification)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              {CLASSIFICATIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          {classification === 'spend' ? (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Spend Category</span>
              <select value={spendCategory} onChange={(e) => setSpendCategory(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
                <option value="">— select —</option>
                {spendCategories.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </label>
          ) : <div />}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Merchant / Payee</span>
            <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Reference</span>
            <input type="text" value={extRef} onChange={(e) => setExtRef(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <Badge
          label={mode === 'balance' ? 'Will record: Account balance snapshot' : `Will create: Ledger ${direction === 'inflow' ? 'income' : 'expense'} transaction`}
          color="blue"
        />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={handleApprove} loading={busy}>
            {mode === 'balance' ? 'Save Balance' : 'Approve & Add to Ledger'}
          </Button>
        </div>
      </div>
    </div>
  )
}
