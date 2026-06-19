import { useEffect, useMemo, useState } from 'react'
import { useMaskedFmt } from '../components/common/Money'
import { ledgerApi } from '../api/ledgerApi'
import { portfolioApi } from '../api/portfolioApi'
import { accountApi } from '../api/accountApi'
import { AccountCard } from '../components/assets/AccountCard'
import { Sheet } from '../components/ui/Sheet'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import type { Account, AccountBalance, AccountOwnership, Transaction } from '../types/domain'

// ── shared ownership row ──────────────────────────────────────────────────────
function OwnershipRow({ name, subtitle, currentMemberId, memberOptions, onSave }: {
  name: string
  subtitle: string
  currentMemberId: number | null
  memberOptions: { id: number; label: string }[]
  onSave: (memberId: number | null) => Promise<void>
}) {
  const [memberId, setMemberId] = useState<string>(String(currentMemberId ?? ''))
  const [saving, setSaving] = useState(false)
  const isDirty = String(currentMemberId ?? '') !== memberId

  const save = async () => {
    setSaving(true)
    try { await onSave(memberId === '' ? null : Number(memberId)) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text)]">{name}</p>
        <p className="text-xs text-[var(--text-muted)] capitalize">{subtitle}</p>
      </div>
      <select
        value={memberId}
        onChange={(e) => setMemberId(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-2)] focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <option value="">— Unassigned —</option>
        {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      {isDirty && (
        <button type="button" disabled={saving} onClick={save}
          className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? '…' : 'Save'}
        </button>
      )}
    </div>
  )
}

const ACCOUNT_TYPES = ['bank', 'broker', 'pf', 'loan', 'credit_card', 'insurance', 'cash', 'other'] as const
const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

