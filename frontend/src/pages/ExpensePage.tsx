import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ChevronLeft, ChevronRight, Pencil, Plus, Receipt, SearchX, Tags, Trash2 } from 'lucide-react'
import { expenseApi } from '../api/expenseApi'
import type { RecordTransactionPayload } from '../api/expenseApi'
import { ledgerApi } from '../api/ledgerApi'
import type { TransactionSummary } from '../api/ledgerApi'
import { tagApi } from '../api/tagApi'
import { QuickExpenseForm } from '../components/expenses/QuickExpenseForm'
import { ReassignDialog } from '../components/expenses/ReassignDialog'
import { EditSpendDialog } from '../components/expenses/EditSpendDialog'
import { EmojiPicker } from '../components/expenses/EmojiPicker'
import { Amount } from '../components/ui/Amount'
import { Badge } from '../components/ui/Badge'
import { Button, IconButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DataTable, DensityToggle } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import { DateText } from '../components/ui/DateText'
import { Delta } from '../components/ui/Delta'
import { DetailDrawer } from '../components/ui/DetailDrawer'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityIcon } from '../components/ui/EntityIcon'
import { FilterBar } from '../components/ui/FilterBar'
import { AmountRangeInput, DateRangePicker, Input, ToolbarSelect } from '../components/ui/Input'
import type { AmountRange, DateRange } from '../components/ui/Input'
import { describeAmountRange, describeDateRange } from '../components/ui/controls'
import { MemberAvatar } from '../components/ui/MemberAvatar'
import { Menu } from '../components/ui/Menu'
import type { RowAction } from '../components/ui/Menu'
import { Notice } from '../components/ui/Notice'
import { PageLayout } from '../components/ui/PageLayout'
import { PullToRefresh } from '../components/ui/PullToRefresh'
import { SectionLink } from '../components/ui/SectionHeader'
import { Sheet } from '../components/ui/Sheet'
import { StatCard } from '../components/ui/StatCard'
import { useToast, useUndoable } from '../components/ui/Toast'
import { useAuth } from '../context/AuthContext'
import { useMemberScope } from '../context/MemberScopeContext'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { normalizeApiError } from '../hooks/errorUtils'
import { useErrorToast } from '../hooks/useErrorToast'
import { useFilterState } from '../hooks/useFilters'
import type { FilterField } from '../hooks/useFilters'
import { fmtCount, fmtDateWeekday, fmtMonth } from '../lib/fmt'
import { spendCategoryColor } from '../lib/palette'
import type { ExpenseCategory, OptionItem, Tag, Transaction, UnmappedExpenseInfo } from '../types/domain'

type Props = {
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  canDelete: (e: DeleteEntity) => boolean
}

const SPEND_PAGE_SIZE = 25
const GROUPED_FETCH_LIMIT = 500
const BREAKDOWN_TOP = 5

type GroupBy = 'none' | 'date' | 'month' | 'category' | 'member' | 'tag' | 'amount'

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'month', label: 'Month' },
  { value: 'category', label: 'Category' },
  { value: 'member', label: 'Member' },
  { value: 'tag', label: 'Tag' },
  { value: 'amount', label: 'Amount range' },
  { value: 'none', label: 'None' },
]

const AMOUNT_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: 'Under ₹500', min: 0, max: 500 },
  { label: '₹500 – ₹2,000', min: 500, max: 2000 },
  { label: '₹2,000 – ₹10,000', min: 2000, max: 10000 },
  { label: '₹10,000 – ₹50,000', min: 10000, max: 50000 },
  { label: 'Over ₹50,000', min: 50000, max: null },
]

function amountBucketLabel(amount: number): string {
  return AMOUNT_BUCKETS.find((b) => amount >= b.min && (b.max === null || amount < b.max))?.label ?? 'Other'
}

const monthOf = (iso: string) => iso.slice(0, 7)
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const signed = (t: Transaction) => (t.direction === 'outflow' ? -Number(t.amount) : Number(t.amount))

/** Date/month grouping follows the date order, so it can stay paginated; others need the whole set. */
const PAGED_GROUPS = new Set<GroupBy>(['none', 'date', 'month'])

