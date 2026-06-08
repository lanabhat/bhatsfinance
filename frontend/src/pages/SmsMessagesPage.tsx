import { useEffect, useState } from 'react'
import type { SmsMessage } from '../types/domain'
import { smsApi } from '../api/smsApi'
import { Tabs } from '../components/ui/Tabs'
import { Badge } from '../components/ui/Badge'

type Props = {
  householdId: number
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

export function SmsMessagesPage({ householdId }: Props) {
  const [messages, setMessages] = useState<SmsMessage[]>([])
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

  // Debounce free-text search before triggering a refetch
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  useEffect(() => {
    if (!householdId) return
    setLoading(true)
    setError('')
    smsApi.listMessages(householdId, {
      status: statusFilter,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      search: search || undefined,
      sender: sender.trim() || undefined,
      received_after: dateFrom || undefined,
      received_before: dateTo || undefined,
      ordering,
    })
      .then(setMessages)
      .catch(() => setError('Failed to load SMS messages.'))
      .finally(() => setLoading(false))
  }, [householdId, statusFilter, categoryFilter, search, sender, dateFrom, dateTo, ordering])

  if (!householdId) {
    return <p className="text-sm text-slate-500">Select a household to view SMS messages.</p>
  }

  return (
    <div className="grid gap-6 max-w-4xl">
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
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Received</th>
                <th className="px-4 py-2.5">Sender</th>
                <th className="px-4 py-2.5">Message</th>
                <th className="px-4 py-2.5">Categories</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr key={msg.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(msg.received_at)}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{msg.sender}</td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-md truncate" title={msg.body}>{msg.body}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
