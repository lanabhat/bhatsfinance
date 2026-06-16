import { useEffect, useMemo, useRef, useState } from 'react'
import { portfolioApi } from '../../api/portfolioApi'
import type { Account, AccountOwnership, ExpenseCategory, OptionItem, TransactionClassification } from '../../types/domain'
import type { RecordTransactionPayload } from '../../api/expenseApi'

export type CategoryKey = string

const USAGE_KEY = 'expense:category_usage'

function getUsageCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}') } catch { return {} }
}
function bumpUsage(key: string) {
  const counts = getUsageCounts()
  counts[key] = (counts[key] ?? 0) + 1
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(counts)) } catch { /* ignore */ }
}

function sortedCategories(categories: ExpenseCategory[]) {
  const usage = getUsageCounts()
  return [...categories].sort((a, b) => (usage[b.key] ?? 0) - (usage[a.key] ?? 0))
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MemberChip({ name, selected, onClick }: { name: string; selected: boolean; onClick: () => void }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-center transition-all ${
        selected
          ? 'bg-primary-600 text-white shadow-md scale-105'
          : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
      }`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
        selected ? 'bg-white/20' : 'bg-[var(--surface-3)]'
      }`}>
        {initials}
      </span>
      <span className="max-w-[64px] truncate text-[11px] font-medium leading-tight">{name.split(' ')[0]}</span>
    </button>
  )
}

function CategoryGrid({ value, onChange, categories }: { value: CategoryKey; onChange: (k: CategoryKey) => void; categories: ExpenseCategory[] }) {
  const cats = useMemo(() => sortedCategories(categories), [categories])
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-5">
      {cats.map(cat => (
        <button
          key={cat.key}
          type="button"
          onClick={() => onChange(cat.key)}
          className={`flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 text-center transition-all ${
            value === cat.key
              ? 'bg-primary-50 ring-2 ring-primary-500 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 dark:ring-primary-400'
              : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
          }`}
        >
          <span className="text-xl leading-none">{cat.icon}</span>
          <span className="text-[10px] font-medium leading-tight">{cat.label}</span>
        </button>
      ))}
    </div>
  )
}

