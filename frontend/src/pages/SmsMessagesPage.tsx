import { useEffect, useRef, useState } from 'react'
import type { InstrumentOption, OptionItem, SmsMessage } from '../types/domain'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { smsApi } from '../api/smsApi'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Drawer } from '../components/ui/Drawer'
import { DeleteButton } from '../components/common/DeleteButton'
import { normalizeApiError } from '../hooks/errorUtils'
import { SmsApprovalForm } from '../components/sms/SmsApprovalForm'

type Props = {
  householdId: number
  canDelete: (e: DeleteEntity) => boolean
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
  instrumentOptions: InstrumentOption[]
}

type CategoryFilter = 'all' | 'transaction' | 'otp' | 'sip_reminder' | 'promotion' | 'alert'
type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'transaction', label: 'Transaction' },
  { key: 'otp', label: 'OTP' },
  { key: 'sip_reminder', label: 'SIP' },
  { key: 'promotion', label: 'Promotion' },
  { key: 'alert', label: 'Alert' },
]

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

const CATEGORY_COLOR: Record<string, 'green' | 'amber' | 'purple' | 'blue' | 'red' | 'slate'> = {
  transaction: 'green',
  otp: 'amber',
  sip_reminder: 'purple',
  promotion: 'blue',
  alert: 'red',
}

const CATEGORY_LABEL: Record<string, string> = {
  transaction: 'Transaction',
  otp: 'OTP',
  sip_reminder: 'SIP',
  promotion: 'Promotion',
  alert: 'Alert',
}

