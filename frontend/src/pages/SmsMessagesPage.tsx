import { useEffect, useRef, useState } from 'react'
import { CoinSpinner } from '../components/common/CoinSpinner'
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
  const [deviceFilter, setDeviceFilter] = useState('')
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
    device_id: deviceFilter || undefined,
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
  }, [householdId, statusFilter, categoryFilter, search, sender, deviceFilter, dateFrom, dateTo, ordering, pageSize])

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
  }, [householdId, statusFilter, categoryFilter, search, sender, deviceFilter, dateFrom, dateTo, ordering, page, pageSize])

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
      if (statusFilter === 'all' || statusFilter === 'rejected') {
        setMessages((prev) => prev.map((m) => m.id === id ? { ...m, status: 'rejected' as const } : m))
        setSelected((prev) => prev?.id === id ? { ...prev, status: 'rejected' as const } : prev)
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== id))
        setCount((c) => Math.max(0, c - 1))
        setSelected((prev) => prev?.id === id ? null : prev)
      }
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
      if (statusFilter === 'all' || statusFilter === 'rejected') {
        setMessages((prev) => prev.map((m) => m.id === id ? { ...m, status: 'rejected' as const } : m))
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== id))
        setCount((c) => Math.max(0, c - 1))
      }
      goToNextApprovable(id)
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

  const rejectSelected = async () => {
    setError('')
    setBulkBusy(true)
    const ids = Array.from(checked).filter((id) => {
      const msg = messages.find((m) => m.id === id)
      return msg && msg.status !== 'rejected'
    })
    try {
      await Promise.all(ids.map((id) => smsApi.rejectStaged(id)))
      if (statusFilter === 'all' || statusFilter === 'rejected') {
        setMessages((prev) => prev.map((m) => ids.includes(m.id) ? { ...m, status: 'rejected' as const } : m))
      } else {
        setMessages((prev) => {
          const next = prev.filter((m) => !ids.includes(m.id))
          if (next.length === 0 && page > 1) setPage(1)
          return next
        })
        setCount((c) => Math.max(0, c - ids.length))
      }
      setChecked(new Set())
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
    <div className="grid w-full min-w-0 max-w-full gap-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">SMS Messages</h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Browse staged messages forwarded from registered devices.
        </p>
      </div>

      <div className="flex min-w-0 max-w-full flex-col gap-2">
        <Tabs tabs={CATEGORY_TABS} active={categoryFilter} onChange={setCategoryFilter} size="sm" />
        <Tabs tabs={STATUS_TABS} active={statusFilter} onChange={setStatusFilter} size="sm" />
      </div>

      {/* Filters — collapsible on mobile */}
      <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Filters &amp; Options</span>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-[var(--text-faint)] transition-transform group-open:rotate-90">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
          </svg>
        </summary>
        <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] p-4 sm:grid-cols-3">
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-3">
            <span className="text-xs font-medium text-[var(--text-muted)]">Search</span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search body or sender…"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">Sender</span>
            <input
              type="text"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="e.g. HDFCBK"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">Device</span>
            <input
              type="text"
              list="sms-device-ids"
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              placeholder="e.g. kitchen-pixel-6a"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
            />
            <datalist id="sms-device-ids">
              {Array.from(new Set(messages.map((m) => m.device_id).filter(Boolean))).map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">Sort</span>
            <select
              value={ordering}
              onChange={(e) => setOrdering(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
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
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
            />
          </label>
        </div>
      </details>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {importResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${importResult.errors.length > 0 ? 'border-amber-200 bg-amber-50 dark:bg-amber-900/15' : 'border-green-200 bg-green-50 dark:bg-green-900/15'}`}>
          <p className={importResult.errors.length > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-green-800 dark:text-green-300'}>
            Import complete — <strong>{importResult.created}</strong> created, <strong>{importResult.skipped}</strong> skipped
            {importResult.errors.length > 0 && `, ${importResult.errors.length} error${importResult.errors.length === 1 ? '' : 's'}`}.
          </p>
          <button type="button" onClick={() => setImportResult(null)} className="mt-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-2)]">Dismiss</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            {count === 0 ? 'No messages' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} of ${count}`}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={exportMessages}>
              {checked.size > 0 ? `Export (${checked.size})` : 'Export'}
            </Button>
            <label className="cursor-pointer">
              <span className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]">
                {importing ? 'Importing…' : 'Import'}
              </span>
              <input ref={importFileRef} type="file" accept=".json" className="sr-only" onChange={handleImportFile} disabled={importing} />
            </label>
          </div>
        </div>
        {/* Bulk actions — only when items checked */}
        {checked.size > 0 && (
          <div className="flex flex-wrap gap-2">
            {reapplyResult && <span className="text-xs text-emerald-600 dark:text-emerald-400">{reapplyResult}</span>}
            <Button size="sm" variant="secondary" loading={bulkBusy} onClick={reapplyRules}>
              Re-apply rules ({checked.size})
            </Button>
            {messages.some((m) => checked.has(m.id) && m.status !== 'rejected') && (
              <Button size="sm" variant="secondary" loading={bulkBusy} onClick={rejectSelected}>
                Reject ({checked.size})
              </Button>
            )}
            {canDelete('sms_message') && (
              confirmingBulkDelete ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--text-2)]">Delete {checked.size}?</span>
                  <Button size="sm" variant="danger" loading={bulkBusy} onClick={deleteSelected}>Confirm</Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmingBulkDelete(false)}>Cancel</Button>
                </span>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setConfirmingBulkDelete(true)}>
                  Delete ({checked.size})
                </Button>
              )
            )}
          </div>
        )}
        {canDelete('sms_message') && count > 0 && !checked.size && (
          confirmingDeleteAll ? (
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-red-600">Delete all {count} matching?</span>
              <Button size="sm" variant="danger" loading={bulkBusy} onClick={deleteAllMatching}>Yes, delete all</Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmingDeleteAll(false)}>Cancel</Button>
            </span>
          ) : (
            <div>
              <Button size="sm" variant="danger" onClick={() => setConfirmingDeleteAll(true)}>
                Delete all matching…
              </Button>
            </div>
          )
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><CoinSpinner size={48} /></div>
      ) : messages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">No messages found</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Try a different filter, or send a test message from the SMS Test Sender page.
          </p>
        </div>
      ) : (
        <>
          {/* ── Desktop table ── */}
          <div className="hidden md:block w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  {canDelete('sms_message') && (
                    <th className="w-8 px-3 py-2.5">
                      <input type="checkbox" checked={allOnPageChecked} onChange={toggleAllOnPage} aria-label="Select all on page" />
                    </th>
                  )}
                  <th className="w-32 px-3 py-2.5">Received</th>
                  <th className="w-24 px-3 py-2.5">Sender</th>
                  <th className="px-3 py-2.5">Message</th>
                  <th className="w-20 px-3 py-2.5">Category</th>
                  <th className="w-32 px-3 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr
                    key={msg.id}
                    className="cursor-pointer border-t border-[var(--border)] align-middle hover:bg-[var(--surface-2)]"
                    onClick={() => setSelected(msg)}
                  >
                    {canDelete('sms_message') && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked.has(msg.id)} onChange={() => toggleOne(msg.id)} aria-label={`Select message from ${msg.sender}`} />
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-xs text-[var(--text-muted)]">
                      <span className="block truncate">{formatDateTime(msg.received_at)}</span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[var(--text)]">
                      <span className="block truncate">{msg.sender}</span>
                      {msg.device_id && <span className="block truncate text-[10px] font-normal text-[var(--text-muted)]">📱 {msg.device_id}</span>}
                    </td>
                    <td className="px-3 py-3 min-w-0">
                      <p className="line-clamp-2 break-words text-[var(--text-2)]">{msg.body}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge label={msg.status} color={STATUS_COLOR[msg.status]} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {msg.categories.length === 0
                        ? <Badge label="—" color="slate" />
                        : <Badge label={CATEGORY_LABEL[msg.categories[0]] ?? msg.categories[0]} color={CATEGORY_COLOR[msg.categories[0]] ?? 'slate'} />}
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-1">
                        {msg.status !== 'approved' && (
                          <>
                            <Button size="sm" onClick={() => setApproving(msg)}>Approve</Button>
                            {msg.status !== 'rejected' && (
                              <Button size="sm" variant="secondary" onClick={() => rejectOne(msg.id)}>Reject</Button>
                            )}
                          </>
                        )}
                        {canDelete('sms_message') && (
                          <DeleteButton disabled={!canDelete('sms_message')} onDelete={() => deleteOne(msg.id)} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile card list ── */}
          <div className="md:hidden">
            {/* Select-all + bulk reject bar */}
            <div className="mb-2 flex items-center gap-3 px-1">
              <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <input type="checkbox" checked={allOnPageChecked} onChange={toggleAllOnPage} aria-label="Select all on page" />
                Select all
              </label>
              {checked.size > 0 && messages.some((m) => checked.has(m.id) && m.status !== 'rejected') && (
                <Button size="sm" variant="secondary" loading={bulkBusy} onClick={rejectSelected}>
                  Reject ({checked.size})
                </Button>
              )}
              {checked.size > 0 && canDelete('sms_message') && (
                confirmingBulkDelete ? (
                  <span className="flex items-center gap-1.5 text-xs">
                    <Button size="sm" variant="danger" loading={bulkBusy} onClick={deleteSelected}>Confirm delete</Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmingBulkDelete(false)}>Cancel</Button>
                  </span>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => setConfirmingBulkDelete(true)}>
                    Delete ({checked.size})
                  </Button>
                )
              )}
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="flex min-w-0 items-start gap-3 px-4 py-4 cursor-pointer hover:bg-[var(--surface-2)]"
                onClick={() => setSelected(msg)}
              >
                {canDelete('sms_message') && (
                  <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={checked.has(msg.id)} onChange={() => toggleOne(msg.id)} aria-label={`Select message from ${msg.sender}`} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--text)] truncate">{msg.sender}</span>
                    <Badge label={msg.status} color={STATUS_COLOR[msg.status]} />
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {formatDateTime(msg.received_at)}{msg.device_id && ` · 📱 ${msg.device_id}`}
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-2)] line-clamp-3 leading-relaxed">{msg.body}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {msg.categories.length === 0
                      ? <Badge label="Uncategorised" color="slate" />
                      : msg.categories.map((cat) => (
                          <Badge key={cat} label={CATEGORY_LABEL[cat] ?? cat} color={CATEGORY_COLOR[cat] ?? 'slate'} />
                        ))}
                  </div>
                  {msg.status !== 'approved' && (
                    <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" onClick={() => setApproving(msg)}>Approve</Button>
                      {msg.status !== 'rejected' && (
                        <Button size="sm" variant="secondary" onClick={() => rejectOne(msg.id)}>Reject</Button>
                      )}
                      {canDelete('sms_message') && (
                        <DeleteButton disabled={!canDelete('sms_message')} onDelete={() => deleteOne(msg.id)} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            </div>
          </div>
        </>
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
            {selected.device_id && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Device</span>
                <p className="mt-0.5 text-[var(--text-2)]">📱 {selected.device_id}</p>
              </div>
            )}
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Message</span>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[var(--text-2)]">{selected.body}</p>
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
