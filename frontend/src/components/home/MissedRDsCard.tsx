import { useState } from 'react'
import { Money } from '../common/Money'
import { DateText } from '../ui/DateText'
import { ExpandableGridCard } from '../common/ExpandableGridCard'
import { useExpandable } from '../../hooks/useExpandable'
import { MarkRDPaidSheet } from './MarkRDPaidSheet'
import { MarkAllRDsPaidSheet } from './MarkAllRDsPaidSheet'
import type { MissedRDAlert, OptionItem } from '../../types/domain'

type Props = {
  /** Inside the Home action-items sheet: no heading of its own. */
  embedded?: boolean
  items: MissedRDAlert[]
  accountOptions: OptionItem[]
  onPaid: () => void | Promise<void>
}

type RDGroup = {
  mandate_id: number
  instrument: string
  account: string
  dues: MissedRDAlert[]
  total: number
}

function groupByMandate(items: MissedRDAlert[]): RDGroup[] {
  const map = new Map<number, RDGroup>()
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

export function MissedRDsCard({ items, accountOptions, onPaid, embedded }: Props) {
  const [paidSheetTarget, setPaidSheetTarget] = useState<MissedRDAlert | null>(null)
  const [bulkSheetGroup, setBulkSheetGroup] = useState<RDGroup | null>(null)
  const groupExpand = useExpandable<number>()

  if (items.length === 0) return null

  const groups = groupByMandate(items)

  return (
    <div>
      {!embedded && <h2 className="mb-3 text-base font-semibold text-ink">Missed RD Installments</h2>}
      <div className="card-grid grid gap-3">
        {groups.map(group => {
          const isExpanded = groupExpand.isExpanded(group.mandate_id)
          return (
            <ExpandableGridCard
              key={group.mandate_id}
              expanded={isExpanded}
              onToggle={() => groupExpand.toggle(group.mandate_id)}
              className={isExpanded ? 'ring-2 ring-accent ring-offset-1 rounded-xl' : ''}
              collapsed={
                <div className="tap min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{group.instrument}</p>
                  <p className="text-xs text-[var(--text-muted)]">{group.dues.length} due{group.dues.length === 1 ? '' : 's'} · {group.account}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <Money value={group.total} className="text-lg font-bold text-ink tabular-nums" />
                    <p className="text-xs text-[var(--text-faint)]">total due</p>
                  </div>
                </div>
              }
            >
              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                {group.dues.length > 1 && (
                  <div className="flex items-center justify-end gap-3 border-b border-line dark:border-line px-4 py-1.5">
                    <button type="button" onClick={() => setBulkSheetGroup(group)}
                      className="text-xs font-medium text-ink hover:text-ink">
                      Mark all paid →
                    </button>
                  </div>
                )}
                {group.dues.map(rd => (
                  <div key={`${rd.mandate_id}-${rd.due_date}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[var(--text-muted)]">Due <DateText value={rd.due_date} /></p>
                    </div>
                    <Money value={rd.expected_amount} className="shrink-0 text-sm font-bold text-ink" />
                    <button
                      type="button"
                      onClick={() => setPaidSheetTarget(rd)}
                      className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
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
        <MarkRDPaidSheet
          alert={paidSheetTarget}
          accountOptions={accountOptions}
          onClose={() => setPaidSheetTarget(null)}
          onPaid={onPaid}
        />
      )}

      {bulkSheetGroup && (
        <MarkAllRDsPaidSheet
          alerts={bulkSheetGroup.dues}
          accountOptions={accountOptions}
          onClose={() => setBulkSheetGroup(null)}
          onPaid={onPaid}
        />
      )}
    </div>
  )
}