function AccountChip({ account, selected, onClick }: { account: Account; selected: boolean; onClick: () => void }) {
  const TYPE_ICON: Record<string, string> = {
    bank: '🏦', broker: '📈', credit_card: '💳', cash: '💵',
    pf: '🛡', loan: '🏛', insurance: '☂️', other: '💼',
  }
  const icon = TYPE_ICON[account.account_type] ?? '💼'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all ${
        selected
          ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm dark:bg-primary-900/40 dark:text-primary-300 dark:border-primary-400'
          : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:border-[var(--border-2)] hover:bg-[var(--surface-3)]'
      }`}
    >
      <span className="text-lg shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{account.name}</p>
        <p className="truncate text-[10px] text-[var(--text-muted)]">
          {account.institution_name || account.account_type.replace('_', ' ')}
        </p>
      </div>
    </button>
  )
}

function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="flex items-center justify-center gap-1 py-1">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all ${
            i < current ? 'bg-primary-600 text-white'
            : i === current ? 'bg-primary-600 text-white ring-2 ring-primary-200 ring-offset-1 dark:ring-primary-800'
            : 'bg-[var(--surface-3)] text-[var(--text-faint)]'
          }`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`hidden text-[11px] font-medium sm:inline ${i === current ? 'text-[var(--text-2)]' : 'text-[var(--text-faint)]'}`}>
            {label}
          </span>
          {i < labels.length - 1 && (
            <div className={`h-px w-4 sm:w-6 transition-all ${i < current ? 'bg-primary-400' : 'bg-[var(--surface-3)]'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Classification options
// ---------------------------------------------------------------------------

const CLASSIFICATION_OPTIONS: { value: TransactionClassification; label: string; icon: string; desc: string }[] = [
  { value: 'spend',             label: 'Spend',            icon: '🛒', desc: 'Money going out — purchases, bills, EMI' },
  { value: 'income',            label: 'Income',           icon: '💰', desc: 'Money coming in — salary, interest, refund' },
  { value: 'internal_transfer', label: 'Transfer',         icon: '🔄', desc: 'Moving money between your own accounts' },
  { value: 'tracking',          label: 'Tracking Only',    icon: '📝', desc: 'Record for reference — no real cash impact' },
]

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

type FormState = {
  tx_date: string
  amount: string
  classification: TransactionClassification
  spend_category: CategoryKey
  description: string
  member: number | null
  for_members: number[]
  account: number | null
  notes: string
}

export type QuickFormSavePayload = RecordTransactionPayload

type Props = {
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  initialClassification?: TransactionClassification
  categories: ExpenseCategory[]
  onSave: (form: QuickFormSavePayload) => Promise<void>
  onCancel: () => void
  saving: boolean
  error: string
  refreshKey?: number
}

export function QuickExpenseForm({
  householdId,
  memberOptions,
  initialClassification,
  categories,
  onSave,
  onCancel,
  saving,
  error,
  refreshKey,
}: Props) {
  const [step, setStep] = useState(initialClassification ? 1 : 0)
  const [fullAccounts, setFullAccounts] = useState<Account[]>([])
  const [ownerships, setOwnerships] = useState<AccountOwnership[]>([])
  const amountRef = useRef<HTMLInputElement>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState<FormState>(() => ({
    tx_date: today,
    amount: '',
    classification: initialClassification ?? 'spend',
    spend_category: 'other',
    description: '',
    member: null,
    for_members: [],
    account: null,
    notes: '',
  }))

  useEffect(() => {
    portfolioApi.listAccounts(householdId).then(accs => {
      setFullAccounts(accs)
      const accountIds = accs.map(a => a.id)
      if (accountIds.length === 0) { setOwnerships([]); return }
      Promise.all(accountIds.map(id => portfolioApi.listAccountOwnerships(id)))
        .then(results => setOwnerships(results.flat()))
        .catch(() => {})
    }).catch(() => {})
  }, [householdId, refreshKey])

  const memberAccounts = useMemo((): Account[] => {
    if (!form.member) return fullAccounts
    const memberId = Number(form.member)
    const ownedIds = new Set(
      ownerships.filter(o => Number(o.member) === memberId).map(o => Number(o.account))
    )
    return fullAccounts.filter(a =>
      Number(a.primary_member) === memberId || ownedIds.has(Number(a.id))
    )
  }, [form.member, fullAccounts, ownerships])

  function selectClassification(cls: TransactionClassification) {
    setForm(p => ({ ...p, classification: cls }))
    setStep(1)
  }

  function selectMember(id: number) {
    const isSame = form.member === id
    setForm(p => ({ ...p, member: isSame ? null : id, account: null }))
    if (!isSame) setStep(2)
  }

  function selectAccount(id: number) {
    setForm(p => ({ ...p, account: id }))
    setStep(3)
    setTimeout(() => amountRef.current?.focus(), 120)
  }

  function selectCategory(key: CategoryKey) {
    setForm(p => ({ ...p, spend_category: key }))
  }

  const isSpend = form.classification === 'spend'
  const isIncome = form.classification === 'income'
  const isTracking = form.classification === 'tracking'

  function classificationDirection(): 'inflow' | 'outflow' {
    if (isIncome) return 'inflow'
    return 'outflow'
  }

  function classificationTxType(): string {
    if (isIncome) return 'deposit'
    if (form.classification === 'internal_transfer') return 'withdrawal'
    if (isTracking) return 'other'
    return 'withdrawal'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSpend) bumpUsage(form.spend_category)
    await onSave({
      household: householdId,
      member: form.member,
      account: form.account,
      tx_date: form.tx_date,
      amount: form.amount,
      direction: classificationDirection(),
      transaction_type: classificationTxType(),
      classification: form.classification,
      spend_category: isSpend ? form.spend_category : undefined,
      description: form.description,
      for_members: form.for_members.length > 0 ? form.for_members : undefined,
      notes: form.notes || undefined,
      currency: 'INR',
    })
  }

  const canSubmit = !!form.amount && !saving
  const INP = 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-primary-500'

  const stepLabels = ['Type', 'Who', 'Account', 'Amount', 'Details']

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Steps current={step} labels={stepLabels} />

      {/* ── Step 0: Classification ── */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          What type of transaction is this?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CLASSIFICATION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => selectClassification(opt.value)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                form.classification === opt.value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/40 dark:border-primary-400'
                  : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)]'
              }`}
            >
              <span className="text-2xl">{opt.icon}</span>
              <div>
                <p className={`text-sm font-semibold ${form.classification === opt.value ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--text)]'}`}>
                  {opt.label}
                </p>
                <p className="text-[10px] leading-tight text-[var(--text-muted)]">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Step 1: Who (member) ── */}
      {step >= 1 && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {isIncome ? 'Who received this?' : isSpend ? 'Who paid?' : 'Which member?'}
          </p>
          {memberOptions.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No members found.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {memberOptions.map(m => (
                <MemberChip
                  key={m.id}
                  name={m.label}
                  selected={form.member === m.id}
                  onClick={() => selectMember(m.id)}
                />
              ))}
              <button
                type="button"
                onClick={() => { setForm(p => ({ ...p, member: null })); setStep(2) }}
                className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all ${
                  form.member === null && step > 1
                    ? 'bg-[var(--surface-3)] text-[var(--text-muted)] scale-105'
                    : 'bg-[var(--surface-2)] text-[var(--text-faint)] hover:bg-[var(--surface-3)]'
                }`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-3)] text-sm">—</span>
                <span className="text-[11px] font-medium">Skip</span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Step 2: Account ── */}
      {step >= 2 && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {isIncome ? 'Credited to account' : isTracking ? 'Related account (optional)' : 'Payment account'}
          </p>
          {memberAccounts.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              {form.member ? 'No accounts linked to this member.' : 'No accounts found.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {memberAccounts.map(a => (
                <AccountChip
                  key={a.id}
                  account={a}
                  selected={form.account === a.id}
                  onClick={() => selectAccount(a.id)}
                />
              ))}
              {isTracking && (
                <button
                  type="button"
                  onClick={() => { setForm(p => ({ ...p, account: null })); setStep(3); setTimeout(() => amountRef.current?.focus(), 120) }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-2.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                >
                  Skip (no account)
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Step 3: Amount + Category ── */}
      {step >= 3 && (
        <section className="space-y-4">
          {/* Amount */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--text-muted)]">₹</span>
              <input
                ref={amountRef}
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                className={`${INP} pl-8 text-xl font-bold tabular-nums`}
              />
            </div>
          </div>

          {/* Category grid — only for spend */}
          {isSpend && (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Category
              </label>
              <CategoryGrid value={form.spend_category} onChange={selectCategory} categories={categories} />
            </div>
          )}

          {/* Date */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Date</label>
            <input
              type="date"
              value={form.tx_date}
              onChange={e => setForm(p => ({ ...p, tx_date: e.target.value }))}
              className={INP}
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Description <span className="normal-case font-normal text-[var(--text-faint)]">(optional)</span>
            </label>
            <input
              type="text"
              placeholder={isIncome ? 'e.g. June salary' : isSpend ? 'e.g. Dinner with family' : 'e.g. Transfer to savings'}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className={INP}
            />
          </div>

          {step === 3 && (
            <button
              type="button"
              onClick={() => setStep(4)}
              className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              + Add notes / members
            </button>
          )}
        </section>
      )}

      {/* ── Step 4: Details ── */}
      {step >= 4 && (
        <section className="space-y-3">
          {memberOptions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {isSpend ? 'Spent for' : 'For members'} <span className="normal-case font-normal text-[var(--text-faint)]">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {memberOptions.map(m => {
                  const selected = form.for_members.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setForm(p => ({
                        ...p,
                        for_members: selected
                          ? p.for_members.filter(x => x !== m.id)
                          : [...p.for_members, m.id],
                      }))}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        selected
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                          : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
                      }`}
                    >
                      {selected ? '✓ ' : ''}{m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Notes <span className="normal-case font-normal text-[var(--text-faint)]">(optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Any additional details…"
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className={`${INP} resize-none`}
            />
          </div>
        </section>
      )}

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/15 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800">
          {error}
        </p>
      )}

      {step >= 3 && (
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white transition-opacity hover:bg-primary-700 disabled:opacity-40"
          >
            {saving ? 'Saving…' : `Record ${CLASSIFICATION_OPTIONS.find(o => o.value === form.classification)?.label ?? ''}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
          >
            Cancel
          </button>
        </div>
      )}
    </form>
  )
}