const STATUS_COLOR: Record<SmsMessage['status'], 'slate' | 'green' | 'red'> = {
  pending: 'slate',
  approved: 'green',
  rejected: 'red',
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function SmsMessagesPage({ householdId, canDelete, accountOptions, memberOptions, instrumentOptions }: Props) {
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sender, setSender] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [ordering, setOrdering] = useState('-received_at')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState<SmsMessage | null>(null)
  const [approving, setApproving] = useState<SmsMessage | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false)
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [reapplyResult, setReapplyResult] = useState<string>('')
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: unknown[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)
  const selectedSwipe = useRef<number | null>(null)

  const filters = {
    status: statusFilter,
    category: categoryFilter === 'all' ? undefined : categoryFilter,
    search: search || undefined,
    sender: sender.trim() || undefined,
    received_after: dateFrom || undefined,
    received_before: dateTo || undefined,
  }

  // Debounce free-text search before triggering a refetch
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  // Reset to page 1 whenever filters (or page size) change
  useEffect(() => {
    setPage(1)
  }, [householdId, statusFilter, categoryFilter, search, sender, dateFrom, dateTo, ordering, pageSize])

  const load = () => {
    if (!householdId) return
    setLoading(true)
    setError('')
    smsApi.listMessagesPage(householdId, { ...filters, ordering, page, page_size: pageSize })
      .then((res) => {
        setMessages(res.results)
        setCount(res.count)
        setChecked(new Set())
      })
      .catch(() => setError('Failed to load SMS messages.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, statusFilter, categoryFilter, search, sender, dateFrom, dateTo, ordering, page, pageSize])

  // Arrow-key navigation while the detail viewer is open
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight') navSelected(1)
      if (e.key === 'ArrowLeft') navSelected(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, messages])

  if (!householdId) {
    return <p className="text-sm text-[var(--text-muted)]">Select a household to view SMS messages.</p>
  }

  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const allOnPageChecked = messages.length > 0 && messages.every((m) => checked.has(m.id))

  const toggleOne = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = () => {
    setChecked((prev) => {
      if (allOnPageChecked) {
        const next = new Set(prev)
        messages.forEach((m) => next.delete(m.id))
        return next
      }
      const next = new Set(prev)
      messages.forEach((m) => next.add(m.id))
      return next
    })
  }

  const rejectOne = async (id: number) => {
    setError('')
    try {
      await smsApi.rejectStaged(id)
      setSelected(null)
      load()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  // ── Approval queue navigation ──
  // Messages on the current page that can still be approved (not already approved).
  const approvableQueue = messages.filter((m) => m.status !== 'approved')
  const approvingIndex = approving ? approvableQueue.findIndex((m) => m.id === approving.id) : -1

  // Advance to the next approvable message after an action; close if none left.
  const goToNextApprovable = (afterId: number) => {
    const remaining = approvableQueue.filter((m) => m.id !== afterId)
    const fromIdx = approvableQueue.findIndex((m) => m.id === afterId)
    // Prefer the message that was *after* the acted-on one
    const next = approvableQueue.slice(fromIdx + 1).find((m) => m.id !== afterId) ?? remaining[0] ?? null
    setApproving(next)
    if (!next) setSelected(null)
  }

  const navApproving = (dir: 1 | -1) => {
    if (approvingIndex < 0) return
    const target = approvingIndex + dir
    if (target >= 0 && target < approvableQueue.length) setApproving(approvableQueue[target])
  }

  // ── Detail viewer navigation (browse all messages on the page) ──
  const selectedIndex = selected ? messages.findIndex((m) => m.id === selected.id) : -1
  const navSelected = (dir: 1 | -1) => {
    if (selectedIndex < 0) return
    const target = selectedIndex + dir
    if (target >= 0 && target < messages.length) setSelected(messages[target])
  }

  const rejectFromApproval = async (id: number) => {
    setError('')
    try {
      await smsApi.rejectStaged(id)
      goToNextApprovable(id)
      load()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const deleteOne = async (id: number) => {
    setError('')
    try {
      await smsApi.deleteMessage(id)
      load()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const deleteSelected = async () => {
    setError('')
    setBulkBusy(true)
    try {
      await smsApi.bulkDeleteByIds(Array.from(checked))
      setConfirmingBulkDelete(false)
      load()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setBulkBusy(false)
    }
  }

  const reapplyRules = async () => {
    if (checked.size === 0) return
    setReapplyResult('')
    setBulkBusy(true)
    try {
      const res = await smsApi.reapplyRules(Array.from(checked))
      setReapplyResult(`Updated ${res.updated} message${res.updated === 1 ? '' : 's'}`)
      setChecked(new Set())
      load()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setBulkBusy(false)
    }
  }

  const exportMessages = () => {
    const url = checked.size > 0
      ? smsApi.exportUrl(householdId, { ids: Array.from(checked) })
      : smsApi.exportUrl(householdId, filters)
    window.open(url, '_blank')
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const messages: { sender: string; body: string; timestamp: string }[] = (
        parsed.sms_messages ?? parsed.messages ?? parsed
      ).map((m: Record<string, string>) => ({
        sender: m.sender ?? '',
        body: m.body ?? '',
        timestamp: m.received_at ?? m.timestamp ?? '',
      }))
      const result = await smsApi.importMessages(householdId, messages)
      setImportResult(result)
      if (result.created > 0) load()
    } catch {
      setError('Import failed — check the file is a valid SMS export JSON.')
    } finally {
      setImporting(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  const deleteAllMatching = async () => {
    setError('')
    setBulkBusy(true)
    try {
      await smsApi.bulkDeleteAllMatching(householdId, filters)
      setConfirmingDeleteAll(false)
      load()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">SMS Messages</h2>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Browse staged messages forwarded from registered devices. Categories are auto-detected
          from the message body — use them to quickly find transaction alerts, OTPs, SIP reminders, and promotions.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Tabs tabs={CATEGORY_TABS} active={categoryFilter} onChange={setCategoryFilter} size="sm" />
        <Tabs tabs={STATUS_TABS} active={statusFilter} onChange={setStatusFilter} size="sm" />
      </div>

      <div className="grid grid-cols-2 items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-3 lg:col-span-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">Search</span>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search body or sender…"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">Sender</span>
          <input
            type="text"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="e.g. HDFCBK"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">Sort</span>
          <select
            value={ordering}
            onChange={(e) => setOrdering(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="-received_at">Newest first</option>
            <option value="received_at">Oldest first</option>
            <option value="sender">Sender (A–Z)</option>
            <option value="-sender">Sender (Z–A)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">Per page</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {importResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${importResult.errors.length > 0 ? 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20' : 'border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-900/20'}`}>
          <p className={importResult.errors.length > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-green-800 dark:text-green-300'}>
            Import complete — <strong>{importResult.created}</strong> created, <strong>{importResult.skipped}</strong> skipped (duplicates)
            {importResult.errors.length > 0 && `, ${importResult.errors.length} error${importResult.errors.length === 1 ? '' : 's'}`}.
          </p>
          <button type="button" onClick={() => setImportResult(null)} className="mt-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-2)]">Dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">
          {count === 0 ? 'No messages' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} of ${count}`}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {reapplyResult && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{reapplyResult}</span>
          )}
          {/* Export */}
          <Button size="sm" variant="secondary" onClick={exportMessages}>
            {checked.size > 0 ? `Export selected (${checked.size})` : 'Export all'}
          </Button>
          {/* Import */}
          <label className="cursor-pointer">
            <span className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]">
              {importing ? 'Importing…' : 'Import JSON'}
            </span>
            <input
              ref={importFileRef}
              type="file"
              accept=".json"
              className="sr-only"
              onChange={handleImportFile}
              disabled={importing}
            />
          </label>
          {checked.size > 0 && (
            <Button size="sm" variant="secondary" loading={bulkBusy} onClick={reapplyRules}>
              Re-apply rules ({checked.size})
            </Button>
          )}
          {checked.size > 0 && canDelete('sms_message') && (
            confirmingBulkDelete ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-[var(--text-2)]">Delete {checked.size} selected message{checked.size === 1 ? '' : 's'}?</span>
                <Button size="sm" variant="danger" loading={bulkBusy} onClick={deleteSelected}>Confirm</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmingBulkDelete(false)}>Cancel</Button>
              </span>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setConfirmingBulkDelete(true)}>
                Delete selected ({checked.size})
              </Button>
            )
          )}
          {canDelete('sms_message') && count > 0 && (
            confirmingDeleteAll ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="font-medium text-red-600">
                  Permanently delete all {count} message{count === 1 ? '' : 's'} matching the current filters?
                </span>
                <Button size="sm" variant="danger" loading={bulkBusy} onClick={deleteAllMatching}>Yes, delete all</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmingDeleteAll(false)}>Cancel</Button>
              </span>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setConfirmingDeleteAll(true)}>
                Delete all matching filters…
              </Button>
            )
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : messages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">No messages found</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Try a different filter, or send a test message from the SMS Test Sender page.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              {canDelete('sms_message') && <col className="w-8" />}
              <col className="w-36" />
              <col className="w-32" />
              <col />
              <col className="w-48" />
              <col className="w-28" />
              <col className="w-44" />
              {canDelete('sms_message') && <col className="w-20" />}
            </colgroup>
            <thead className="bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                {canDelete('sms_message') && (
                  <th className="px-4 py-2.5">
                    <input type="checkbox" checked={allOnPageChecked} onChange={toggleAllOnPage} aria-label="Select all on page" />
                  </th>
                )}
                <th className="px-4 py-2.5">Received</th>
                <th className="px-4 py-2.5">Sender</th>
                <th className="px-4 py-2.5">Message</th>
                <th className="px-4 py-2.5">Categories</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Actions</th>
                {canDelete('sms_message') && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr
                  key={msg.id}
                  className="cursor-pointer border-t border-[var(--border)] align-top hover:bg-[var(--surface-2)]"
                  onClick={() => setSelected(msg)}
                >
                  {canDelete('sms_message') && (
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked.has(msg.id)} onChange={() => toggleOne(msg.id)} aria-label={`Select message from ${msg.sender}`} />
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-xs text-[var(--text-muted)] whitespace-nowrap">{formatDateTime(msg.received_at)}</td>
                  <td className="px-4 py-2.5 font-medium text-[var(--text)] whitespace-nowrap truncate">{msg.sender}</td>
                  <td className="px-4 py-2.5 text-[var(--text-2)] truncate" title={msg.body}>{msg.body}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {msg.categories.length === 0
                        ? <Badge label="Uncategorised" color="slate" />
                        : msg.categories.map((cat) => (
                            <Badge key={cat} label={CATEGORY_LABEL[cat] ?? cat} color={CATEGORY_COLOR[cat] ?? 'slate'} />
                          ))}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge label={msg.status} color={STATUS_COLOR[msg.status]} />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {msg.status !== 'approved' && (
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => setApproving(msg)}>Approve</Button>
                        {msg.status !== 'rejected' && (
                          <Button size="sm" variant="secondary" onClick={() => rejectOne(msg.id)}>Reject</Button>
                        )}
                      </div>
                    )}
                  </td>
                  {canDelete('sms_message') && (
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <DeleteButton disabled={!canDelete('sms_message')} onDelete={() => deleteOne(msg.id)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {count > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-muted)]">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      )}

      <Drawer open={selected !== null} onClose={() => setSelected(null)} title="SMS Message" width="w-full max-w-lg">
        {selected && (
          <div
            className="grid gap-4 text-sm"
            onTouchStart={(e) => { selectedSwipe.current = e.touches[0].clientX }}
            onTouchEnd={(e) => {
              if (selectedSwipe.current === null) return
              const dx = e.changedTouches[0].clientX - selectedSwipe.current
              selectedSwipe.current = null
              if (Math.abs(dx) > 60) navSelected(dx < 0 ? 1 : -1)
            }}
          >
            {/* Prev / next navigation */}
            {selectedIndex >= 0 && messages.length > 1 && (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => navSelected(-1)}
                  disabled={selectedIndex <= 0}
                  className="tap flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-30"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  Prev
                </button>
                <span className="text-xs text-[var(--text-muted)]">{selectedIndex + 1} of {messages.length}</span>
                <button
                  type="button"
                  onClick={() => navSelected(1)}
                  disabled={selectedIndex >= messages.length - 1}
                  className="tap flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-30"
                >
                  Next
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
              </div>
            )}
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Sender</span>
              <p className="mt-0.5 font-medium text-[var(--text)]">{selected.sender}</p>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Received</span>
              <p className="mt-0.5 text-[var(--text-2)]">{formatDateTime(selected.received_at)}</p>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Message</span>
              <p className="mt-1 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[var(--text-2)]">{selected.body}</p>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Categories</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {selected.categories.length === 0
                  ? <Badge label="Uncategorised" color="slate" />
                  : selected.categories.map((cat) => (
                      <Badge key={cat} label={CATEGORY_LABEL[cat] ?? cat} color={CATEGORY_COLOR[cat] ?? 'slate'} />
                    ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Status</span>
              <div className="mt-1 flex items-center gap-2">
                <Badge label={selected.status} color={STATUS_COLOR[selected.status]} />
              </div>
            </div>
            {selected.status !== 'approved' && (
              <div className="flex gap-2">
                <Button onClick={() => { const m = selected; setSelected(null); setApproving(m) }}>Approve…</Button>
                {selected.status !== 'rejected' && (
                  <Button variant="secondary" onClick={() => rejectOne(selected.id)}>Reject</Button>
                )}
              </div>
            )}
            {selected.imported_transaction_id && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Imported transaction</span>
                <p className="mt-0.5 text-[var(--text-2)]">#{selected.imported_transaction_id}</p>
              </div>
            )}
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Logged at</span>
              <p className="mt-0.5 text-[var(--text-2)]">{formatDateTime(selected.created_at)}</p>
            </div>
            {canDelete('sms_message') && (
              <div className="flex justify-end">
                <DeleteButton
                  label="Delete message"
                  disabled={!canDelete('sms_message')}
                  onDelete={async () => {
                    await deleteOne(selected.id)
                    setSelected(null)
                  }}
                />
              </div>
            )}
          </div>
        )}
      </Drawer>

      {approving && (
        <SmsApprovalForm
          key={approving.id}
          message={approving}
          accountOptions={accountOptions}
          memberOptions={memberOptions}
          instrumentOptions={instrumentOptions}
          position={approvingIndex >= 0 ? { current: approvingIndex + 1, total: approvableQueue.length } : undefined}
          hasPrev={approvingIndex > 0}
          hasNext={approvingIndex >= 0 && approvingIndex < approvableQueue.length - 1}
          onPrev={() => navApproving(-1)}
          onNext={() => navApproving(1)}
          onReject={() => rejectFromApproval(approving.id)}
          onApproved={() => {
            goToNextApprovable(approving.id)
            load()
          }}
          onCancel={() => setApproving(null)}
        />
      )}
    </div>
  )
}
