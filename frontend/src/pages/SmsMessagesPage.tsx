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

  if (!householdId) {
    return <p className="text-sm text-slate-500">Select a household to view SMS messages.</p>
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
        <h2 className="text-lg font-semibold text-slate-900">SMS Messages</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Browse staged messages forwarded from registered devices. Categories are auto-detected
          from the message body — use them to quickly find transaction alerts, OTPs, SIP reminders, and promotions.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Tabs tabs={CATEGORY_TABS} active={categoryFilter} onChange={setCategoryFilter} size="sm" />
        <Tabs tabs={STATUS_TABS} active={statusFilter} onChange={setStatusFilter} size="sm" />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span className="text-xs font-medium text-slate-500">Search</span>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search body or sender…"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 min-w-[140px]">
          <span className="text-xs font-medium text-slate-500">Sender</span>
          <input
            type="text"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="e.g. HDFCBK"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Sort</span>
          <select
            value={ordering}
            onChange={(e) => setOrdering(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="-received_at">Newest first</option>
            <option value="received_at">Oldest first</option>
            <option value="sender">Sender (A–Z)</option>
            <option value="-sender">Sender (Z–A)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Per page</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {importResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${importResult.errors.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
          <p className={importResult.errors.length > 0 ? 'text-amber-800' : 'text-green-800'}>
            Import complete — <strong>{importResult.created}</strong> created, <strong>{importResult.skipped}</strong> skipped (duplicates)
            {importResult.errors.length > 0 && `, ${importResult.errors.length} error${importResult.errors.length === 1 ? '' : 's'}`}.
          </p>
          <button type="button" onClick={() => setImportResult(null)} className="mt-1 text-xs text-slate-500 hover:text-slate-700">Dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {count === 0 ? 'No messages' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} of ${count}`}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {reapplyResult && (
            <span className="text-xs text-green-600">{reapplyResult}</span>
          )}
          {/* Export */}
          <Button size="sm" variant="secondary" onClick={exportMessages}>
            {checked.size > 0 ? `Export selected (${checked.size})` : 'Export all'}
          </Button>
          {/* Import */}
          <label className="cursor-pointer">
            <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
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
                <span className="text-slate-600">Delete {checked.size} selected message{checked.size === 1 ? '' : 's'}?</span>
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
        <p className="text-sm text-slate-400">Loading…</p>
      ) : messages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-600">No messages found</p>
          <p className="mt-1 text-xs text-slate-400">
            Try a different filter, or send a test message from the SMS Test Sender page.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
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
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
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
                  className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50"
                  onClick={() => setSelected(msg)}
                >
                  {canDelete('sms_message') && (
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked.has(msg.id)} onChange={() => toggleOne(msg.id)} aria-label={`Select message from ${msg.sender}`} />
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(msg.received_at)}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap truncate">{msg.sender}</td>
                  <td className="px-4 py-2.5 text-slate-600 truncate" title={msg.body}>{msg.body}</td>
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
          <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
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
          <div className="grid gap-4 text-sm">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Sender</span>
              <p className="mt-0.5 font-medium text-slate-800">{selected.sender}</p>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Received</span>
              <p className="mt-0.5 text-slate-700">{formatDateTime(selected.received_at)}</p>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Message</span>
              <p className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-3 text-slate-700">{selected.body}</p>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Categories</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {selected.categories.length === 0
                  ? <Badge label="Uncategorised" color="slate" />
                  : selected.categories.map((cat) => (
                      <Badge key={cat} label={CATEGORY_LABEL[cat] ?? cat} color={CATEGORY_COLOR[cat] ?? 'slate'} />
                    ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</span>
              <div className="mt-1 flex items-center gap-2">
                <Badge label={selected.status} color={STATUS_COLOR[selected.status]} />
              </div>
            </div>
            {selected.status !== 'approved' && (
              <div className="flex gap-2">
                <Button onClick={() => setApproving(selected)}>Approve…</Button>
                {selected.status !== 'rejected' && (
                  <Button variant="secondary" onClick={() => rejectOne(selected.id)}>Reject</Button>
                )}
              </div>
            )}
            {selected.imported_transaction_id && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Imported transaction</span>
                <p className="mt-0.5 text-slate-700">#{selected.imported_transaction_id}</p>
              </div>
            )}
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Logged at</span>
              <p className="mt-0.5 text-slate-700">{formatDateTime(selected.created_at)}</p>
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

      <Drawer open={approving !== null} onClose={() => setApproving(null)} title="Approve SMS → Add to Ledger" width="w-full max-w-lg">
        {approving && (
          <SmsApprovalForm
            message={approving}
            accountOptions={accountOptions}
            memberOptions={memberOptions}
            instrumentOptions={instrumentOptions}
            onApproved={() => {
              setApproving(null)
              setSelected(null)
              load()
            }}
            onCancel={() => setApproving(null)}
          />
        )}
      </Drawer>
    </div>
  )
}
