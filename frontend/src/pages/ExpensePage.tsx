import { Fragment, useEffect, useMemo, useState } from 'react'
import { expenseApi } from '../api/expenseApi'
import type { RecordTransactionPayload } from '../api/expenseApi'
import { Money } from '../components/common/Money'
import { DeleteButton } from '../components/common/DeleteButton'
import { QuickExpenseForm } from '../components/expenses/QuickExpenseForm'
import { ReassignDialog } from '../components/expenses/ReassignDialog'
import { EditSpendDialog } from '../components/expenses/EditSpendDialog'
import { EmojiPicker } from '../components/expenses/EmojiPicker'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { Drawer } from '../components/ui/Drawer'
import { useAuth } from '../context/AuthContext'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { normalizeApiError } from '../hooks/errorUtils'
import type { ExpenseCategory, Tag, Transaction, UnmappedExpenseInfo, OptionItem } from '../types/domain'
import { ledgerApi } from '../api/ledgerApi'
import { tagApi } from '../api/tagApi'

type Props = {
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  canDelete: (e: DeleteEntity) => boolean
}

const SPEND_PAGE_SIZE = 25
const GROUPED_FETCH_LIMIT = 500

type GroupBy = 'none' | 'date' | 'month' | 'category' | 'member' | 'tag' | 'amount'

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'date', label: 'Date' },
  { value: 'month', label: 'Month' },
  { value: 'category', label: 'Category' },
  { value: 'member', label: 'Member' },
  { value: 'tag', label: 'Tag' },
  { value: 'amount', label: 'Amount range' },
]

const AMOUNT_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: 'Under ₹500', min: 0, max: 500 },
  { label: '₹500 – ₹2,000', min: 500, max: 2000 },
  { label: '₹2,000 – ₹10,000', min: 2000, max: 10000 },
  { label: '₹10,000 – ₹50,000', min: 10000, max: 50000 },
  { label: 'Over ₹50,000', min: 50000, max: null },
]

