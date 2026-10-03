import { useCallback, useEffect, useState } from 'react'
import { getJson, toQueryString } from '../../api/http'
import { useAuth } from '../../context/AuthContext'
import { FundMatchSheet } from '../allocation/FundMatchSheet'
import { Sheet } from '../ui/Sheet'
import type { AttentionCounts } from '../../types/domain'

type Props = {
  householdId: number
  onNavigate: (route: string) => void
  onChanged: () => void | Promise<void>
}

type Item = { key: string; count: number; text: string; action: string; onClick: () => void; writeOnly?: boolean }

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
    { key: 'sms', count: counts.pending_sms, text: plural(counts.pending_sms, 'SMS waits', 'SMS wait') + ' for review',
      action: 'Review', onClick: () => onNavigate('sms') },
    { key: 'gmail', count: counts.pending_gmail, text: plural(counts.pending_gmail, 'email waits', 'emails wait') + ' for review',
      action: 'Review', onClick: () => onNavigate('gmail') },
  ].filter((i) => i.count > 0 && (!i.writeOnly || canWrite))

  if (items.length === 0) return null

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Needs attention</h2>
      <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/15">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3 border-b border-amber-200/70 px-4 py-2.5 last:border-0 dark:border-amber-800/40">
            <p className="min-w-0 text-sm text-[var(--text)]">{item.text}</p>
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
