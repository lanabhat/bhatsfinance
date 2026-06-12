import { useEffect, useState } from 'react'
import type { ExpenseCategory, InstrumentOption, OptionItem, SmsMessage } from '../../types/domain'
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
  instrumentOptions: InstrumentOption[]
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

type ApprovalMode = 'transaction' | 'balance' | 'investment'

export function SmsApprovalForm({ message, accountOptions, memberOptions, instrumentOptions, onApproved, onCancel }: Props) {
  const { householdId } = useApp()
  const tx = message.parsed_tx ?? {}

  // Guess initial mode
  const bodyLower = message.body.toLowerCase()
  const looksLikeBalance = /\b(balance|avl bal|avail bal|available balance|closing bal)\b/.test(bodyLower) && !tx.amount
  const looksLikeSip = /\b(sip|mutual fund|mf|nav|units|folio)\b/.test(bodyLower)
  const defaultMode: ApprovalMode = looksLikeBalance ? 'balance' : looksLikeSip ? 'investment' : 'transaction'
  const [mode, setMode] = useState<ApprovalMode>(defaultMode)

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

  // Investment fields
  const [instrument, setInstrument] = useState(String(tx.instrument ?? ''))
  const [investAmount, setInvestAmount] = useState(tx.amount ?? '')
  const [investMember, setInvestMember] = useState(tx.member ?? (message.owner ? String(message.owner) : ''))
  const [quantity, setQuantity] = useState('')

  // When an instrument is picked, auto-fill account from its default_account
  const handleInstrumentChange = (id: string) => {
    setInstrument(id)
    if (id) {
      const found = instrumentOptions.find((i) => String(i.id) === id)
      if (found?.default_account && !account) {
        setAccount(String(found.default_account))
      }
    }
  }

  // When account changes, if the currently selected instrument doesn't belong to it, clear it
  const handleAccountChange = (id: string) => {
    setAccount(id)
    if (mode === 'investment' && instrument && id) {
      const found = instrumentOptions.find((i) => String(i.id) === instrument)
      if (found?.default_account && String(found.default_account) !== id) {
        setInstrument('')
      }
    }
  }

  // Instruments linked to the selected account (or with no account link = unlinked)
  const linkedInstruments = account
    ? instrumentOptions.filter((i) => !i.default_account || String(i.default_account) === account)
    : instrumentOptions
  // Instruments explicitly linked to a different account
  const otherInstruments = account
    ? instrumentOptions.filter((i) => i.default_account && String(i.default_account) !== account)
    : []
  // If account is chosen but nothing is linked, show everything ungrouped
  const filteredInstruments = (account && linkedInstruments.length === 0) ? instrumentOptions : linkedInstruments

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
      } else if (mode === 'investment') {
        if (!instrument) { setError('Select an instrument.'); setBusy(false); return }
        if (!investAmount) { setError('Enter an amount.'); setBusy(false); return }
        const overrides: SmsApprovalOverrides = {
          account,
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
    <div className="grid w-full min-w-0 gap-4 text-sm overflow-hidden">
      {/* Original message */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Original message</span>
          <ConfidencePill value={message.confidence} />
        </div>
        <p className="whitespace-pre-wrap text-xs text-slate-600">{message.body}</p>
      </div>

      {/* Mode toggle */}
      <div className="flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
        {(['transaction', 'balance', 'investment'] as ApprovalMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 min-w-[7rem] rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              mode === m
                ? 'bg-white shadow-sm text-slate-800 border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {m === 'transaction' ? 'Record Transaction' : m === 'balance' ? 'Record Balance' : 'Record Investment'}
          </button>
        ))}
      </div>

      {/* Shared: Account + Date */}
      <div className="grid grid-cols-2 gap-3 min-w-0">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {mode === 'investment' ? 'Debit Account *' : 'Account *'}
          </span>
          <select
            value={account}
            onChange={(e) => mode === 'investment' ? handleAccountChange(e.target.value) : setAccount(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">— select —</option>
            {accountOptions.map((a) => <option key={a.id} value={String(a.id)}>{a.label}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Date *</span>
          <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
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
      ) : mode === 'investment' ? (
        /* Investment mode — single column to fit the drawer */
        <div className="grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Instrument (Fund / Stock) *</span>
            <select value={instrument} onChange={(e) => handleInstrumentChange(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              <option value="">— select instrument —</option>
              {filteredInstruments.length > 0 && (
                account
                  ? <optgroup label="Linked to selected account">
                      {filteredInstruments.map((i) => <option key={i.id} value={String(i.id)}>{i.label}</option>)}
                    </optgroup>
                  : filteredInstruments.map((i) => <option key={i.id} value={String(i.id)}>{i.label}</option>)
              )}
              {otherInstruments.length > 0 && (
                <optgroup label="Other accounts">
                  {otherInstruments.map((i) => <option key={i.id} value={String(i.id)}>{i.label}</option>)}
                </optgroup>
              )}
            </select>
            {account && filteredInstruments.length === 0 && (
              <span className="text-[11px] text-amber-600">No instruments linked to this account — showing all below</span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Amount Invested (INR) *</span>
            <input
              type="number"
              step="0.01"
              value={investAmount}
              onChange={(e) => setInvestAmount(e.target.value)}
              placeholder="e.g. 5000.00"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Units Purchased (optional)</span>
            <input
              type="number"
              step="0.000001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Leave blank if unknown"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Member</span>
            <select value={investMember} onChange={(e) => setInvestMember(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              <option value="">— unassigned —</option>
              {memberOptions.map((m) => <option key={m.id} value={String(m.id)}>{m.label}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-slate-400">
            Records a <strong>buy</strong> transaction linked to both the debit account and the selected instrument.
          </p>
        </div>
      ) : (
        /* Transaction mode — same structure as QuickExpenseForm */
        <div className="grid gap-3 min-w-0">
          {/* Classification — first choice, drives everything else */}
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 block mb-1.5">What kind of transaction?</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'spend', label: '🛍 Spend', dir: 'outflow' as const },
                { value: 'income', label: '💰 Income', dir: 'inflow' as const },
                { value: 'internal_transfer', label: '🔄 Transfer', dir: 'outflow' as const },
                { value: 'tracking', label: '👁 Tracking Only', dir: 'outflow' as const },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setClassification(opt.value); setDirection(opt.dir) }}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium text-left transition-colors ${
                    classification === opt.value
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount + Member */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Amount (INR) *</span>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Member</span>
              <select value={member} onChange={(e) => setMember(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
                <option value="">— unassigned —</option>
                {memberOptions.map((m) => <option key={m.id} value={String(m.id)}>{m.label}</option>)}
              </select>
            </label>
          </div>

          {/* Category — only for spend */}
          {classification === 'spend' && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Category</span>
              <div className="flex flex-wrap gap-1.5">
                {spendCategories.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setSpendCategory(c.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      spendCategory === c.key
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            </label>
          )}

          {/* Description / Merchant */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Description</span>
            <input
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder={classification === 'income' ? 'e.g. Salary, Freelance' : 'e.g. Merchant name or note'}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <Badge
          label={
            mode === 'balance' ? 'Will record: Account balance snapshot'
            : mode === 'investment' ? 'Will record: Instrument buy transaction'
            : `Will create: Ledger ${direction === 'inflow' ? 'income' : 'expense'} transaction`
          }
          color="blue"
        />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={handleApprove} loading={busy}>
            {mode === 'balance' ? 'Save Balance' : mode === 'investment' ? 'Record Investment' : 'Approve & Add to Ledger'}
          </Button>
        </div>
      </div>
    </div>
  )
}
