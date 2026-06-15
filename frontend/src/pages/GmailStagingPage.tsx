import { useEffect, useState } from 'react'
import { gmailApi } from '../api/gmailApi'
import type { StagedTransaction, StagedTransactionPatch } from '../api/gmailApi'
import { expenseApi } from '../api/expenseApi'
import { useApp } from '../context/AppContext'
import type { ExpenseCategory, OptionItem } from '../types/domain'

const CLASSIFICATIONS = [
  { value: '', label: '— none —' },
  { value: 'spend', label: 'Spend' },
  { value: 'income', label: 'Income' },
  { value: 'internal_transfer', label: 'Internal Transfer' },
  { value: 'tracking', label: 'Tracking Only' },
]

// ---------------------------------------------------------------------------
// Confidence indicator
// ---------------------------------------------------------------------------

function ConfidencePill({ value }: { value: number | null }) {
  if (value === null) return <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">No match</span>
  const pct = Math.round(value * 100)
  const color = value >= 0.7 ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
    : value >= 0.4 ? 'bg-amber-50 border-amber-300 text-amber-700'
    : 'bg-red-50 border-red-300 text-red-700'
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`} title="Template confidence score">
      {pct}%
    </span>
  )
}

// ---------------------------------------------------------------------------
// Direction toggle
// ---------------------------------------------------------------------------

function DirectionBadge({ direction }: { direction?: string }) {
  if (!direction) return <span className="text-[var(--text-faint)]">—</span>
  return direction === 'inflow'
    ? <span className="font-bold text-emerald-600">↑ In</span>
    : <span className="font-bold text-[var(--text-2)]">↓ Out</span>
}

// ---------------------------------------------------------------------------
// Inline edit form
// ---------------------------------------------------------------------------

type EditFormProps = {
  msg: StagedTransaction
  accountOptions: OptionItem[]
  spendCategories: ExpenseCategory[]
  onSave: (patch: StagedTransactionPatch) => void
  onCancel: () => void
}

const TX_TYPES = ['other', 'deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'interest', 'salary', 'emi', 'premium']

function EditForm({ msg, accountOptions, spendCategories, onSave, onCancel }: EditFormProps) {
  const tx = msg.raw.parsed_tx ?? {}
  const [account, setAccount] = useState(tx.account ?? '')
  const [direction, setDirection] = useState(tx.direction ?? 'outflow')
  const [amount, setAmount] = useState(tx.amount ?? '')
  const [txType, setTxType] = useState(tx.transaction_type ?? 'other')
  const [txDate, setTxDate] = useState(tx.tx_date ?? '')
  const [extRef, setExtRef] = useState(tx.external_reference ?? '')
  const [classification, setClassification] = useState(msg.template_classification ?? '')
  const [spendCategory, setSpendCategory] = useState(msg.template_default_spend_category ?? '')

  function handleSave() {
    const patch: StagedTransactionPatch = {}
    if (account) patch.account = account
    if (direction) patch.direction = direction
    if (amount) patch.amount = amount
    if (txType) patch.transaction_type = txType
    if (txDate) patch.tx_date = txDate
    if (extRef !== tx.external_reference) patch.external_reference = extRef
    patch.classification = classification
    patch.spend_category = classification === 'spend' ? spendCategory : ''
    onSave(patch)
  }

  return (
    <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Account</span>
          <select value={account} onChange={e => setAccount(e.target.value)} className="rounded border border-[var(--border-2)] bg-[var(--surface)] px-2 py-1 text-xs">
            <option value="">— select —</option>
            {accountOptions.map(a => <option key={a.id} value={String(a.id)}>{a.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Direction</span>
          <select value={direction} onChange={e => setDirection(e.target.value)} className="rounded border border-[var(--border-2)] bg-[var(--surface)] px-2 py-1 text-xs">
            <option value="outflow">Outflow (Debit)</option>
            <option value="inflow">Inflow (Credit)</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Amount (INR)</span>
          <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="rounded border border-[var(--border-2)] bg-[var(--surface)] px-2 py-1 text-xs" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Type</span>
          <select value={txType} onChange={e => setTxType(e.target.value)} className="rounded border border-[var(--border-2)] bg-[var(--surface)] px-2 py-1 text-xs">
            {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Date</span>
          <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="rounded border border-[var(--border-2)] bg-[var(--surface)] px-2 py-1 text-xs" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Classification</span>
          <select value={classification} onChange={e => setClassification(e.target.value)} className="rounded border border-[var(--border-2)] bg-[var(--surface)] px-2 py-1 text-xs">
            {CLASSIFICATIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        {classification === 'spend' && (
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Spend Category</span>
            <select value={spendCategory} onChange={e => setSpendCategory(e.target.value)} className="rounded border border-[var(--border-2)] bg-[var(--surface)] px-2 py-1 text-xs">
              <option value="">— select —</option>
              {spendCategories.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>
          </label>
        )}
        <label className="col-span-2 flex flex-col gap-0.5 sm:col-span-3">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Reference</span>
          <input type="text" value={extRef} onChange={e => setExtRef(e.target.value)} className="rounded border border-[var(--border-2)] bg-[var(--surface)] px-2 py-1 text-xs" />
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">Save &amp; Approve</button>
        <button onClick={onCancel} className="rounded-lg border border-[var(--border-2)] px-3 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single staged row
// ---------------------------------------------------------------------------

type RowProps = {
  msg: StagedTransaction
  accountOptions: OptionItem[]
  spendCategories: ExpenseCategory[]
  onApproved: (updated: StagedTransaction) => void
  onRejected: (id: number) => void
  onDeleted: (id: number) => void
}

function StagedRow({ msg, accountOptions, spendCategories, onApproved, onRejected, onDeleted }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const tx = msg.raw.parsed_tx
  const val = msg.raw.parsed_valuation
  const accountLabel = accountOptions.find(a => String(a.id) === String(tx?.account))?.label ?? `Account #${tx?.account ?? '?'}`
  const isValOnly = msg.status === 'valuation_only' || (!tx && val)
  const subject = msg.raw.subject ?? ''
  const merchant = tx?.external_reference ?? subject

  async function handleApprove(patch?: StagedTransactionPatch) {
    setBusy(true)
    setError('')
    try {
      const result = await gmailApi.approveStaged(msg.id, patch)
      onApproved(result)
    } catch (e: any) {
      setError(e?.error ?? e?.message ?? 'Failed to approve')
    } finally {
      setBusy(false)
      setEditing(false)
    }
  }

  async function handleReject() {
    setBusy(true)
    setError('')
    try {
      await gmailApi.rejectStaged(msg.id)
      onRejected(msg.id)
    } catch (e: any) {
      setError(e?.error ?? e?.message ?? 'Failed to reject')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError('')
    try {
      await gmailApi.deleteStaged(msg.id)
      onDeleted(msg.id)
    } catch (e: any) {
      setError(e?.error ?? e?.message ?? 'Failed to delete')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  async function handleEditSave(patch: StagedTransactionPatch) {
    // Save edits first, then approve
    try {
      await gmailApi.updateStaged(msg.id, patch)
    } catch { /* ignore — approve will still use overrides */ }
    await handleApprove(patch)
  }

  const hasSuggestions = msg.suggestions && msg.suggestions.length > 0
  const hasWarning = hasSuggestions && msg.suggestions.some(s =>
    s.toLowerCase().includes('credit card') || s.toLowerCase().includes('no amount') || s.toLowerCase().includes('no template')
  )

  return (
    <div className={`rounded-xl border bg-[var(--surface)] shadow-sm transition-all ${hasWarning ? 'border-amber-200' : 'border-[var(--border)]'}`}>
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        {/* Date */}
        <span className="w-20 shrink-0 pt-0.5 text-xs text-[var(--text-muted)]">{tx?.tx_date ?? val?.valuation_date ?? '—'}</span>

        {/* Direction + amount */}
        <div className="w-28 shrink-0 text-right">
          {isValOnly
            ? <span className="text-xs text-[var(--text-muted)]">Balance update</span>
            : <>
                <DirectionBadge direction={tx?.direction} />
                <span className={`ml-1 font-semibold tabular-nums ${tx?.direction === 'inflow' ? 'text-emerald-700' : 'text-[var(--text)]'}`}>
                  {tx?.amount ? `₹${Number(tx.amount).toLocaleString('en-IN')}` : <span className="font-normal text-[var(--text-faint)]">no amount</span>}
                </span>
              </>
          }
        </div>

        {/* Description */}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text)]">{merchant || '—'}</p>
          <p className="truncate text-xs text-[var(--text-muted)]">{accountLabel}</p>
        </div>

        {/* Template + confidence */}
        <div className="hidden sm:flex shrink-0 flex-col items-end gap-1">
          {msg.template_key && (
            <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{msg.template_key.replace(/_/g, ' ')}</span>
          )}
          {msg.template_classification && (
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600">
              {msg.template_classification.replace(/_/g, ' ')}
              {msg.template_classification === 'spend' && msg.template_default_spend_category ? ` · ${msg.template_default_spend_category}` : ''}
            </span>
          )}
          <ConfidencePill value={msg.confidence} />
        </div>

        {/* Actions */}
        {!editing && !confirmDelete && (
          <div className="flex shrink-0 gap-1">
            {msg.status !== 'rejected' && (
              <button
                onClick={() => handleApprove()}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              disabled={busy}
              className="rounded-lg border border-[var(--border-2)] px-3 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              Edit
            </button>
            {msg.status === 'pending' && (
              <button
                onClick={handleReject}
                disabled={busy}
                className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
            )}
            {msg.status === 'rejected' && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
        )}
        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">Delete permanently?</span>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? '…' : 'Yes, delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="rounded-lg border border-[var(--border-2)] px-3 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {hasSuggestions && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {msg.suggestions.map((s, i) => (
            <span key={i} className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] text-amber-700">
              ⚠ {s}
            </span>
          ))}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="border-t border-[var(--border)] px-4 pb-3">
          <EditForm
            msg={msg}
            accountOptions={accountOptions}
            spendCategories={spendCategories}
            onSave={handleEditSave}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {/* Email metadata */}
      {!editing && (msg.raw.from || subject) && (
        <details className="border-t border-[var(--border)]">
          <summary className="cursor-pointer px-4 py-1 text-[10px] text-[var(--text-faint)] hover:text-[var(--text-muted)]">Show email</summary>
          <div className="px-4 pb-3 pt-1 text-xs text-[var(--text-muted)] space-y-0.5">
            {msg.raw.from && <p><strong>From:</strong> {msg.raw.from}</p>}
            {subject && <p><strong>Subject:</strong> {subject}</p>}
            {msg.raw.snippet && <p className="text-[var(--text-muted)] italic">{msg.raw.snippet}</p>}
          </div>
        </details>
      )}

      {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

export function GmailStagingPage({ accountOptions }: { accountOptions: OptionItem[] }) {
  const { householdId } = useApp()
  const [items, setItems] = useState<StagedTransaction[]>([])
  const [spendCategories, setSpendCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState('')
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [confirmClearSync, setConfirmClearSync] = useState(false)
  const [dangerBusy, setDangerBusy] = useState(false)

  async function load(status: StatusFilter = statusFilter) {
    setLoading(true)
    setError('')
    try {
      const res = await gmailApi.getStaged(status)
      setItems(res.results)
    } catch (e: any) {
      setError(e?.error ?? 'Failed to load staged transactions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  useEffect(() => {
    if (!householdId) return
    expenseApi.listCategories(householdId).then(setSpendCategories).catch(() => {})
  }, [householdId])

  function handleApproved(updated: StagedTransaction) {
    if (statusFilter === 'pending') {
      setItems(prev => prev.filter(m => m.id !== updated.id))
    } else {
      setItems(prev => prev.map(m => m.id === updated.id ? updated : m))
    }
  }

  function handleRejected(id: number) {
    if (statusFilter === 'pending') {
      setItems(prev => prev.filter(m => m.id !== id))
    } else {
      setItems(prev => prev.map(m => m.id === id ? { ...m, status: 'rejected' } : m))
    }
  }

  function handleDeleted(id: number) {
    setItems(prev => prev.filter(m => m.id !== id))
  }

  // High-confidence items with no warnings — safe to bulk-approve
  const autoApprovable = items.filter(m =>
    m.status === 'pending' &&
    (m.confidence ?? 0) >= 0.7 &&
    (m.suggestions ?? []).length === 0 &&
    m.raw.parsed_tx?.amount &&
    m.raw.parsed_tx?.direction
  )

  async function handleBulkApprove() {
    if (!autoApprovable.length) return
    setBulkBusy(true)
    setBulkMsg('')
    try {
      const res = await gmailApi.bulkApproveStaged(autoApprovable.map(m => m.id))
      const approved = res.results.filter(r => r.status === 'approved').length
      const failed = res.results.filter(r => r.error).length
      setBulkMsg(`Approved ${approved} transaction${approved !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}.`)
      await load()
    } catch (e: any) {
      setBulkMsg(e?.error ?? 'Bulk approve failed')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleDeleteAll() {
    setDangerBusy(true)
    try {
      await gmailApi.bulkDeleteStaged()
      setItems([])
      setConfirmDeleteAll(false)
    } catch { /* ignore */ } finally {
      setDangerBusy(false)
    }
  }

  async function handleClearSync() {
    setDangerBusy(true)
    try {
      await gmailApi.resetImportHistory(true)
      setConfirmClearSync(false)
    } catch { /* ignore */ } finally {
      setDangerBusy(false)
    }
  }

  const pendingCount = items.filter(m => m.status === 'pending').length

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Gmail Transactions</h1>
          <p className="text-sm text-[var(--text-muted)]">Review and approve transactions parsed from your emails before they enter the ledger.</p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="rounded-lg border border-[var(--border-2)] px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Danger zone — Delete All + Clear Sync */}
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-rose-700">Danger Zone</p>
        <div className="flex flex-wrap gap-3">

          {/* Delete all staged transactions */}
          {!confirmDeleteAll ? (
            <button
              type="button"
              onClick={() => { setConfirmDeleteAll(true); setConfirmClearSync(false) }}
              className="rounded-lg border border-rose-300 bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              🗑 Delete All Transactions
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-[var(--surface)] px-3 py-1.5">
              <span className="text-xs text-rose-700">Delete all {items.length} staged transactions?</span>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={dangerBusy}
                className="rounded bg-rose-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {dangerBusy ? '…' : 'Yes, delete all'}
              </button>
              <button type="button" onClick={() => setConfirmDeleteAll(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-2)]">Cancel</button>
            </div>
          )}

          {/* Clear sync history */}
          {!confirmClearSync ? (
            <button
              type="button"
              onClick={() => { setConfirmClearSync(true); setConfirmDeleteAll(false) }}
              className="rounded-lg border border-rose-300 bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              🔄 Clear Sync History
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-[var(--surface)] px-3 py-1.5">
              <span className="text-xs text-rose-700">Reset sync checkpoint? Gmail will re-scan from scratch.</span>
              <button
                type="button"
                onClick={handleClearSync}
                disabled={dangerBusy}
                className="rounded bg-rose-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {dangerBusy ? '…' : 'Yes, clear'}
              </button>
              <button type="button" onClick={() => setConfirmClearSync(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-2)]">Cancel</button>
            </div>
          )}

        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
        {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'}`}
          >
            {s}{s === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {/* Bulk approve bar */}
      {statusFilter === 'pending' && autoApprovable.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <p className="text-sm text-emerald-800">
            <strong>{autoApprovable.length}</strong> high-confidence transaction{autoApprovable.length !== 1 ? 's' : ''} ready to approve automatically.
          </p>
          <button
            onClick={handleBulkApprove}
            disabled={bulkBusy}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {bulkBusy ? 'Approving…' : `Approve ${autoApprovable.length}`}
          </button>
        </div>
      )}
      {bulkMsg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{bulkMsg}</p>
      )}

      {/* Error */}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* List */}
      {loading && items.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center">
          <p className="text-[var(--text-muted)]">
            {statusFilter === 'pending' ? 'No pending transactions — all clear!' : `No ${statusFilter} transactions.`}
          </p>
          {statusFilter === 'pending' && (
            <p className="mt-1 text-xs text-[var(--text-faint)]">Run a Gmail sync to pull in new emails.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(msg => (
            <StagedRow
              key={msg.id}
              msg={msg}
              accountOptions={accountOptions}
              spendCategories={spendCategories}
              onApproved={handleApproved}
              onRejected={handleRejected}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-xs text-[var(--text-muted)] space-y-1">
        <p className="font-medium text-[var(--text-2)]">Confidence score</p>
        <div className="flex flex-wrap gap-3">
          <span><span className="rounded-full bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 text-emerald-700">≥70%</span> All template signals matched</span>
          <span><span className="rounded-full bg-amber-50 border border-amber-300 px-1.5 py-0.5 text-amber-700">40–69%</span> Partial match</span>
          <span><span className="rounded-full bg-red-50 border border-red-300 px-1.5 py-0.5 text-red-700">&lt;40%</span> Low match — review carefully</span>
        </div>
      </div>
    </div>
  )
}