function AccountForm({ householdId, account, onSave, onCancel, onDelete }: {
  householdId: number; account?: Account
  onSave: () => void; onCancel: () => void; onDelete?: () => void
}) {
  const { members } = useApp()
  const [form, setForm] = useState<Omit<Account, 'id'>>({
    household: householdId,
    name: account?.name ?? '',
    account_type: account?.account_type ?? 'bank',
    institution_name: account?.institution_name ?? '',
    primary_member: account?.primary_member ?? null,
    opening_balance: account?.opening_balance ?? '0',
    credit_limit: account?.credit_limit ?? null,
    statement_due_day: account?.statement_due_day ?? null,
    is_active: account?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      if (account) {
        await portfolioApi.updateAccount(account.id, form)
        // Sync ownership if primary_member changed
        if (form.primary_member !== account.primary_member) {
          const existing = await portfolioApi.listAccountOwnerships(account.id)
          for (const o of existing) await portfolioApi.deleteAccountOwnership(o.id)
          if (form.primary_member) {
            await portfolioApi.createAccountOwnership({ account: account.id, member: form.primary_member, allocation_percent: '100.00' })
          }
        }
      } else {
        const created = await portfolioApi.createAccount(form)
        if (form.primary_member) {
          await portfolioApi.createAccountOwnership({ account: created.id, member: form.primary_member, allocation_percent: '100.00' })
        }
      }
      onSave()
    } catch { setError('Failed to save account') } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Name</label>
        <input className={INP} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Type</label>
        <select className={INP} value={form.account_type} onChange={(e) => setForm((p) => ({ ...p, account_type: e.target.value as Account['account_type'] }))}>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Primary Owner</label>
        <select className={INP} value={form.primary_member ?? ''} onChange={(e) => setForm((p) => ({ ...p, primary_member: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">— None —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Institution</label>
        <input className={INP} value={form.institution_name} onChange={(e) => setForm((p) => ({ ...p, institution_name: e.target.value }))} /></div>
      {form.account_type !== 'credit_card' && (
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Opening Balance (₹)</label>
          <input type="number" className={INP} value={form.opening_balance} onChange={(e) => setForm((p) => ({ ...p, opening_balance: e.target.value }))} /></div>
      )}
      {form.account_type === 'credit_card' && (<>
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Credit Limit (₹)</label>
          <input type="number" className={INP} value={form.credit_limit ?? ''} onChange={(e) => setForm((p) => ({ ...p, credit_limit: e.target.value || null }))} /></div>
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Statement Due Day</label>
          <input type="number" min={1} max={31} className={INP} placeholder="e.g. 5 (5th of each month)"
            value={form.statement_due_day ?? ''} onChange={(e) => setForm((p) => ({ ...p, statement_due_day: e.target.value ? Number(e.target.value) : null }))} /></div>
      </>)}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : account ? 'Update' : 'Add Account'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
      </div>
      {account && onDelete && (
        <div className="border-t border-[var(--border)] pt-3">
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="w-full rounded-lg border border-red-200 py-2 text-sm text-red-500 hover:bg-red-50 dark:bg-red-900/15">Delete Account</button>
          ) : (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/15 p-3 text-center">
              <p className="mb-2 text-xs text-red-600">Delete this account and all its transaction history?</p>
              <div className="flex gap-2">
                <button type="button" onClick={onDelete} className="flex-1 rounded-lg bg-red-500 py-1.5 text-xs font-medium text-white hover:bg-red-600">Yes, delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs text-[var(--text-2)]">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  )
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function CCSpendForm({ account, householdId, onSave, onCancel, mode }: {
  account: Account; householdId: number
  onSave: () => void; onCancel: () => void
  mode: 'spend' | 'payment'
}) {
  const { members } = useApp()
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({ date: today, amount: '', description: '', member: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await ledgerApi.createTransaction({
        household: householdId,
        account: account.id,
        instrument: null,
        member: form.member ? Number(form.member) : null,
        tx_date: form.date,
        amount: form.amount,
        direction: mode === 'spend' ? 'outflow' : 'inflow',
        transaction_type: mode === 'spend' ? 'other' : 'deposit',
        quantity: null,
        price_per_unit: null,
        fees: '0',
        taxes: '0',
        currency: 'INR',
        external_reference: form.description,
        idempotency_key: '',
        metadata: {},
      })
      onSave()
    } catch { setError('Failed to save') } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Date</label>
        <input type="date" className={INP} value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))} required /></div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Amount (₹)</label>
        <input type="number" step="0.01" min="0" className={INP} placeholder="0.00"
          value={form.amount} onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))} required /></div>
      {mode === 'spend' && (
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Spent by</label>
          <select className={INP} value={form.member} onChange={(e) => setForm(p => ({ ...p, member: e.target.value }))}>
            <option value="">— Anyone —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select></div>
      )}
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Description</label>
        <input className={INP} placeholder={mode === 'spend' ? 'e.g. Groceries, Amazon…' : 'e.g. Bill payment'}
          value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} /></div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving}
          className={`flex-1 rounded-lg py-2 text-sm font-medium text-white disabled:opacity-50 ${mode === 'spend' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
          {saving ? 'Saving…' : mode === 'spend' ? 'Record Spend' : 'Record Payment'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
      </div>
    </form>
  )
}

function CardDetailSheet({ account, householdId, onEdit, onClose }: {
  account: Account; householdId: number; onEdit: () => void; onClose: () => void
}) {
  const fmtINR = useMaskedFmt()
  const fmtVal = fmtINR
  const { canWrite } = useAuth()
  const [balance, setBalance] = useState<AccountBalance | null>(null)
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [subSheet, setSubSheet] = useState<'spend' | 'payment' | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [b, t] = await Promise.all([
        accountApi.getBalance(account.id),
        ledgerApi.listTransactionsForAccount(householdId, account.id),
      ])
      setBalance(b)
      setTxs(t.sort((a, b) => b.tx_date.localeCompare(a.tx_date)))
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [account.id])

  // Group transactions by statement month (YYYY-MM)
  const grouped = useMemo(() => {
    const m = new Map<string, Transaction[]>()
    for (const tx of txs) {
      const key = tx.tx_date.slice(0, 7)
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(tx)
    }
    return m
  }, [txs])

  const outstandingRaw = balance?.outstanding ?? 0
  const outstanding = outstandingRaw > 0 ? outstandingRaw : 0
  const limit = balance?.credit_limit ?? 0
  const available = balance?.available ?? null
  const utilPct = limit > 0 ? Math.min((outstanding / limit) * 100, 100) : 0

  if (subSheet) {
    return (
      <Sheet title={subSheet === 'spend' ? 'Record Spend' : 'Record Payment'} onClose={() => setSubSheet(null)}>
        <CCSpendForm account={account} householdId={householdId} mode={subSheet}
          onSave={async () => { setSubSheet(null); await load() }}
          onCancel={() => setSubSheet(null)} />
      </Sheet>
    )
  }

  return (
    <Sheet title={account.name} onClose={onClose} tall>
      {/* Header stats */}
      <div className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-900/15 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-[var(--text-muted)]">Outstanding</p>
            <p className="text-2xl font-black text-rose-600">{outstanding > 0 ? fmtINR(-outstanding) : '₹0'}</p>
          </div>
          {limit > 0 && (
            <div className="text-right">
              <p className="text-xs text-[var(--text-muted)]">Available</p>
              <p className="text-base font-bold text-[var(--text-2)]">{available != null ? fmtVal(available) : '—'}</p>
              <p className="text-xs text-[var(--text-muted)]">of {fmtVal(limit)} limit</p>
            </div>
          )}
        </div>
        {limit > 0 && (
          <div className="fill-bar mt-3">
            <div className="fill-bar-inner bg-rose-400" style={{ width: `${utilPct}%` }} />
          </div>
        )}
        {account.statement_due_day && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">Payment due: {account.statement_due_day}th of each month</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => setSubSheet('spend')} disabled={!canWrite}
          className="flex-1 rounded-lg bg-rose-500 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50">
          + Record Spend
        </button>
        <button type="button" onClick={() => setSubSheet('payment')} disabled={!canWrite}
          className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          Pay Bill
        </button>
        <button type="button" onClick={onEdit} disabled={!canWrite}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
          Edit
        </button>
      </div>

      {/* Transaction history */}
      {loading ? (
        <p className="py-6 text-center text-xs text-[var(--text-muted)]">Loading…</p>
      ) : txs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
          <p className="text-2xl">💳</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">No transactions yet</p>
          <p className="text-xs text-[var(--text-muted)]">Tap "Record Spend" to add your first entry.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {Array.from(grouped.entries()).map(([month, monthTxs]) => {
            const monthSpend = monthTxs.filter(t => t.direction === 'outflow').reduce((s, t) => s + parseFloat(t.amount), 0)
            const monthPaid = monthTxs.filter(t => t.direction === 'inflow').reduce((s, t) => s + parseFloat(t.amount), 0)
            const label = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
            return (
              <div key={month}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
                  <div className="flex gap-2 text-xs">
                    {monthSpend > 0 && <span className="text-rose-500">{fmtINR(-monthSpend)}</span>}
                    {monthPaid > 0 && <span className="text-indigo-600">{fmtINR(monthPaid)}</span>}
                  </div>
                </div>
                <div className="grid gap-1">
                  {monthTxs.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2.5 shadow-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[var(--text)]">
                          {tx.external_reference || tx.transaction_type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{fmtDate(tx.tx_date)}</p>
                      </div>
                      <p className={`ml-3 shrink-0 text-sm font-semibold ${tx.direction === 'outflow' ? 'text-rose-600' : 'text-indigo-600'}`}>
                        {fmtINR(tx.direction === 'outflow' ? -parseFloat(tx.amount) : parseFloat(tx.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}

type GroupBy = 'none' | 'owner' | 'type'
type SortBy = 'name' | 'type' | 'institution'
type SheetState =
  | { type: 'none' }
  | { type: 'account'; item?: Account }
  | { type: 'card_detail'; item: Account }

export function AccountsPage() {
  const { canWrite } = useAuth()
  const { householdId, members } = useApp()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [ownerships, setOwnerships] = useState<AccountOwnership[]>([])
  const [loading, setLoading] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>('type')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' })

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const load = async () => {
    setLoading(true)
    try {
      const [a, o] = await Promise.all([portfolioApi.listAccounts(householdId), portfolioApi.listAccountOwnerships(undefined, householdId)])
      setAccounts(a); setOwnerships(o)
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [householdId])

  const ownerMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const a of accounts) {
      const owners = ownerships.filter((o) => o.account === a.id)
      if (owners.length) {
        m.set(a.id, owners.map((o) => members.find((mb) => mb.id === o.member)?.label ?? `#${o.member}`).join(', '))
      } else if (a.primary_member) {
        m.set(a.id, members.find((mb) => mb.id === a.primary_member)?.label ?? `#${a.primary_member}`)
      } else {
        m.set(a.id, 'Unassigned')
      }
    }
    return m
  }, [accounts, ownerships, members])

  const unownedAccounts = useMemo(
    () => accounts.filter(a => ownerMap.get(a.id) === 'Unassigned'),
    [accounts, ownerMap]
  )

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => {
      if (sortBy === 'type') return a.account_type.localeCompare(b.account_type)
      if (sortBy === 'institution') return (a.institution_name || '').localeCompare(b.institution_name || '')
      return a.name.localeCompare(b.name)
    })
  }, [accounts, sortBy])

  const grouped = useMemo(() => {
    const g = new Map<string, Account[]>()
    for (const a of sortedAccounts) {
      const key = groupBy === 'owner' ? (ownerMap.get(a.id) ?? 'Unassigned')
        : groupBy === 'type' ? a.account_type.replace(/_/g, ' ')
        : '__flat__'
      if (!g.has(key)) g.set(key, [])
      g.get(key)!.push(a)
    }
    return g
  }, [sortedAccounts, groupBy, ownerMap])

  const close = () => setSheet({ type: 'none' })
  const afterSave = async () => { close(); await load() }
  const deleteAccount = async (id: number) => {
    try { await portfolioApi.deleteAccount(id); close(); await load() }
    catch { alert('Failed to delete account.') }
  }

  const handleCardClick = (a: Account) => {
    if (a.account_type === 'credit_card') {
      setSheet({ type: 'card_detail', item: a })
    } else {
      setSheet({ type: 'account', item: a })
    }
  }

  const pillCls = (active: boolean) =>
    `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${active ? 'bg-indigo-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)]'}`

  const renderList = (list: Account[]) =>
    list.map((a) => <AccountCard key={a.id} account={a} onClick={() => handleCardClick(a)} />)

  return (
    <div className="grid grid-cols-1 min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">Group:</span>
          {([['type', 'Type'], ['owner', 'Owner'], ['none', 'None']] as [GroupBy, string][]).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setGroupBy(v)} className={pillCls(groupBy === v)}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">Sort:</span>
          {([['name', 'Name'], ['type', 'Type'], ['institution', 'Institution']] as [SortBy, string][]).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setSortBy(v)} className={pillCls(sortBy === v)}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={() => setSheet({ type: 'account' })} disabled={!canWrite}
          className="ml-auto shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          + Add Account
        </button>
      </div>

      {!loading && unownedAccounts.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/15 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
          <span className="mt-0.5 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {unownedAccounts.length} account{unownedAccounts.length > 1 ? 's' : ''} without an owner
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {unownedAccounts.map(a => a.name).join(', ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGroupBy('owner')}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            View
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center text-xs text-[var(--text-muted)]">Loading…</p>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-3xl">🏦</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-2)]">No accounts yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Tap + to add your first account.</p>
        </div>
      ) : groupBy === 'none' ? (
        <div className="grid grid-cols-1 min-w-0 gap-2">{renderList(sortedAccounts)}</div>
      ) : (
        <div className="flex w-full min-w-0 max-w-full flex-col gap-1 overflow-hidden">
          {Array.from(grouped.entries()).map(([label, group]) => {
            const isOpen = !collapsed.has(label)
            return (
              <div key={label} className="w-full min-w-0 max-w-full">
                <button type="button" onClick={() => toggleGroup(label)}
                  className="flex w-full items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] capitalize">{label}</span>
                    <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">{group.length}</span>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {isOpen && <div className="grid gap-2 pb-2">{renderList(group)}</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Ownership section */}
      {accounts.length > 0 && members.length > 1 && (
        <details className="group rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Ownership</p>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-[var(--text-faint)] transition-transform group-open:rotate-90">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
            </svg>
          </summary>
          <div className="border-t border-[var(--border)] px-4 py-1">
            <p className="py-2 text-xs text-[var(--text-muted)]">Assign each account to the member who owns it — drives per-member net worth on Home.</p>
            {accounts.map((acct) => {
              const existing = ownerships.filter((o) => o.account === acct.id)
              const currentMemberId = existing[0]?.member ?? acct.primary_member ?? null
              return (
                <OwnershipRow
                  key={acct.id}
                  name={acct.name}
                  subtitle={acct.account_type.replace(/_/g, ' ')}
                  currentMemberId={currentMemberId}
                  memberOptions={members}
                  onSave={async (memberId) => {
                    if (memberId === null) {
                      await Promise.all(existing.map((o) => portfolioApi.deleteAccountOwnership(o.id)))
                    } else {
                      if (existing.length === 0) {
                        await portfolioApi.createAccountOwnership({ account: acct.id, member: memberId, allocation_percent: '100.00' })
                      } else {
                        await Promise.all(existing.map((o) => portfolioApi.updateAccountOwnership(o.id, { member: memberId })))
                      }
                    }
                    await load()
                  }}
                />
              )
            })}
          </div>
        </details>
      )}

      {sheet.type === 'account' && (
        <Sheet title={sheet.item ? 'Edit Account' : 'Add Account'} onClose={close}>
          <AccountForm householdId={householdId} account={sheet.item} onSave={afterSave} onCancel={close}
            onDelete={sheet.item ? () => deleteAccount(sheet.item!.id) : undefined} />
        </Sheet>
      )}

      {sheet.type === 'card_detail' && (
        <CardDetailSheet
          account={sheet.item}
          householdId={householdId}
          onEdit={() => setSheet({ type: 'account', item: sheet.type === 'card_detail' ? sheet.item : undefined })}
          onClose={close}
        />
      )}
    </div>
  )
}
