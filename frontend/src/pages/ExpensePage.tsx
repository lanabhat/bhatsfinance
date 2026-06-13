import { useEffect, useMemo, useState } from 'react'
import { expenseApi } from '../api/expenseApi'
import type { RecordTransactionPayload } from '../api/expenseApi'
import { useMaskedFmt } from '../components/common/Money'
import { DeleteButton } from '../components/common/DeleteButton'
import { QuickExpenseForm } from '../components/expenses/QuickExpenseForm'
import { ReassignDialog } from '../components/expenses/ReassignDialog'
import { EditSpendDialog } from '../components/expenses/EditSpendDialog'
import { EmojiPicker } from '../components/expenses/EmojiPicker'
import { Drawer } from '../components/ui/Drawer'
import { useAuth } from '../context/AuthContext'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { normalizeApiError } from '../hooks/errorUtils'
import type { ExpenseCategory, Transaction, UnmappedExpenseInfo, OptionItem } from '../types/domain'
import { ledgerApi } from '../api/ledgerApi'

type Props = {
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  canDelete: (e: DeleteEntity) => boolean
}

export function ExpensePage({ householdId, memberOptions, accountOptions, canDelete }: Props) {
  const { canWrite } = useAuth()
  const [items, setItems] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [unmapped, setUnmapped] = useState<UnmappedExpenseInfo>({ count: 0, expenses: [] })
  const [showForm, setShowForm] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [showCategoryDrawer, setShowCategoryDrawer] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fmt = useMaskedFmt()

  // Category management state
  const [editingCat, setEditingCat] = useState<ExpenseCategory | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [catSaving, setCatSaving] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [newKey, setNewKey] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<ExpenseCategory | null>(null)
  const [pickerFor, setPickerFor] = useState<'edit' | 'new' | null>(null)

  // Edit spend state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const catLabel = useMemo(() => Object.fromEntries(categories.map(c => [c.key, c.label])), [categories])
  const catIcon = useMemo(() => Object.fromEntries(categories.map(c => [c.key, c.icon])), [categories])

  const loadData = async () => {
    try {
      setItems(await expenseApi.listSpends(householdId))
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const loadCategories = async () => {
    try {
      const [cats, unm] = await Promise.all([
        expenseApi.listCategories(householdId),
        expenseApi.fetchUnmapped(householdId),
      ])
      setCategories(cats)
      setUnmapped(unm)
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    void loadData()
    void loadCategories()
  }, [householdId])

  const save = async (form: RecordTransactionPayload) => {
    setSaving(true)
    setError('')
    try {
      await expenseApi.createRecorded(form)
      setShowForm(false)
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const cancelForm = () => { setShowForm(false); setError('') }

  const saveEditedSpend = async (patch: {
    tx_date: string
    amount: string
    account: number
    member: number | null
    spend_category: string
    description: string
    notes: string
  }) => {
    if (!editingTx) return
    setEditSaving(true)
    setEditError('')
    try {
      const amountChanged = patch.amount !== editingTx.amount
      const accountChanged = patch.account !== editingTx.account
      if (amountChanged || accountChanged) {
        // Financial fields changed — use correction flow (reversal + replacement)
        await ledgerApi.correctTransaction({
          originalTransactionId: editingTx.id,
          corrected: {
            household: householdId,
            member: patch.member,
            account: patch.account,
            tx_date: patch.tx_date,
            amount: patch.amount,
            direction: editingTx.direction,
            transaction_type: editingTx.transaction_type,
            classification: editingTx.classification,
            spend_category: patch.spend_category,
            description: patch.description,
            notes: patch.notes,
          },
        })
      } else {
        // Metadata-only change — direct update, no reversal needed
        await ledgerApi.updateTransaction(editingTx.id, {
          tx_date: patch.tx_date,
          member: patch.member,
          spend_category: patch.spend_category,
          description: patch.description,
          notes: patch.notes,
        })
      }
      setEditingTx(null)
      await loadData()
    } catch (e) {
      setEditError(normalizeApiError(e))
    } finally {
      setEditSaving(false)
    }
  }

  // Category CRUD
  const startEdit = (cat: ExpenseCategory) => {
    setEditingCat(cat)
    setEditLabel(cat.label)
    setEditIcon(cat.icon)
  }

  const saveEdit = async () => {
    if (!editingCat) return
    setCatSaving(true)
    try {
      await expenseApi.updateCategory(editingCat.id, { label: editLabel, icon: editIcon })
      setEditingCat(null)
      await loadCategories()
    } finally { setCatSaving(false) }
  }

  const saveNew = async () => {
    if (!newLabel.trim() || !newKey.trim()) return
    setCatSaving(true)
    try {
      await expenseApi.createCategory({ household: householdId, key: newKey.trim(), label: newLabel.trim(), icon: newIcon || '📌' })
      setNewLabel(''); setNewKey(''); setNewIcon(''); setShowNewForm(false)
      await loadCategories()
    } finally { setCatSaving(false) }
  }

  const handleDeleteCategory = async (reassignToKey: string) => {
    if (!reassignTarget) return
    setCatSaving(true)
    try {
      await expenseApi.deleteCategory(reassignTarget.id, reassignToKey)
      setReassignTarget(null)
      await loadCategories()
      await loadData()
    } finally { setCatSaving(false) }
  }

  const thisMonth = new Date().toISOString().slice(0, 7)

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {}
    items.filter(x => x.tx_date.startsWith(thisMonth)).forEach(x => {
      const cat = x.spend_category || 'other'
      map[cat] = (map[cat] || 0) + Number(x.amount)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [items, thisMonth])

  const monthlyTotal = categoryTotals.reduce((s, [, v]) => s + v, 0)

  const grouped = useMemo(() => {
    const map: Record<string, Transaction[]> = {}
    items.slice(0, 60).forEach(x => {
      if (!map[x.tx_date]) map[x.tx_date] = []
      map[x.tx_date].push(x)
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [items])

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-2 py-4 pb-24 md:px-4 md:pb-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Transactions</h1>
          <p className="text-sm text-[var(--text-muted)]">{thisMonth}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="#/spend-trends" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]">
            Trends →
          </a>
          <button
            type="button"
            onClick={() => setShowCategoryDrawer(true)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            Categories
          </button>
          {canWrite && !showForm && (
            <button
              type="button"
              onClick={() => { setShowForm(true); setFormKey(k => k + 1) }}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              + Record
            </button>
          )}
        </div>
      </div>

      {/* ── Unmapped categories warning ── */}
      {unmapped.count > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
          <span className="mt-0.5 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {unmapped.count} spend{unmapped.count > 1 ? 's' : ''} have an unrecognised category
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Open Categories to reassign or add the missing category.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCategoryDrawer(true)}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            Fix now
          </button>
        </div>
      )}

      {/* ── Record Transaction Form ── */}
      {showForm && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text)]">Record Transaction</h2>
            <button type="button" onClick={cancelForm} className="text-[var(--text-faint)] hover:text-[var(--text)]">✕</button>
          </div>
          <QuickExpenseForm
            householdId={householdId}
            memberOptions={memberOptions}
            accountOptions={accountOptions}
            categories={categories}
            onSave={save}
            onCancel={cancelForm}
            saving={saving}
            error={error}
            refreshKey={formKey}
          />
        </div>
      )}

      {/* ── Monthly category summary ── */}
      {categoryTotals.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
          <p className="mb-3 text-sm font-semibold text-[var(--text)]">This month</p>
          <div className="space-y-2">
            {categoryTotals.map(([cat, total]) => {
              const pct = monthlyTotal > 0 ? (total / monthlyTotal) * 100 : 0
              return (
                <div key={cat} className="flex items-center gap-2">
                  <span className="w-5 text-center text-base">{catIcon[cat] ?? '📌'}</span>
                  <span className="w-28 shrink-0 text-xs text-[var(--text-2)]">{catLabel[cat] || cat}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]" style={{ height: 6 }}>
                    <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums text-[var(--text-2)]">{fmt(total)}</span>
                  <span className="w-8 shrink-0 text-right text-[10px] text-[var(--text-faint)]">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
            <div className="flex items-center gap-2 border-t border-[var(--border)] pt-2">
              <span className="w-5" />
              <span className="w-28 shrink-0 text-xs font-semibold text-[var(--text)]">Total</span>
              <div className="flex-1" />
              <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--text)]">{fmt(monthlyTotal)}</span>
              <span className="w-8" />
            </div>
          </div>
        </div>
      )}

      {/* ── Recent spends list ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--text)]">Recent Spends</p>
        </div>

        {grouped.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <span className="text-3xl">🧾</span>
            <p className="text-sm font-medium text-[var(--text-2)]">No spends recorded yet</p>
            <p className="text-xs text-[var(--text-muted)]">Tap + Record to add your first entry.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {grouped.map(([date, dayItems]) => (
              <div key={date}>
                <div className="flex items-center justify-between bg-[var(--surface-2)] px-4 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
                    {fmt(dayItems.reduce((s, x) => s + Number(x.amount), 0))}
                  </span>
                </div>
                {dayItems.map(x => {
                  const cat = x.spend_category || 'other'
                  return (
                    <div key={x.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]">
                      <span className="shrink-0 text-xl">{catIcon[cat] ?? '📌'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text)]">
                          {x.description || catLabel[cat] || cat}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {catLabel[cat] || cat}
                          {x.member ? ` · ${memberOptions.find(m => m.id === x.member)?.label ?? `Member #${x.member}`}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--text)]">
                        {fmt(Number(x.amount))}
                      </span>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => { setEditingTx(x); setEditError('') }}
                          className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                        >
                          Edit
                        </button>
                      )}
                      <DeleteButton
                        disabled={!canDelete('transaction')}
                        onDelete={async () => { await ledgerApi.deleteTransaction(x.id); await loadData() }}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Manage Categories Drawer ── */}
      <Drawer open={showCategoryDrawer} onClose={() => { setShowCategoryDrawer(false); setEditingCat(null); setShowNewForm(false) }} title="Manage Categories">
        <div className="space-y-1">

          {unmapped.count > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/20">
              <p className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                ⚠️ {unmapped.count} spend{unmapped.count > 1 ? 's' : ''} with unrecognised categories
              </p>
              <div className="space-y-1">
                {unmapped.expenses.slice(0, 5).map(e => (
                  <div key={e.id} className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400">
                    <span className="truncate">{e.description || e.spend_category} · {e.tx_date}</span>
                    <span className="shrink-0 font-medium">"{e.spend_category}"</span>
                  </div>
                ))}
                {unmapped.expenses.length > 5 && (
                  <p className="text-xs text-amber-600">…and {unmapped.expenses.length - 5} more</p>
                )}
              </div>
            </div>
          )}

          {categories.map(cat => (
            <div key={cat.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
              {editingCat?.id === cat.id ? (
                <div className="flex items-center gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => setPickerFor('edit')}
                    className="w-12 h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xl flex items-center justify-center hover:bg-[var(--surface-2)] transition-colors"
                    title="Choose icon"
                  >
                    {editIcon || '📌'}
                  </button>
                  {pickerFor === 'edit' && (
                    <EmojiPicker value={editIcon} onChange={setEditIcon} onClose={() => setPickerFor(null)} />
                  )}
                  <input
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={catSaving || !editLabel.trim()}
                    className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-40"
                  >
                    {catSaving ? '…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditingCat(null)} className="text-xs text-[var(--text-muted)]">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-xl">{cat.icon}</span>
                  <span className="flex-1 text-sm font-medium text-[var(--text)]">{cat.label}</span>
                  {cat.is_builtin && (
                    <span className="text-[10px] text-[var(--text-faint)]">built-in</span>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(cat)}
                    className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  {!cat.is_builtin && (
                    <button
                      type="button"
                      onClick={() => setReassignTarget(cat)}
                      className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {showNewForm ? (
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="mb-2 text-xs font-semibold text-[var(--text-2)]">New Category</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPickerFor('new')}
                  className="w-12 h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xl flex items-center justify-center hover:bg-[var(--surface-2)] transition-colors"
                  title="Choose icon"
                >
                  {newIcon || '📌'}
                </button>
                {pickerFor === 'new' && (
                  <EmojiPicker value={newIcon} onChange={setNewIcon} onClose={() => setPickerFor(null)} />
                )}
                <input
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Label (e.g. Travel)"
                  value={newLabel}
                  onChange={e => {
                    setNewLabel(e.target.value)
                    if (!newKey) setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30))
                  }}
                />
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="key (auto-generated)"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30))}
                />
                <button
                  type="button"
                  onClick={saveNew}
                  disabled={catSaving || !newLabel.trim() || !newKey.trim()}
                  className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-40"
                >
                  {catSaving ? '…' : 'Add'}
                </button>
                <button type="button" onClick={() => setShowNewForm(false)} className="text-xs text-[var(--text-muted)]">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-3 text-sm text-[var(--text-muted)] hover:border-primary-400 hover:text-primary-600"
            >
              + Add Category
            </button>
          )}
        </div>
      </Drawer>

      {reassignTarget && (
        <ReassignDialog
          open={!!reassignTarget}
          deletingCategory={reassignTarget}
          allCategories={categories}
          expenseCount={items.filter(x => x.spend_category === reassignTarget.key).length}
          onConfirm={handleDeleteCategory}
          onCancel={() => setReassignTarget(null)}
          saving={catSaving}
        />
      )}

      {editingTx && (
        <EditSpendDialog
          open={!!editingTx}
          transaction={editingTx}
          categories={categories}
          memberOptions={memberOptions}
          accountOptions={accountOptions}
          onSave={saveEditedSpend}
          onCancel={() => { setEditingTx(null); setEditError('') }}
          saving={editSaving}
          error={editError}
        />
      )}
    </div>
  )
}