export function ExpensePage({ householdId, memberOptions, accountOptions, canDelete }: Props) {
  const { canWrite } = useAuth()
  const { memberId: scopeMemberId, memberName } = useMemberScope()
  const toast = useToast()
  const undoable = useUndoable()
  const errorToast = useErrorToast()
  const [items, setItems] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [unmapped, setUnmapped] = useState<UnmappedExpenseInfo>({ count: 0, expenses: [] })
  const [showForm, setShowForm] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [showCategoryDrawer, setShowCategoryDrawer] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Table: search, filters, sort, pages.
  const [tableRows, setTableRows] = useState<Transaction[]>([])
  const [tableCount, setTableCount] = useState(0)
  const [tableLoading, setTableLoading] = useState(false)
  const [tableError, setTableError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [txFilters, setTxFilters] = useFilterState('transactions')
  const filtersKey = JSON.stringify(txFilters)
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [amountRange, setAmountRange] = useState<AmountRange>({ min: '', max: '' })
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' })
  const [ordering, setOrdering] = useState('-tx_date')
  const [page, setPage] = useState(1)
  const [groupBy, setGroupBy] = useState<GroupBy>('date')
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  const [breakdownMonth, setBreakdownMonth] = useState(() => monthOf(new Date().toISOString()))

  // Category management
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

  // Edit spend
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const catLabel = useMemo(() => Object.fromEntries(categories.map((c) => [c.key, c.label])), [categories])
  const tagName = useMemo(() => Object.fromEntries(allTags.map((t) => [t.id, t.name])), [allTags])
  const memberLabel = (id: number | null) => (id ? memberOptions.find((m) => m.id === id)?.label ?? `Member #${id}` : null)
  const accountLabel = (id: number | null) => (id ? accountOptions.find((a) => a.id === id)?.label ?? `Account #${id}` : null)

  const loadData = async () => {
    try { setItems(await expenseApi.listSpends(householdId)) } catch (e) { setError(normalizeApiError(e)) }
  }
  const loadCategories = async () => {
    try {
      const [cats, unm] = await Promise.all([expenseApi.listCategories(householdId), expenseApi.fetchUnmapped(householdId)])
      setCategories(cats); setUnmapped(unm)
    } catch (e) { errorToast('Couldn’t load categories')(e) }
  }
  const loadTags = async () => {
    try { setAllTags(await tagApi.list(householdId)) } catch (e) { errorToast('Couldn’t load tags')(e) }
  }

  const cleanupUnusedTags = async () => {
    try {
      const { deleted } = await tagApi.cleanup(householdId)
      toast.success(deleted > 0 ? `Removed ${deleted} unused tag${deleted === 1 ? '' : 's'}.` : 'No unused tags found.')
      setTxFilters({ ...txFilters, tags: (txFilters.tags ?? []).filter((id) => allTags.some((t) => String(t.id) === id)) })
      await loadTags()
    } catch {
      toast.error('Tag cleanup failed.')
    }
  }

  useEffect(() => {
    void loadData(); void loadCategories(); void loadTags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Back to page 1 whenever what's shown changes.
  useEffect(() => { setPage(1) }, [debouncedSearch, filtersKey, amountRange, dateRange, ordering, groupBy, scopeMemberId])

  // The header's member scope applies unless the Member filter picks someone explicitly.
  const memberIn = txFilters.member?.length ? txFilters.member : scopeMemberId !== null ? [String(scopeMemberId)] : undefined

  const tableParams = () => ({
    householdId,
    classification: 'spend' as const,
    search: debouncedSearch || undefined,
    memberIn,
    accountIn: txFilters.account,
    spendCategoryIn: txFilters.category,
    tags: txFilters.tags?.map(Number),
    amountMin: amountRange.min ? Number(amountRange.min) : undefined,
    amountMax: amountRange.max ? Number(amountRange.max) : undefined,
    txDateAfter: dateRange.from || undefined,
    txDateBefore: dateRange.to || undefined,
  })

  const paged = PAGED_GROUPS.has(groupBy) && (groupBy === 'none' || ordering.endsWith('tx_date'))

  const loadTable = async () => {
    setTableLoading(true); setTableError('')
    try {
      const res = await ledgerApi.listTransactionsPage({
        ...tableParams(),
        page: paged ? page : 1,
        pageSize: paged ? SPEND_PAGE_SIZE : GROUPED_FETCH_LIMIT,
        ordering,
      })
      setTableRows(res.results); setTableCount(res.count)
    } catch (e) {
      setTableError(normalizeApiError(e))
    } finally {
      setTableLoading(false)
    }
  }

  useEffect(() => {
    void loadTable()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, page, debouncedSearch, filtersKey, amountRange, dateRange, ordering, groupBy, scopeMemberId])

  // Totals across every matching spend, not just the visible page.
  useEffect(() => {
    let active = true
    ledgerApi.summarizeTransactions(tableParams())
      .then((s) => { if (active) setSummary(s) })
      .catch(() => { if (active) setSummary(null) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, debouncedSearch, filtersKey, amountRange, dateRange, scopeMemberId])

  const resetTableFilters = () => {
    setSearch(''); setAmountRange({ min: '', max: '' }); setDateRange({ from: '', to: '' })
  }
  const filtersActive = !!(search || Object.keys(txFilters).length > 0 || amountRange.min || amountRange.max || dateRange.from || dateRange.to)

  const txFilterFields = useMemo<FilterField[]>(() => [
    { key: 'category', label: 'Category', options: categories.map((c) => ({ value: c.key, label: c.label })) },
    { key: 'member', label: 'Member', options: memberOptions.map((m) => ({ value: String(m.id), label: m.label })) },
    { key: 'account', label: 'Account', options: accountOptions.map((a) => ({ value: String(a.id), label: a.label })) },
    { key: 'tags', label: 'Tags', options: allTags.map((t) => ({ value: String(t.id), label: `#${t.name}` })) },
  ], [categories, memberOptions, accountOptions, allTags])

  const visibleRows = useMemo(() => tableRows.filter((t) => !hiddenIds.has(t.id)), [tableRows, hiddenIds])

  // ── Summary strip + breakdown (all spends, scoped to the member in the header) ──
  const scopedItems = useMemo(
    () => (scopeMemberId === null ? items : items.filter((x) => x.member === scopeMemberId)).filter((x) => !hiddenIds.has(x.id)),
    [items, scopeMemberId, hiddenIds],
  )
  const thisMonth = monthOf(new Date().toISOString())
  const monthTotal = (m: string) => scopedItems.filter((x) => monthOf(x.tx_date) === m).reduce((s, x) => s - signed(x), 0)
  const thisMonthTotal = monthTotal(thisMonth)
  const lastMonthTotal = monthTotal(shiftMonth(thisMonth, -1))
  const vsLastMonth = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : null

  const categoryTotals = (m: string) => {
    const map: Record<string, number> = {}
    for (const x of scopedItems) {
      if (monthOf(x.tx_date) !== m) continue
      const cat = x.spend_category || 'other'
      map[cat] = (map[cat] || 0) - signed(x)
    }
    return Object.entries(map).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  }
  const topThisMonth = categoryTotals(thisMonth)[0]
  const breakdown = useMemo(() => {
    const totals = categoryTotals(breakdownMonth)
    const total = totals.reduce((s, [, v]) => s + v, 0)
    const top = totals.slice(0, BREAKDOWN_TOP)
    const othersTotal = totals.slice(BREAKDOWN_TOP).reduce((s, [, v]) => s + v, 0)
    const rows = top.map(([key, value]) => ({ key, label: catLabel[key] || key, value }))
    if (othersTotal > 0) rows.push({ key: '__others', label: `Others (${totals.length - BREAKDOWN_TOP})`, value: othersTotal })
    return { rows, total }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedItems, breakdownMonth, catLabel])
  const earliestMonth = scopedItems.reduce((m, x) => (monthOf(x.tx_date) < m ? monthOf(x.tx_date) : m), thisMonth)

  // ── actions ──
  const save = async (form: RecordTransactionPayload) => {
    setSaving(true); setError('')
    try {
      await expenseApi.createRecorded(form)
      setShowForm(false)
      await loadData(); await loadTable(); await loadTags()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const saveEditedSpend = async (patch: {
    tx_date: string; amount: string; account: number; member: number | null
    spend_category: string; description: string; tags: number[]; notes: string
  }) => {
    if (!editingTx) return
    setEditSaving(true); setEditError('')
    try {
      const amountChanged = patch.amount !== editingTx.amount
      const accountChanged = patch.account !== editingTx.account
      if (amountChanged || accountChanged) {
        // Financial fields changed — correction flow (reversal + replacement).
        await ledgerApi.correctTransaction({
          originalTransactionId: editingTx.id,
          corrected: {
            household: householdId, member: patch.member, account: patch.account, tx_date: patch.tx_date,
            amount: patch.amount, direction: editingTx.direction, transaction_type: editingTx.transaction_type,
            classification: editingTx.classification, spend_category: patch.spend_category,
            description: patch.description, tags: patch.tags, notes: patch.notes,
          },
        })
      } else {
        // Metadata-only change — direct update, no reversal needed.
        await ledgerApi.updateTransaction(editingTx.id, {
          tx_date: patch.tx_date, member: patch.member, spend_category: patch.spend_category,
          description: patch.description, tags: patch.tags, notes: patch.notes,
        })
      }
      setEditingTx(null); setDetailTx(null)
      await loadData(); await loadTable(); await loadTags()
    } catch (e) {
      setEditError(normalizeApiError(e))
    } finally {
      setEditSaving(false)
    }
  }

  const deleteTx = (t: Transaction) => {
    setDetailTx(null)
    undoable({
      message: 'Transaction deleted',
      apply: () => setHiddenIds((s) => new Set(s).add(t.id)),
      revert: () => setHiddenIds((s) => { const n = new Set(s); n.delete(t.id); return n }),
      commit: async () => { await ledgerApi.deleteTransaction(t.id); await loadData(); await loadTable() },
    })
  }

  const actionsFor = (t: Transaction): RowAction[] => [
    { kind: 'view', label: 'View details', onSelect: () => setDetailTx(t) },
    ...(canWrite ? [{ kind: 'edit' as const, label: 'Edit', onSelect: () => { setEditingTx(t); setEditError('') } }] : []),
    ...(canDelete('transaction') ? [{
      kind: 'delete' as const, label: 'Delete', onSelect: () => deleteTx(t),
      confirm: { title: 'Delete this transaction?', message: 'You’ll have a few seconds to undo.', confirmLabel: 'Delete' },
    }] : []),
  ]

  // Category CRUD
  const startEdit = (cat: ExpenseCategory) => { setEditingCat(cat); setEditLabel(cat.label); setEditIcon(cat.icon) }
  const saveEdit = async () => {
    if (!editingCat) return
    setCatSaving(true)
    try {
      await expenseApi.updateCategory(editingCat.id, { label: editLabel, icon: editIcon })
      setEditingCat(null); await loadCategories()
    } finally { setCatSaving(false) }
  }
  const saveNew = async () => {
    if (!newLabel.trim() || !newKey.trim()) return
    setCatSaving(true)
    try {
      await expenseApi.createCategory({ household: householdId, key: newKey.trim(), label: newLabel.trim(), icon: newIcon || '📌' }) // ui-check-ignore (stored default)
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
      await loadCategories(); await loadData(); await loadTable()
    } finally { setCatSaving(false) }
  }

  // ── table ──
  const sortCol = ordering.replace('-', '') === 'amount' ? 'amount' : 'date'
  const columns: DataTableColumn<Transaction>[] = [
    { key: 'date', label: 'Date', sortable: true, hideWhenGroupedBy: 'date', mobile: 'meta', width: '7.5rem',
      render: (x) => <DateText value={x.tx_date} format="short" className="whitespace-nowrap text-ink-2" /> },
    {
      key: 'description', label: 'Description', mobile: 'title',
      render: (x) => {
        const cat = x.spend_category || 'other'
        return (
          <span className="flex min-w-0 items-center gap-3">
            <EntityIcon kind="spend" type={cat} />
            <span className="min-w-0">
              <span className="block truncate text-ink" title={x.description}>{x.description || catLabel[cat] || cat}</span>
              {(x.description || x.notes) && (
                <span className="block truncate text-xs text-ink-muted">
                  {[x.description ? (catLabel[cat] || cat) : null, x.notes].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          </span>
        )
      },
    },
    {
      key: 'tags', label: 'Tags', mobile: 'subtitle',
      render: (x) => (x.tags.length > 0
        ? <span className="flex flex-wrap gap-1">{x.tags.map((id) => <Badge key={id}>#{tagName[id] ?? id}</Badge>)}</span>
        : <span className="text-ink-muted">—</span>),
    },
    { key: 'member', label: 'Member', hideWhenGroupedBy: 'member', mobile: 'hide',
      render: (x) => (x.member ? <MemberAvatar name={memberLabel(x.member)!} /> : <span className="text-ink-muted">—</span>) },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, mobile: 'value',
      render: (x) => <Amount value={signed(x)} signed tone={x.direction === 'outflow' ? 'debit' : 'credit'} className="font-semibold" /> },
  ]

  const groupKeyOf = (tx: Transaction, by: string): { key: string; label: string } => {
    if (by === 'date') return { key: tx.tx_date, label: new Date(`${tx.tx_date}T00:00:00`).toDateString() === new Date().toDateString() ? 'Today' : fmtDateWeekday(tx.tx_date) }
    if (by === 'month') return { key: monthOf(tx.tx_date), label: fmtMonth(tx.tx_date) }
    if (by === 'category') { const c = tx.spend_category || 'other'; return { key: c, label: catLabel[c] || c } }
    if (by === 'member') { const l = memberLabel(tx.member) ?? 'Unassigned'; return { key: l, label: l } }
    if (by === 'amount') { const l = amountBucketLabel(Number(tx.amount)); return { key: l, label: l } }
    // tag: a transaction with several tags is listed under its first (the old view repeated it per tag).
    const first = tx.tags[0]
    return first === undefined ? { key: 'untagged', label: 'Untagged' } : { key: String(first), label: `#${tagName[first] ?? first}` }
  }

  const totalPages = Math.max(1, Math.ceil(tableCount / SPEND_PAGE_SIZE))
  const breakdownMax = Math.max(1, ...breakdown.rows.map((r) => r.value))

  return (
    <PullToRefresh onRefresh={async () => { await loadData(); await loadTable() }}>
    <PageLayout
      title="Transactions"
      description={memberName ? `${memberName}’s spends` : undefined}
      primaryAction={canWrite ? { label: 'Record', icon: <Plus />, onClick: () => { setShowForm(true); setFormKey((k) => k + 1) } } : undefined}
      moreActions={[
        { label: 'Spend trends', icon: <BarChart3 />, href: '#/spend-trends' },
        { label: 'Categories', icon: <Tags />, onSelect: () => setShowCategoryDrawer(true), hint: 'Rename, add or merge' },
        ...(canWrite && allTags.length > 0 ? [{ label: 'Clean up unused tags', icon: <Trash2 />, onSelect: () => void cleanupUnusedTags() }] : []),
      ]}
      summary={(
        <>
          <StatCard label="This month" value={<Amount value={thisMonthTotal} format="compact" />} subtitle={fmtMonth(thisMonth)} />
          <StatCard label="vs last month" value={<Delta value={vsLastMonth} invert className="text-xl md:text-2xl" />}
            subtitle={<>Last month <Amount value={lastMonthTotal} format="compact" /></>} />
          <StatCard label="Top category" value={topThisMonth ? (catLabel[topThisMonth[0]] || topThisMonth[0]) : '—'}
            subtitle={topThisMonth ? <Amount value={topThisMonth[1]} format="compact" /> : 'Nothing this month'} />
          <StatCard label="Transactions" value={summary ? fmtCount(summary.count) : '—'} subtitle={filtersActive ? 'Matching filters' : 'All spends'} />
        </>
      )}
      notices={unmapped.count > 0 ? (
        <Notice tone="warning" title={`${unmapped.count} spend${unmapped.count > 1 ? 's have' : ' has'} an unrecognised category`}
          action={<Button variant="secondary" size="sm" onClick={() => setShowCategoryDrawer(true)}>Fix</Button>}>
          Reassign them or add the missing category.
        </Notice>
      ) : undefined}
    >
      <Card
        title="Spend breakdown"
        subtitle={<>{fmtMonth(breakdownMonth)} · <Amount value={breakdown.total} format="compact" /></>}
        actions={(
          <span className="flex items-center gap-1">
            <IconButton size="sm" label="Previous month" icon={<ChevronLeft />} disabled={breakdownMonth <= earliestMonth}
              onClick={() => setBreakdownMonth((m) => shiftMonth(m, -1))} />
            <IconButton size="sm" label="Next month" icon={<ChevronRight />} disabled={breakdownMonth >= thisMonth}
              onClick={() => setBreakdownMonth((m) => shiftMonth(m, 1))} />
            <SectionLink href="#/spend-trends">Trends</SectionLink>
          </span>
        )}
      >
        {breakdown.rows.length === 0 ? (
          <EmptyState icon={<Receipt />} title={`No spends in ${fmtMonth(breakdownMonth)}`} />
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0" aria-label={`Spend by category, ${fmtMonth(breakdownMonth)}`}>
            {breakdown.rows.map((r) => {
              const pct = breakdown.total > 0 ? (r.value / breakdown.total) * 100 : 0
              return (
                <li key={r.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_1fr_auto_3rem]">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                    <EntityIcon kind="spend" type={r.key} size="sm" />
                    <span className="truncate">{r.label}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${(r.value / breakdownMax) * 100}%`, background: spendCategoryColor(r.key) }} />
                  </span>
                  <Amount value={r.value} format="compact" className="text-right text-sm font-medium text-ink" />
                  <span className="hidden text-right text-sm tabular-nums text-ink-muted sm:block">{pct.toFixed(0)}%</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: 'Search description, notes or amount…' }}
        fields={txFilterFields}
        value={txFilters}
        onChange={setTxFilters}
        extra={(
          <>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <AmountRangeInput value={amountRange} onChange={setAmountRange} />
          </>
        )}
        extraChips={[
          ...(dateRange.from || dateRange.to ? [{ key: 'date', label: describeDateRange(dateRange), onRemove: () => setDateRange({ from: '', to: '' }) }] : []),
          ...(amountRange.min || amountRange.max ? [{ key: 'amount', label: describeAmountRange(amountRange), onRemove: () => setAmountRange({ min: '', max: '' }) }] : []),
        ]}
        onClearAll={resetTableFilters}
        resultLabel={summary && filtersActive ? `${fmtCount(summary.count)} matching` : undefined}
        controls={(
          <>
            <ToolbarSelect label="Group by" value={groupBy} options={GROUP_BY_OPTIONS} onChange={(v) => setGroupBy(v as GroupBy)} />
            <DensityToggle />
          </>
        )}
      />

      <div className="grid gap-3">
        <DataTable
          ariaLabel="Spends"
          columns={columns}
          rows={visibleRows}
          rowKey={(x) => x.id}
          sort={{
            col: sortCol,
            dir: ordering.startsWith('-') ? 'desc' : 'asc',
            onChange: (col, dir) => setOrdering(`${dir === 'desc' ? '-' : ''}${col === 'amount' ? 'amount' : 'tx_date'}`),
          }}
          defaultSortDir="desc"
          groupBy={groupBy === 'none' ? undefined : {
            options: GROUP_BY_OPTIONS.filter((o) => o.value !== 'none'),
            value: groupBy,
            sticky: groupBy === 'date' || groupBy === 'month',
            getGroup: groupKeyOf,
            sortGroups: groupBy === 'date' || groupBy === 'month'
              ? undefined
              : groupBy === 'amount'
                ? (a, b) => AMOUNT_BUCKETS.findIndex((x) => x.label === a.key) - AMOUNT_BUCKETS.findIndex((x) => x.label === b.key)
                : (a, b) => b.rows.reduce((s, t) => s - signed(t), 0) - a.rows.reduce((s, t) => s - signed(t), 0),
            aggregate: (rows) => ({ amount: <Amount value={rows.reduce((s, t) => s + signed(t), 0)} signed /> }),
          }}
          loading={tableLoading}
          error={tableError ? { message: tableError, onRetry: () => void loadTable() } : null}
          emptyState={filtersActive
            ? <EmptyState icon={<SearchX />} title="No spends match these filters" action={<Button variant="secondary" onClick={() => { resetTableFilters(); setTxFilters({}) }}>Clear filters</Button>} />
            : <EmptyState icon={<Receipt />} title="No spends yet" description="Use Record to add your first one." />}
          onRowClick={setDetailTx}
          rowActions={actionsFor}
          footer={summary && (
            <span className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <span>{fmtCount(summary.count)} spend{summary.count === 1 ? '' : 's'}{filtersActive ? ' matching' : ''}</span>
              <span>
                Total <Amount value={summary.outflow} className="font-semibold text-ink" />
                {parseFloat(summary.inflow) > 0 && <> · refunds <Amount value={summary.inflow} tone="credit" /></>}
              </span>
            </span>
          )}
        />

        {paged && tableCount > SPEND_PAGE_SIZE && (
          <nav className="flex items-center justify-between gap-3 text-sm text-ink-muted" aria-label="Pages">
            <span>{fmtCount((page - 1) * SPEND_PAGE_SIZE + 1)}–{fmtCount(Math.min(page * SPEND_PAGE_SIZE, tableCount))} of {fmtCount(tableCount)}</span>
            <span className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={<ChevronLeft />} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
              <span className="hidden sm:inline">Page {page} of {totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </span>
          </nav>
        )}
        {!paged && tableCount > GROUPED_FETCH_LIMIT && (
          <p className="text-sm text-ink-muted">
            Showing the first {GROUPED_FETCH_LIMIT} of {fmtCount(tableCount)} matching spends — narrow the filters to see the rest grouped.
          </p>
        )}
      </div>

      {/* Record */}
      {showForm && (
        <Sheet title="Record a transaction" onClose={() => { setShowForm(false); setError('') }} wide>
          <QuickExpenseForm
            householdId={householdId}
            memberOptions={memberOptions}
            accountOptions={accountOptions}
            categories={categories}
            onSave={save}
            onCancel={() => { setShowForm(false); setError('') }}
            saving={saving}
            error={error}
            refreshKey={formKey}
          />
        </Sheet>
      )}

      {/* Detail */}
      {detailTx && (
        <DetailDrawer
          open
          onClose={() => setDetailTx(null)}
          title={detailTx.description || catLabel[detailTx.spend_category] || 'Transaction'}
          subtitle={<>{detailTx.member ? <MemberAvatar name={memberLabel(detailTx.member)!} /> : null}<DateText value={detailTx.tx_date} /></>}
          amount={<Amount value={signed(detailTx)} signed tone={detailTx.direction === 'outflow' ? 'debit' : 'credit'} format="precise" />}
          badges={detailTx.direction === 'inflow' ? <Badge tone="success">Refund</Badge> : undefined}
          facts={[
            { label: 'Category', value: <span className="inline-flex items-center gap-2"><EntityIcon kind="spend" type={detailTx.spend_category || 'other'} size="sm" />{catLabel[detailTx.spend_category] || detailTx.spend_category || 'Other'}</span> },
            { label: 'Account', value: accountLabel(detailTx.account) ?? '—' },
            { label: 'Date', value: <DateText value={detailTx.tx_date} /> },
            { label: 'Source', value: detailTx.source === 'manual' ? 'Recorded by hand' : detailTx.source === 'csv' ? 'Imported' : 'Synced' },
            ...(detailTx.tags.length ? [{ label: 'Tags', wide: true, value: <span className="flex flex-wrap gap-1">{detailTx.tags.map((id) => <Badge key={id}>#{tagName[id] ?? id}</Badge>)}</span> }] : []),
            ...(detailTx.notes ? [{ label: 'Notes', wide: true, value: detailTx.notes }] : []),
            ...(detailTx.external_reference ? [{ label: 'Reference', wide: true, value: detailTx.external_reference }] : []),
          ]}
          actions={canWrite ? (
            <>
              <Button variant="secondary" icon={<Pencil />} onClick={() => { setEditingTx(detailTx); setEditError('') }}>Edit</Button>
              {canDelete('transaction') && (
                <Menu
                  items={[{ label: 'Delete transaction', icon: <Trash2 />, destructive: true, onSelect: () => deleteTx(detailTx),
                    confirm: { title: 'Delete this transaction?', message: 'You’ll have a few seconds to undo.', confirmLabel: 'Delete' } }]}
                  trigger={({ toggle, ref }) => <Button ref={ref} variant="ghost" onClick={toggle}>More…</Button>}
                />
              )}
            </>
          ) : undefined}
        />
      )}

      {/* Manage categories */}
      {showCategoryDrawer && <Sheet
        title="Categories"
        subtitle="Rename built-in categories, add your own, or merge one into another."
        onClose={() => { setShowCategoryDrawer(false); setEditingCat(null); setShowNewForm(false) }}
        wide
      >
        <div className="grid gap-2">
          {unmapped.count > 0 && (
            <Notice tone="warning" title={`${unmapped.count} spend${unmapped.count > 1 ? 's' : ''} with unrecognised categories`} className="mb-2">
              <ul className="m-0 grid list-none gap-1 p-0">
                {unmapped.expenses.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="truncate">{e.description || e.spend_category} · <DateText value={e.tx_date} format="short" /></span>
                    <span className="shrink-0 font-medium">“{e.spend_category}”</span>
                  </li>
                ))}
                {unmapped.expenses.length > 5 && <li>…and {unmapped.expenses.length - 5} more</li>}
              </ul>
            </Notice>
          )}

          {categories.map((cat) => (
            <div key={cat.key} className="rounded-[var(--radius-md)] border border-line">
              {editingCat?.id === cat.id ? (
                <div className="flex items-center gap-2 p-2">
                  <Button variant="secondary" onClick={() => setPickerFor('edit')} aria-label="Choose icon">{editIcon || '·'}</Button>
                  {pickerFor === 'edit' && <EmojiPicker value={editIcon} onChange={setEditIcon} onClose={() => setPickerFor(null)} />}
                  <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} aria-label="Category name" />
                  <Button variant="primary" size="sm" onClick={() => void saveEdit()} loading={catSaving} disabled={!editLabel.trim()}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingCat(null)}>Cancel</Button>
                </div>
              ) : (
                <div className="group flex min-h-12 items-center gap-3 px-3">
                  <EntityIcon kind="spend" type={cat.key} size="sm" />
                  <span className="flex-1 text-sm font-medium text-ink">{cat.label}</span>
                  {cat.is_builtin && <Badge>Built-in</Badge>}
                  {canWrite && <IconButton size="sm" label={`Edit ${cat.label}`} icon={<Pencil />} onClick={() => startEdit(cat)} />}
                  {canWrite && !cat.is_builtin && <IconButton size="sm" label={`Delete ${cat.label}`} icon={<Trash2 />} onClick={() => setReassignTarget(cat)} />}
                </div>
              )}
            </div>
          ))}

          {canWrite && (showNewForm ? (
            <div className="mt-2 grid gap-2 rounded-[var(--radius-md)] border border-line p-3">
              <p className="text-sm font-semibold text-ink">New category</p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPickerFor('new')} aria-label="Choose icon">{newIcon || '·'}</Button>
                {pickerFor === 'new' && <EmojiPicker value={newIcon} onChange={setNewIcon} onClose={() => setPickerFor(null)} />}
                <Input placeholder="Label (e.g. Travel)" value={newLabel} aria-label="Category label"
                  onChange={(e) => {
                    setNewLabel(e.target.value)
                    if (!newKey) setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30))
                  }} />
              </div>
              <div className="flex gap-2">
                <Input placeholder="key (auto-generated)" value={newKey} aria-label="Category key"
                  onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30))} />
                <Button variant="primary" onClick={() => void saveNew()} loading={catSaving} disabled={!newLabel.trim() || !newKey.trim()}>Add</Button>
                <Button variant="ghost" onClick={() => setShowNewForm(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" icon={<Plus />} className="mt-2" onClick={() => setShowNewForm(true)}>Add category</Button>
          ))}
        </div>
      </Sheet>}

      {reassignTarget && (
        <ReassignDialog
          open={!!reassignTarget}
          deletingCategory={reassignTarget}
          allCategories={categories}
          expenseCount={items.filter((x) => x.spend_category === reassignTarget.key).length}
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
    </PageLayout>
    </PullToRefresh>
  )
}

