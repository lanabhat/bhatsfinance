import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { smsApi } from '../api/smsApi'
import type { SmsApprovalOverrides } from '../api/smsApi'
import { portfolioApi } from '../api/portfolioApi'
import { expenseApi } from '../api/expenseApi'
import { tagApi } from '../api/tagApi'
import { normalizeApiError } from '../hooks/errorUtils'
import { CategoryGrid, MemberChip } from '../components/expenses/QuickExpenseForm'
import { TagPicker } from '../components/expenses/TagPicker'
import { SmsAccountPicker } from '../components/sms/SmsAccountPicker'
import { getReviewQueue, openReview, removeFromReviewQueue } from '../components/sms/reviewQueue'
import type { Account, ExpenseCategory, InstrumentOption, OptionItem, SmsMessage, Tag, TransactionClassification } from '../types/domain'

type Props = {
  householdId: number
  messageId: number
  memberOptions: OptionItem[]
  instrumentOptions: InstrumentOption[]
  onDone: () => void
}

type Mode = 'transaction' | 'balance' | 'investment'

const KIND_LABEL: Record<string, string> = {
  debit: 'Money out', credit: 'Money in', card_spend: 'Card spend', card_refund: 'Card refund',
  cc_payment: 'Card bill received', cc_bill_paid: 'Card bill paid', mf_purchase: 'Fund purchase',
  investment_debit: 'Investment debit', balance: 'Balance update', otp: 'OTP', failed: 'Failed payment',
  reminder: 'Reminder', promotion: 'Promotion', unknown: 'Not recognised',
}
const NOTHING_TO_RECORD = new Set(['otp', 'failed', 'reminder', 'promotion'])

const CLASSIFICATIONS: { value: TransactionClassification; label: string; icon: string }[] = [
  { value: 'spend', label: 'Spend', icon: '🛒' },
  { value: 'income', label: 'Income', icon: '💰' },
  { value: 'internal_transfer', label: 'Transfer', icon: '🔄' },
  { value: 'tracking', label: 'Tracking only', icon: '📝' },
]

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-primary-500'
const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]'

function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            value === o.value ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Full-page review of one staged SMS (#/sms/<id>): the message and what was read
 *  from it on the left, the record to create — grouped into account, details, who
 *  and extras — on the right. */
export function SmsReviewPage({ householdId, messageId, memberOptions, instrumentOptions, onDone }: Props) {
  // Keyed by id so moving to another SMS shows "Loading" until its data arrives.
  const [loaded, setLoaded] = useState<{ id: number; message?: SmsMessage; error?: string } | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  useEffect(() => {
    portfolioApi.listAccounts(householdId).then(setAccounts).catch(() => {})
    expenseApi.listCategories(householdId).then(setCategories).catch(() => {})
    tagApi.list(householdId).then(setTags).catch(() => {})
  }, [householdId])

  useEffect(() => {
    let active = true
    smsApi.getMessage(messageId)
      .then((m) => { if (active) setLoaded({ id: messageId, message: m }) })
      .catch((e) => { if (active) setLoaded({ id: messageId, error: normalizeApiError(e) }) })
    return () => { active = false }
  }, [messageId])

  const queue = getReviewQueue()
  const position = queue.indexOf(messageId)
  const prevId = position > 0 ? queue[position - 1] : null
  const nextId = position >= 0 && position < queue.length - 1 ? queue[position + 1] : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight' && nextId) openReview(nextId)
      if (e.key === 'ArrowLeft' && prevId) openReview(prevId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nextId, prevId])

  const goNext = (handledId: number) => {
    const next = removeFromReviewQueue(handledId)
    if (next) openReview(next)
    else onDone()
  }

  const current = loaded?.id === messageId ? loaded : null
  if (current?.error) return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{current.error}</p>
  const message = current?.message
  if (!message) return <p className="py-10 text-center text-sm text-[var(--text-muted)]">Loading SMS…</p>

  return (
    <ReviewForm
      key={message.id}
      message={message}
      householdId={householdId}
      accounts={accounts}
      categories={categories}
      onCategoryCreated={(c) => setCategories((prev) => [...prev, c])}
      tags={tags}
      onTagCreated={(t) => setTags((prev) => [...prev, t])}
      memberOptions={memberOptions}
      instrumentOptions={instrumentOptions}
      queueLabel={position >= 0 ? `${position + 1} of ${queue.length}` : ''}
      onPrev={prevId ? () => openReview(prevId) : undefined}
      onNext={nextId ? () => openReview(nextId) : undefined}
      onHandled={() => goNext(message.id)}
    />
  )
}

