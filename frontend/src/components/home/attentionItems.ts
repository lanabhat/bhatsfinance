import { fmtCount, fmtDateShort } from '../../lib/fmt'
import { openReview } from '../sms/reviewQueue'
import type { AttentionCounts, PendingSmsGroup } from '../../types/domain'

export type AttentionItem = {
  key: string
  count: number
  text: string
  onReview: () => void
  writeOnly?: boolean
  /** Small secondary line, e.g. the dates pending SMS arrived on. */
  detail?: string
  /** Per-day shortcuts (most recent first). */
  days?: { date: string; count: number; onClick: () => void }[]
}

const plural = (n: number, one: string, many: string) => `${fmtCount(n)} ${n === 1 ? one : many}`

const dateRange = (g: PendingSmsGroup) => {
  if (!g.first_date || !g.last_date) return ''
  if (g.first_date === g.last_date) return `On ${fmtDateShort(g.last_date)}`
  return `${fmtDateShort(g.first_date)} – ${fmtDateShort(g.last_date)}`
}

/** Open the full-page SMS review on these messages (newest first, as the server sends them). */
const review = (ids: number[]) => { if (ids.length > 0) openReview(ids[0], ids) }

/** The /api/attention counts as action-item rows (data-quality and review queues). */
export function buildAttentionItems(
  counts: AttentionCounts,
  { onNavigate, openFundMatch, canWrite }: { onNavigate: (route: string) => void; openFundMatch: () => void; canWrite: boolean },
): AttentionItem[] {
  const items: AttentionItem[] = [
    { key: 'funds', count: counts.unlinked_funds, text: plural(counts.unlinked_funds, 'fund isn’t', 'funds aren’t') + ' updating from daily NAV',
      onReview: openFundMatch, writeOnly: true },
    { key: 'never', count: counts.never_valued, text: plural(counts.never_valued, 'holding has', 'holdings have') + ' never been valued',
      onReview: () => onNavigate('holdings?valuation=never') },
    { key: 'stale', count: counts.stale_holdings, text: plural(counts.stale_holdings, 'holding hasn’t', 'holdings haven’t') + ' been valued in 30+ days',
      onReview: () => onNavigate('holdings?valuation=stale') },
    { key: 'uncat', count: counts.uncategorised, text: plural(counts.uncategorised, 'holding has', 'holdings have') + ' no category, so allocation is incomplete',
      onReview: () => onNavigate('instruments') },
    { key: 'dups', count: counts.duplicate_groups, text: plural(counts.duplicate_groups, 'possible duplicate', 'possible duplicates') + ' among holdings',
      onReview: () => onNavigate('holdings') },
    ...smsItems(counts, onNavigate),
    { key: 'gmail', count: counts.pending_gmail, text: plural(counts.pending_gmail, 'email waits', 'emails wait') + ' for review',
      onReview: () => onNavigate('gmail') },
  ]
  return items.filter((i) => i.count > 0 && (!i.writeOnly || canWrite))
}

/** Pending SMS as separate rows: transactions to approve and balance updates, with the
 *  dates they arrived on. Falls back to one count when the server sends no breakdown. */
function smsItems(counts: AttentionCounts, onNavigate: (route: string) => void): AttentionItem[] {
  const b = counts.pending_sms_breakdown
  if (!b) {
    return [{ key: 'sms', count: counts.pending_sms, text: plural(counts.pending_sms, 'SMS waits', 'SMS wait') + ' for review',
      onReview: () => onNavigate('sms') }]
  }
  const days = (g: PendingSmsGroup) => g.by_date.map((d) => ({ date: d.date, count: d.count, onClick: () => review(d.ids) }))
  return [
    { key: 'sms-tx', count: b.transactions.count,
      text: plural(b.transactions.count, 'transaction SMS waits', 'transaction SMS wait') + ' to be approved',
      detail: dateRange(b.transactions), days: days(b.transactions),
      onReview: () => review(b.transactions.ids) },
    { key: 'sms-bal', count: b.balances.count,
      text: plural(b.balances.count, 'balance SMS is', 'balance SMS are') + ' pending'
        + (b.balances.recorded > 0 ? ` (${fmtCount(b.balances.recorded)} already recorded automatically)` : ''),
      detail: dateRange(b.balances), days: days(b.balances),
      onReview: () => review(b.balances.ids) },
    { key: 'sms-unread', count: b.unread,
      text: plural(b.unread, 'SMS hasn’t', 'SMS haven’t') + ' been read for amount and account yet — use “Re-read all pending”',
      onReview: () => onNavigate('sms') },
  ]
}
