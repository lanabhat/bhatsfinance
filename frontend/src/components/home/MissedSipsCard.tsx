import { useState } from 'react'
import { Money } from '../common/Money'
import { ExpandableGridCard } from '../common/ExpandableGridCard'
import { useExpandable } from '../../hooks/useExpandable'
import { MarkSipPaidSheet } from './MarkSipPaidSheet'
import { MarkAllSipsPaidSheet } from './MarkAllSipsPaidSheet'
import type { MissedSipAlert, OptionItem } from '../../types/domain'

type Props = {
  items: MissedSipAlert[]
  accountOptions: OptionItem[]
  onPaid: () => void | Promise<void>
}

type SipGroup = {
  mandate_id: number
  instrument: string
  account: string
  dues: MissedSipAlert[]
  total: number
}

function groupByMandate(items: MissedSipAlert[]): SipGroup[] {
  const map = new Map<number, SipGroup>()
  for (const item of items) {
    if (!map.has(item.mandate_id)) {
      map.set(item.mandate_id, { mandate_id: item.mandate_id, instrument: item.instrument, account: item.account, dues: [], total: 0 })
    }
    const g = map.get(item.mandate_id)!
    g.dues.push(item)
    g.total += parseFloat(item.expected_amount || '0')
  }
  return [...map.values()]
}

export function MissedSipsCard({ items, accountOptions, onPaid }: Props) {
  const [paidSheetTarget, setPaidSheetTarget] = useState<MissedSipAlert | null>(null)
  const [bulkSheetGroup, setBulkSheetGroup] = useState<SipGroup | null>(null)
  const groupExpand = useExpandable<number>()

  if (items.length === 0) return null

  const groups = groupByMandate(items)

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Missed SIPs</h2>
      <div className="card-grid grid gap-3">
        {groups.map(group => {
          const isExpanded = groupExpand.isExpanded(group.mandate_id)
          return (
            <ExpandableGridCard
              key={group.mandate_id}
              expanded={isExpanded}
              onToggle={() => groupExpand.toggle(group.mandate_id)}
              className={isExpanded ? 'ring-2 ring-amber-400 ring-offset-1 rounded-xl' : ''}
              collapsed={
                <div className="tap min-w-0 rounded-xl border border-amber-100 bg-amber-50 dark:bg-amber-900/15 px-4 py-3">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{group.instrument}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{group.dues.length} due{group.dues.length === 1 ? '' : 's'} · {group.account}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <Money value={group.total} className="text-lg font-bold text-amber-800 dark:text-amber-300 tabular-nums" />
                    <p className="text-xs text-[var(--text-faint)]">total due</p>
                  </div>
                </div>
              }
            >
              <div className="overflow-hidden rounded-xl border border-amber-100 bg-amber-50 dark:bg-amber-900/15">
                {group.dues.length > 1 && (
                  <div className="flex items-center justify-end gap-3 border-b border-amber-100/60 dark:border-amber-900/20 px-4 py-1.5">
                    <button type="button" onClick={() => setBulkSheetGroup(group)}
                      className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800">
                      Mark all paid →
                    </button>
                  </div>
                )}
                {group.dues.map(sip => (
                  <div key={`${sip.mandate_id}-${sip.due_date}`} className="flex items-center gap-3 border-b border-amber-100 px-4 py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[var(--text-muted)]">Due {sip.due_date}</p>
                    </div>
                    <Money value={sip.expected_amount} className="shrink-0 text-sm font-bold text-amber-700 dark:text-amber-300" />
                    <button
                      type="button"
                      onClick={() => setPaidSheetTarget(sip)}
                      className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                    >
                      Mark paid
                    </button>
                  </div>
                ))}
              </div>
            </ExpandableGridCard>
          )
        })}
      </div>

      {paidSheetTarget && (
        <MarkSipPaidSheet
          alert={paidSheetTarget}
          accountOptions={accountOptions}
          onClose={() => setPaidSheetTarget(null)}
          onPaid={onPaid}
        />
      )}

      {bulkSheetGroup && (
        <MarkAllSipsPaidSheet
          alerts={bulkSheetGroup.dues}
          accountOptions={accountOptions}
          onClose={() => setBulkSheetGroup(null)}
          onPaid={onPaid}
        />
      )}
    </div>
  )
}