function amountBucketLabel(amount: number): string {
  const bucket = AMOUNT_BUCKETS.find(b => amount >= b.min && (b.max === null || amount < b.max))
  return bucket?.label ?? 'Other'
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

  // Table search/filter/sort/pagination state (for the spends list)
  const [tableRows, setTableRows] = useState<Transaction[]>([])
  const [tableCount, setTableCount] = useState(0)
  const [tableLoading, setTableLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMember, setFilterMember] = useState('')
  const [filterTags, setFilterTags] = useState<number[]>([])
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [dateAfter, setDateAfter] = useState('')
  const [dateBefore, setDateBefore] = useState('')
  const [ordering, setOrdering] = useState('-tx_date')
  const [page, setPage] = useState(1)
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tagsMenuOpen, setTagsMenuOpen] = useState(false)
  const [tagsCleaning, setTagsCleaning] = useState(false)
  const [tagsCleanupMessage, setTagsCleanupMessage] = useState('')

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

  const loadTags = async () => {
    try {
      setAllTags(await tagApi.list(householdId))
    } catch { /* non-fatal */ }
  }

  const cleanupUnusedTags = async () => {
    setTagsCleaning(true)
    setTagsCleanupMessage('')
    try {
      const { deleted } = await tagApi.cleanup(householdId)
      setTagsCleanupMessage(deleted > 0 ? `Removed ${deleted} unused tag${deleted === 1 ? '' : 's'}.` : 'No unused tags found.')
      setFilterTags(prev => prev.filter(id => allTags.some(t => t.id === id)))
      await loadTags()
    } catch {
      setTagsCleanupMessage('Cleanup failed.')
    } finally {
      setTagsCleaning(false)
      setTagsMenuOpen(false)
    }
  }

  useEffect(() => {
    void loadData()
    void loadCategories()
    void loadTags()
  }, [householdId])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset to page 1 whenever a filter/search/order changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, filterCategory, filterMember, filterTags, amountMin, amountMax, dateAfter, dateBefore, ordering])

  const tableParams = () => ({
    householdId,
    classification: 'spend' as const,
    search: debouncedSearch || undefined,
    member: filterMember ? Number(filterMember) : undefined,
    spendCategory: filterCategory || undefined,
    tags: filterTags.length > 0 ? filterTags : undefined,
    amountMin: amountMin ? Number(amountMin) : undefined,
    amountMax: amountMax ? Number(amountMax) : undefined,
    txDateAfter: dateAfter || undefined,
    txDateBefore: dateBefore || undefined,
  })

  const loadTable = async () => {
    setTableLoading(true)
    try {
      if (groupBy === 'none') {
        const res = await ledgerApi.listTransactionsPage({
          ...tableParams(),
          page,
          pageSize: SPEND_PAGE_SIZE,
          ordering,
        })
        setTableRows(res.results)
        setTableCount(res.count)
      } else {
        // Grouping needs the full matching set (not just one page) to bucket
        // and subtotal client-side — capped so a huge history can't hang the page.
        const res = await ledgerApi.listTransactionsPage({
          ...tableParams(),
          page: 1,
          pageSize: GROUPED_FETCH_LIMIT,
          ordering,
        })
        setTableRows(res.results)
        setTableCount(res.count)
      }
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setTableLoading(false)
    }
  }

  useEffect(() => {
    void loadTable()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, page, debouncedSearch, filterCategory, filterMember, filterTags, amountMin, amountMax, dateAfter, dateBefore, ordering, groupBy])

  const resetTableFilters = () => {
    setSearch('')
    setFilterCategory('')
    setFilterMember('')
    setFilterTags([])
    setAmountMin('')
    setAmountMax('')
    setDateAfter('')
    setDateBefore('')
    setOrdering('-tx_date')
    setGroupBy('none')
  }

  const hasActiveTableFilters = !!(
    search || filterCategory || filterMember || filterTags.length > 0 || amountMin || amountMax ||
    dateAfter || dateBefore || ordering !== '-tx_date' || groupBy !== 'none'
  )

  const tagName = useMemo(() => Object.fromEntries(allTags.map(t => [t.id, t.name])), [allTags])

  // Client-side grouping of the (already filtered) rows in tableRows.
  const groupedRows = useMemo(() => {
    if (groupBy === 'none') return null
    const groups = new Map<string, Transaction[]>()
    const pushTo = (key: string, tx: Transaction) => {
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(tx)
    }
    for (const tx of tableRows) {
      if (groupBy === 'date') {
        pushTo(tx.tx_date, tx)
      } else if (groupBy === 'month') {
        pushTo(tx.tx_date.slice(0, 7), tx)
      } else if (groupBy === 'category') {
        const cat = tx.spend_category || 'other'
        pushTo(catLabel[cat] || cat, tx)
      } else if (groupBy === 'member') {
        pushTo(tx.member ? memberOptions.find(m => m.id === tx.member)?.label ?? `Member #${tx.member}` : 'Unassigned', tx)
      } else if (groupBy === 'tag') {
        if (tx.tags.length === 0) { pushTo('Untagged', tx); continue }
        for (const tagId of tx.tags) pushTo(tagName[tagId] ?? `#${tagId}`, tx)
      } else if (groupBy === 'amount') {
        pushTo(amountBucketLabel(Number(tx.amount)), tx)
      }
    }
    // Sort groups by total amount desc, except date/month which sort chronologically (respecting current ordering).
    const entries = Array.from(groups.entries())
    if (groupBy === 'date' || groupBy === 'month') {
      entries.sort(([a], [b]) => ordering.startsWith('-') ? b.localeCompare(a) : a.localeCompare(b))
    } else if (groupBy === 'amount') {
      entries.sort(([a], [b]) => AMOUNT_BUCKETS.findIndex(x => x.label === a) - AMOUNT_BUCKETS.findIndex(x => x.label === b))
    } else {
      entries.sort(([, a], [, b]) => b.reduce((s, t) => s + Number(t.amount), 0) - a.reduce((s, t) => s + Number(t.amount), 0))
    }
    return entries
  }, [groupBy, tableRows, catLabel, memberOptions, tagName, ordering])

  const save = async (form: RecordTransactionPayload) => {
    setSaving(true)
    setError('')
    try {
      await expenseApi.createRecorded(form)
      setShowForm(false)
      await loadData()
      await loadTable()
      await loadTags()
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
    tags: number[]
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
            tags: patch.tags,
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
          tags: patch.tags,
          notes: patch.notes,
        })
      }
      setEditingTx(null)
      await loadData()
      await loadTable()
      await loadTags()
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
      await loadTable()
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
  const tableTotalPages = Math.max(1, Math.ceil(tableCount / SPEND_PAGE_SIZE))

  const SpendRow = ({ x }: { x: Transaction }) => {
    const cat = x.spend_category || 'other'
    return (
      <tr className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]">
        <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-faint)]">{x.tx_date}</td>
        <td className="px-3 py-2 text-sm">
          <span className="mr-1">{catIcon[cat] ?? '📌'}</span>
          {catLabel[cat] || cat}
        </td>
        <td className="max-w-[16rem] truncate px-3 py-2 text-sm text-[var(--text-2)]" title={x.description}>
          {x.description || '—'}
        </td>
        <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
          {x.tags.length > 0 ? x.tags.map(id => `#${tagName[id] ?? id}`).join(' ') : '—'}
        </td>
        <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
          {x.member ? memberOptions.find(m => m.id === x.member)?.label ?? `Member #${x.member}` : '—'}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold">
          <Money value={Number(x.amount)} />
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            {canWrite && (
              <button
                type="button"
                onClick={() => { setEditingTx(x); setEditError('') }}
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
              >
                Edit
              </button>
            )}
            <DeleteButton
              disabled={!canDelete('transaction')}
              onDelete={async () => { await ledgerApi.deleteTransaction(x.id); await loadData(); await loadTable() }}
            />
          </div>
        </td>
      </tr>
    )
  }

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="space-y-4 px-2 py-4 pb-24 md:px-4 md:pb-6">

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
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/15 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
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
                  <Money value={total} className="w-20 shrink-0 text-right text-xs font-medium tabular-nums text-[var(--text-2)]" />
                  <span className="w-8 shrink-0 text-right text-[10px] text-[var(--text-faint)]">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
            <div className="flex items-center gap-2 border-t border-[var(--border)] pt-2">
              <span className="w-5" />
              <span className="w-28 shrink-0 text-xs font-semibold text-[var(--text)]">Total</span>
              <div className="flex-1" />
              <Money value={monthlyTotal} className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--text)]" />
              <span className="w-8" />
            </div>
          </div>
        </div>
      )}

      {/* ── Spends table: search, filter, sort, paginate ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--text)]">All Spends</p>
        </div>

        <div className="grid gap-2 border-b border-[var(--border)] px-4 py-3">
          <input
            type="search"
            placeholder="Search description, notes, or amount…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">
              Category
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]">
                <option value="">All</option>
                {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">
              Member
              <select value={filterMember} onChange={e => setFilterMember(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]">
                <option value="">All</option>
                {memberOptions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">
              From
              <input type="date" value={dateAfter} onChange={e => setDateAfter(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]" />
            </label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">
              To
              <input type="date" value={dateBefore} onChange={e => setDateBefore(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]" />
            </label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">
              Min ₹
              <input type="number" min="0" placeholder="0" value={amountMin} onChange={e => setAmountMin(e.target.value)} className="w-24 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]" />
            </label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">
              Max ₹
              <input type="number" min="0" placeholder="Any" value={amountMax} onChange={e => setAmountMax(e.target.value)} className="w-24 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]" />
            </label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">
              Group by
              <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]">
                {GROUP_BY_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </label>
            {hasActiveTableFilters && (
              <button type="button" onClick={resetTableFilters} className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-300">
                Reset filters
              </button>
            )}
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--text-muted)]">Tags:</span>
              {canWrite && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setTagsMenuOpen(p => !p) }}
                    className="rounded px-1 text-xs text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
                    aria-label="Tag options"
                    title="Tag options"
                  >
                    ⋮
                  </button>
                  {tagsMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setTagsMenuOpen(false)} />
                      <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 text-left shadow-lg">
                        <button
                          type="button"
                          disabled={tagsCleaning}
                          onClick={() => void cleanupUnusedTags()}
                          className="block w-full px-3 py-2 text-left text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                        >
                          {tagsCleaning ? 'Cleaning up…' : 'Clean up unused tags'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {allTags.map(t => {
                const selected = filterTags.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilterTags(prev => selected ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-all ${
                      selected
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                        : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
                    }`}
                  >
                    #{t.name}
                  </button>
                )
              })}
            </div>
          )}
          {tagsCleanupMessage && <p className="text-xs text-[var(--text-2)]">{tagsCleanupMessage}</p>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th
                  className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                  onClick={() => setOrdering(o => (o === '-tx_date' ? 'tx_date' : '-tx_date'))}
                >
                  Date{ordering === '-tx_date' ? ' ▼' : ordering === 'tx_date' ? ' ▲' : ''}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Category</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Description</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Tags</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Member</th>
                <th
                  className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                  onClick={() => setOrdering(o => (o === '-amount' ? 'amount' : '-amount'))}
                >
                  Amount{ordering === '-amount' ? ' ▼' : ordering === 'amount' ? ' ▲' : ''}
                </th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--text-muted)]">Loading…</td></tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <span className="block text-3xl">🧾</span>
                    <p className="mt-2 text-sm font-medium text-[var(--text-2)]">No spends match these filters</p>
                    <p className="text-xs text-[var(--text-muted)]">Tap + Record to add your first entry.</p>
                  </td>
                </tr>
              ) : groupedRows ? (
                groupedRows.map(([label, rows]) => {
                  const total = rows.reduce((s, t) => s + Number(t.amount), 0)
                  return (
                    <Fragment key={label}>
                      <tr>
                        <td colSpan={7} className="bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          <div className="flex items-center justify-between">
                            <span>{label} <span className="ml-1 rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-medium normal-case">{rows.length}</span></span>
                            <Money value={total} className="font-semibold normal-case" />
                          </div>
                        </td>
                      </tr>
                      {rows.map(x => <SpendRow key={x.id} x={x} />)}
                    </Fragment>
                  )
                })
              ) : (
                tableRows.map(x => <SpendRow key={x.id} x={x} />)
              )}
            </tbody>
          </table>
        </div>

        {groupBy === 'none' && tableCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 text-xs text-[var(--text-muted)]">
            <span>
              Showing {(page - 1) * SPEND_PAGE_SIZE + 1}–{Math.min(page * SPEND_PAGE_SIZE, tableCount)} of {tableCount}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 disabled:opacity-40">
                ← Prev
              </button>
              <span>Page {page} of {tableTotalPages}</span>
              <button type="button" disabled={page >= tableTotalPages} onClick={() => setPage(p => Math.min(tableTotalPages, p + 1))}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>
        )}
        {groupBy !== 'none' && tableCount > GROUPED_FETCH_LIMIT && (
          <p className="px-4 py-3 text-xs text-[var(--text-muted)]">
            Showing the first {GROUPED_FETCH_LIMIT} of {tableCount} matching spends — narrow the filters to see the rest grouped.
          </p>
        )}
      </div>

      {/* ── Manage Categories Drawer ── */}
      <Drawer open={showCategoryDrawer} onClose={() => { setShowCategoryDrawer(false); setEditingCat(null); setShowNewForm(false) }} title="Manage Categories">
        <div className="space-y-1">

          {unmapped.count > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/15 p-3 dark:border-amber-800/40 dark:bg-amber-900/20">
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
                      className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-rose-50 dark:bg-rose-900/15 hover:text-rose-600 dark:hover:bg-rose-900/30"
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
          householdId={householdId}
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
    </PullToRefresh>
  )
}