type FormProps = {
  message: SmsMessage
  householdId: number
  accounts: Account[]
  categories: ExpenseCategory[]
  onCategoryCreated: (c: ExpenseCategory) => void
  tags: Tag[]
  onTagCreated: (t: Tag) => void
  memberOptions: OptionItem[]
  instrumentOptions: InstrumentOption[]
  queueLabel: string
  onPrev?: () => void
  onNext?: () => void
  onHandled: () => void
}

function ReviewForm({
  message, householdId, accounts, categories, onCategoryCreated, tags, onTagCreated,
  memberOptions, instrumentOptions, queueLabel, onPrev, onNext, onHandled,
}: FormProps) {
  const tx = message.parsed_tx ?? {}
  const kind = tx.kind ?? ''
  const detectedId = tx.account ? Number(tx.account) : null
  const alreadyDone = message.status === 'approved'

  const [mode, setMode] = useState<Mode>(
    kind === 'balance' ? 'balance' : kind === 'investment_debit' || kind === 'mf_purchase' ? 'investment' : 'transaction',
  )
  const [accountId, setAccountId] = useState<number | null>(detectedId)
  const [member, setMember] = useState<number | null>(tx.member ? Number(tx.member) : message.owner)
  const [direction, setDirection] = useState<'outflow' | 'inflow'>(tx.direction === 'inflow' ? 'inflow' : 'outflow')
  const [classification, setClassification] = useState<TransactionClassification>(
    (['spend', 'income', 'internal_transfer', 'tracking'] as const).find((c) => c === tx.classification)
      ?? (tx.direction === 'inflow' ? 'income' : 'spend'),
  )
  const [amount, setAmount] = useState(tx.amount ?? '')
  const [txDate, setTxDate] = useState(tx.tx_date || message.received_at.slice(0, 10))
  const [category, setCategory] = useState(tx.spend_category || 'other')
  const [description, setDescription] = useState(tx.description || tx.merchant || '')
  const [reference, setReference] = useState(tx.external_reference ?? '')
  const [notes, setNotes] = useState('')
  const [tagIds, setTagIds] = useState<number[]>([])
  // The SMS is the bank reporting the account moved, so it counts toward the balance.
  const [affectsBalance, setAffectsBalance] = useState(true)
  const [balance, setBalance] = useState(tx.balance ?? '')
  const [instrument, setInstrument] = useState(tx.instrument ? String(tx.instrument) : '')
  const [units, setUnits] = useState(tx.quantity ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectAccount = (id: number) => {
    setAccountId(id)
    const owner = accounts.find((a) => a.id === id)?.primary_member
    if (owner) setMember(owner)
  }

  const showBroker = mode === 'investment' || kind === 'investment_debit' || kind === 'mf_purchase'
  const instrumentsForAccount = useMemo(() => {
    const linked = instrumentOptions.filter((i) => accountId && i.default_account === accountId)
    const rest = instrumentOptions.filter((i) => !linked.includes(i))
    return { linked, rest }
  }, [instrumentOptions, accountId])

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true)
    setError('')
    try {
      await action()
      onHandled()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const approve = () => {
    if (mode !== 'transaction' || classification !== 'tracking') {
      if (!accountId) { setError('Choose the account.'); return }
    }
    if (mode === 'balance') {
      if (!balance) { setError('Enter the balance.'); return }
      return run(() => smsApi.recordBalance(message.id, { account: String(accountId), balance, valuation_date: txDate, notes }))
    }
    if (!amount) { setError('Enter the amount.'); return }
    if (mode === 'investment') {
      if (!instrument) { setError('Choose the fund or stock.'); return }
      const overrides: SmsApprovalOverrides = {
        account: String(accountId), member: member ? String(member) : undefined, direction: 'outflow', amount,
        transaction_type: 'buy', tx_date: txDate, instrument, affects_balance: affectsBalance,
        external_reference: reference, notes, ...(units ? { quantity: units } : {}),
      }
      return run(() => smsApi.approveStaged(message.id, overrides))
    }
    const overrides: SmsApprovalOverrides = {
      account: accountId ? String(accountId) : undefined,
      member: member ? String(member) : undefined,
      direction,
      amount,
      transaction_type: classification === 'tracking' ? 'other' : direction === 'inflow' ? 'deposit' : 'withdrawal',
      tx_date: txDate,
      classification,
      spend_category: classification === 'spend' ? category : '',
      description,
      external_reference: reference,
      notes,
      affects_balance: accountId ? affectsBalance : true,
      tags: tagIds.length > 0 ? tagIds : undefined,
    }
    return run(() => smsApi.approveStaged(message.id, overrides))
  }

  const reject = () => run(() => smsApi.rejectStaged(message.id))

  const navButton = 'flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-30'

  return (
    <div className="grid gap-4 pb-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* ── The SMS and what was read from it ── */}
      <aside className="grid content-start gap-3 lg:sticky lg:top-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">{queueLabel}</span>
          <div className="flex gap-1">
            <button type="button" className={navButton} onClick={onPrev} disabled={!onPrev} title="Previous (←)">‹</button>
            <button type="button" className={navButton} onClick={onNext} disabled={!onNext} title="Next (→)">›</button>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text)]">{message.sender}</span>
            <span className="text-xs text-[var(--text-muted)]">
              {new Date(message.received_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] p-3 text-sm leading-relaxed text-[var(--text-2)]">{message.body}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-[var(--text-muted)]">Read as</dt><dd className="font-medium text-[var(--text)]">{KIND_LABEL[kind] ?? '—'}</dd>
            {tx.amount && <><dt className="text-[var(--text-muted)]">Amount</dt><dd className="font-medium tabular-nums text-[var(--text)]">₹{tx.amount}</dd></>}
            {tx.account_hint && <><dt className="text-[var(--text-muted)]">Account digits</dt><dd className="font-medium text-[var(--text)]">•••{tx.account_hint}</dd></>}
            {tx.balance && <><dt className="text-[var(--text-muted)]">Balance stated</dt><dd className="font-medium tabular-nums text-[var(--text)]">₹{tx.balance}</dd></>}
          </dl>
          {tx.balance && detectedId && (
            <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">The stated balance was recorded for the detected account automatically.</p>
          )}
        </div>
        {NOTHING_TO_RECORD.has(kind) && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/15 dark:text-amber-300">
            This looks like a {KIND_LABEL[kind].toLowerCase()} — usually nothing to record. Reject it to clear it from the queue.
          </p>
        )}
        {alreadyDone && (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">This SMS is already approved.</p>
        )}
      </aside>

      {/* ── What to record ── */}
      <div className="grid content-start gap-3">
        <Card title="What is it">
          <Segmented<Mode> value={mode} onChange={setMode} options={[
            { value: 'transaction', label: '💳 Transaction' },
            { value: 'balance', label: '🏦 Balance only' },
            { value: 'investment', label: '📊 Investment' },
          ]} />
        </Card>

        <Card title={mode === 'investment' ? 'Paid from' : mode === 'balance' ? 'Account' : direction === 'inflow' ? 'Credited to' : 'Paid from'}>
          <SmsAccountPicker accounts={accounts} selectedId={accountId} detectedId={detectedId} hint={tx.account_hint}
            showBroker={showBroker} onSelect={selectAccount} />
          {accountId && mode !== 'balance' && (
            <label className="mt-3 flex items-start gap-2 text-xs text-[var(--text-2)]">
              <input type="checkbox" checked={affectsBalance} onChange={(e) => setAffectsBalance(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border)] text-primary-600" />
              <span>
                <span className="font-medium">Count toward this account's balance</span>
                <span className="block text-[var(--text-muted)]">Turn off only if the money never actually moved through this account.</span>
              </span>
            </label>
          )}
        </Card>

        {mode === 'transaction' && (
          <Card title="Details">
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto]">
                <div>
                  <span className={LABEL}>Direction</span>
                  <Segmented<'outflow' | 'inflow'> value={direction} onChange={setDirection}
                    options={[{ value: 'outflow', label: 'Money out' }, { value: 'inflow', label: 'Money in' }]} />
                </div>
                <label>
                  <span className={LABEL}>Amount (₹)</span>
                  <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                    className={`${INP} text-base font-semibold tabular-nums`} placeholder="0.00" />
                </label>
                <label>
                  <span className={LABEL}>Date</span>
                  <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className={INP} />
                </label>
              </div>
              <div>
                <span className={LABEL}>Type</span>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {CLASSIFICATIONS.map((c) => (
                    <button key={c.value} type="button" onClick={() => setClassification(c.value)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                        classification === c.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                          : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
                      }`}>
                      <span>{c.icon}</span>{c.label}
                    </button>
                  ))}
                </div>
              </div>
              {classification === 'spend' && (
                <div>
                  <span className={LABEL}>Category</span>
                  <CategoryGrid value={category} onChange={setCategory} categories={categories}
                    householdId={householdId} onCategoryCreated={onCategoryCreated} />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className={LABEL}>{direction === 'inflow' ? 'From' : 'Paid to'}</span>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} className={INP} placeholder="Payee or description" />
                </label>
                <label>
                  <span className={LABEL}>Reference</span>
                  <input value={reference} onChange={(e) => setReference(e.target.value)} className={INP} placeholder="UPI / NEFT reference" />
                </label>
              </div>
            </div>
          </Card>
        )}

        {mode === 'balance' && (
          <Card title="Balance">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className={LABEL}>Balance (₹)</span>
                <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} className={`${INP} text-base font-semibold tabular-nums`} />
              </label>
              <label>
                <span className={LABEL}>As of</span>
                <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className={INP} />
              </label>
            </div>
          </Card>
        )}

        {mode === 'investment' && (
          <Card title="Investment">
            <div className="grid gap-3">
              <label>
                <span className={LABEL}>Fund or stock</span>
                <select value={instrument} onChange={(e) => setInstrument(e.target.value)} className={INP}>
                  <option value="">— select —</option>
                  {instrumentsForAccount.linked.length > 0 && (
                    <optgroup label="Linked to this account">
                      {instrumentsForAccount.linked.map((i) => <option key={i.id} value={String(i.id)}>{i.label}</option>)}
                    </optgroup>
                  )}
                  <optgroup label={instrumentsForAccount.linked.length > 0 ? 'Others' : 'All'}>
                    {instrumentsForAccount.rest.map((i) => <option key={i.id} value={String(i.id)}>{i.label}</option>)}
                  </optgroup>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label>
                  <span className={LABEL}>Amount (₹)</span>
                  <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${INP} font-semibold tabular-nums`} />
                </label>
                <label>
                  <span className={LABEL}>Units</span>
                  <input type="number" step="0.000001" value={units} onChange={(e) => setUnits(e.target.value)} className={INP} placeholder="If known" />
                </label>
                <label>
                  <span className={LABEL}>Date</span>
                  <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className={INP} />
                </label>
              </div>
            </div>
          </Card>
        )}

        {mode !== 'balance' && (
          <Card title="Who">
            <div className="flex flex-wrap gap-2">
              {memberOptions.map((m) => (
                <MemberChip key={m.id} name={m.label} selected={member === m.id} onClick={() => setMember(member === m.id ? null : m.id)} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">Defaults to the account's owner.</p>
          </Card>
        )}

        <Card title="Extras">
          <div className="grid gap-3">
            {mode === 'transaction' && (
              <div>
                <span className={LABEL}>Tags</span>
                <TagPicker householdId={householdId} tags={tags} selectedIds={tagIds} onChange={setTagIds} onTagCreated={onTagCreated} />
              </div>
            )}
            <label>
              <span className={LABEL}>Notes</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={INP} placeholder="Optional" />
            </label>
          </div>
        </Card>
      </div>

      {/* ── Actions ── */}
      <div className="sticky bottom-[3.5rem] z-20 rounded-xl border border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 shadow-lg backdrop-blur md:bottom-3 lg:col-span-2">
        <div className="flex items-center gap-2">
          {error && <p className="mr-auto truncate text-xs text-red-600">{error}</p>}
          <button type="button" onClick={() => void reject()} disabled={saving || alreadyDone}
            className={`${error ? '' : 'mr-auto '}rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-800/40 dark:text-rose-400 dark:hover:bg-rose-900/20`}>
            Reject
          </button>
          {onNext && (
            <button type="button" onClick={onNext} className="rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]">
              Skip
            </button>
          )}
          <button type="button" onClick={() => void approve()} disabled={saving || alreadyDone}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40">
            {saving ? 'Saving…' : mode === 'balance' ? 'Save balance' : mode === 'investment' ? 'Record investment' : 'Approve'}
            {onNext && !saving ? ' & next' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
