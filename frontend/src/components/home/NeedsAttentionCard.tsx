import { useCallback, useEffect, useState } from 'react'
import { getJson, toQueryString } from '../../api/http'
import { useAuth } from '../../context/AuthContext'
import { FundMatchSheet } from '../allocation/FundMatchSheet'
import { openReview } from '../sms/reviewQueue'
import { Sheet } from '../ui/Sheet'
import type { AttentionCounts, PendingSmsGroup } from '../../types/domain'

type Props = {
  householdId: number
  onNavigate: (route: string) => void
  onChanged: () => void | Promise<void>
}

type Item = {
  key: string; count: number; text: string; action: string; onClick: () => void; writeOnly?: boolean
  /** Small secondary line, e.g. the dates pending SMS arrived on. */
  detail?: string
  /** Per-day shortcuts (most recent first). */
  days?: { date: string; count: number; onClick: () => void }[]
}

const shortDate = (iso: string, withYear = false) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })

const dateRange = (g: PendingSmsGroup) => {
  if (!g.first_date || !g.last_date) return ''
  if (g.first_date === g.last_date) return `on ${shortDate(g.last_date)}`
  const thisYear = String(new Date().getFullYear())
  return `${shortDate(g.first_date, !g.first_date.startsWith(thisYear))} – ${shortDate(g.last_date)}`
}

/** Open the full-page SMS review on these messages (newest first, as the server sends them). */
const review = (ids: number[]) => { if (ids.length > 0) openReview(ids[0], ids) }

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`

export function NeedsAttentionCard({ householdId, onNavigate, onChanged }: Props) {
  const { canWrite } = useAuth()
  const [counts, setCounts] = useState<AttentionCounts | null>(null)
  const [matching, setMatching] = useState(false)

  const load = useCallback(() => {
    getJson<AttentionCounts>(`/api/attention?${toQueryString({ household_id: householdId })}`)
      .then(setCounts)
      .catch(() => setCounts(null))
  }, [householdId])

  useEffect(() => { load() }, [load])

  if (!counts) return null

  const items: Item[] = [
    { key: 'funds', count: counts.unlinked_funds, text: plural(counts.unlinked_funds, 'fund isn’t', 'funds aren’t') + ' updating from daily NAV',
      action: 'Link funds', onClick: () => setMatching(true), writeOnly: true },
    { key: 'never', count: counts.never_valued, text: plural(counts.never_valued, 'holding has', 'holdings have') + ' never been valued',
      action: 'Review', onClick: () => onNavigate('holdings') },
    { key: 'stale', count: counts.stale_holdings, text: plural(counts.stale_holdings, 'holding hasn’t', 'holdings haven’t') + ' been valued in 30+ days',
      action: 'Review', onClick: () => onNavigate('holdings') },
    { key: 'uncat', count: counts.uncategorised, text: plural(counts.uncategorised, 'holding has', 'holdings have') + ' no category, so allocation is incomplete',
      action: 'Categorise', onClick: () => onNavigate('instruments') },
    { key: 'dups', count: counts.duplicate_groups, text: plural(counts.duplicate_groups, 'possible duplicate', 'possible duplicates'),
      action: 'Clean up', onClick: () => onNavigate('holdings') },
    ...smsItems(counts, onNavigate),
    { key: 'gmail', count: counts.pending_gmail, text: plural(counts.pending_gmail, 'email waits', 'emails wait') + ' for review',
      action: 'Review', onClick: () => onNavigate('gmail') },
  ].filter((i) => i.count > 0 && (!i.writeOnly || canWrite))

  if (items.length === 0) return null

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Needs attention</h2>
      <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/15">
        {items.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-3 border-b border-amber-200/70 px-4 py-2.5 last:border-0 dark:border-amber-800/40">
            <div className="min-w-0">
              <p className="text-sm text-[var(--text)]">{item.text}</p>
              {item.detail && <p className="text-[11px] text-[var(--text-muted)]">{item.detail}</p>}
              {item.days && item.days.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {item.days.map((d) => (
                    <button key={d.date} type="button" onClick={d.onClick} title={`Review the SMS from ${shortDate(d.date, true)}`}
                      className="rounded-full border border-amber-300 bg-[var(--surface)] px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30">
                      {shortDate(d.date)} · {d.count}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={item.onClick}
              className="shrink-0 rounded-lg border border-amber-300 bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
            >
              {item.action}
            </button>
          </div>
        ))}
      </div>

      {matching && (
        <Sheet title="Link funds to daily NAV" onClose={() => setMatching(false)} wide>
          <FundMatchSheet
            householdId={householdId}
            onDone={async () => { setMatching(false); load(); await onChanged() }}
            onCancel={() => setMatching(false)}
          />
        </Sheet>
      )}
    </div>
  )
}

/** Pending SMS as separate notifications: transactions to approve and balance
 *  updates, each with the dates they arrived on. Falls back to a single count
 *  when the server doesn't send the breakdown. */
function smsItems(counts: AttentionCounts, onNavigate: (route: string) => void): Item[] {
  const b = counts.pending_sms_breakdown
  if (!b) {
    return [{ key: 'sms', count: counts.pending_sms, text: plural(counts.pending_sms, 'SMS waits', 'SMS wait') + ' for review',
      action: 'Review', onClick: () => onNavigate('sms') }]
  }
  const days = (g: PendingSmsGroup) => g.by_date.map((d) => ({ date: d.date, count: d.count, onClick: () => review(d.ids) }))
  const items: Item[] = [
    { key: 'sms-tx', count: b.transactions.count,
      text: plural(b.transactions.count, 'transaction SMS waits', 'transaction SMS wait') + ' to be approved',
      detail: dateRange(b.transactions), days: days(b.transactions),
      action: 'Review', onClick: () => review(b.transactions.ids) },
    { key: 'sms-bal', count: b.balances.count,
      text: plural(b.balances.count, 'balance SMS is', 'balance SMS are') + ' pending'
        + (b.balances.recorded > 0 ? ` (${b.balances.recorded.toLocaleString('en-IN')} already recorded automatically)` : ''),
      detail: dateRange(b.balances), days: days(b.balances),
      action: 'Review', onClick: () => review(b.balances.ids) },
    { key: 'sms-unread', count: b.unread,
      text: plural(b.unread, 'SMS hasn’t', 'SMS haven’t') + ' been read for amount and account yet — use “Re-read all pending”',
      action: 'Open SMS', onClick: () => onNavigate('sms') },
  ]
  return items
}
