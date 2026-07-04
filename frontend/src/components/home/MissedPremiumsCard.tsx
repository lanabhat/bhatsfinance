import { useState } from 'react'
import { Money } from '../common/Money'
import { ExpandableGridCard } from '../common/ExpandableGridCard'
import { useExpandable } from '../../hooks/useExpandable'
import { MarkPremiumPaidSheet } from '../insurance/MarkPremiumPaidSheet'
import { BulkPremiumSheet } from '../insurance/BulkPremiumSheet'
import { insuranceApi } from '../../api/insuranceApi'
import type { MissedPremiumAlert, OptionItem } from '../../types/domain'

type Props = {
  items: MissedPremiumAlert[]
  accountOptions: OptionItem[]
  onPaid: () => void | Promise<void>
}

type PolicyGroup = {
  policy_id: number
  policy_name: string
  insurer_name: string
  member_name: string | null
  dues: MissedPremiumAlert[]
  total: number
}

function groupByPolicy(items: MissedPremiumAlert[]): PolicyGroup[] {
  const map = new Map<number, PolicyGroup>()
  for (const item of items) {
    if (!map.has(item.policy_id)) {
      map.set(item.policy_id, {
        policy_id: item.policy_id,
        policy_name: item.policy_name,
        insurer_name: item.insurer_name,
        member_name: item.member_name,
        dues: [],
        total: 0,
      })
    }
    const g = map.get(item.policy_id)!
    g.dues.push(item)
    g.total += parseFloat(item.premium_amount || '0')
  }
  return [...map.values()]
}

export function MissedPremiumsCard({ items, accountOptions, onPaid }: Props) {
  const [sheetTarget, setSheetTarget] = useState<MissedPremiumAlert | null>(null)
  const [bulkSheetGroup, setBulkSheetGroup] = useState<PolicyGroup | null>(null)
  const [ignoringId, setIgnoringId] = useState<string | null>(null)
  const [ignoringPolicyId, setIgnoringPolicyId] = useState<number | null>(null)
  const groupExpand = useExpandable<number>()

  if (items.length === 0) return null

  const groups = groupByPolicy(items)

  const ignoreOne = async (item: MissedPremiumAlert) => {
    const key = `${item.policy_id}-${item.due_date}`
    setIgnoringId(key)
    try {
      await insuranceApi.markPremiumPaid(item.policy_id, {
        due_date: item.due_date,
        deduct: false,
        note: 'Ignored from dashboard',
      })
      await onPaid()
    } catch { /* silent — onPaid refresh will re-show if failed */ }
    setIgnoringId(null)
  }

  const ignoreGroup = async (group: PolicyGroup) => {
    setIgnoringPolicyId(group.policy_id)
    try {
      await Promise.all(
        group.dues.map((item) =>
          insuranceApi.markPremiumPaid(item.policy_id, {
            due_date: item.due_date,
            deduct: false,
            note: 'Ignored from dashboard',
          })
        )
      )
      await onPaid()
    } catch { /* silent */ }
    setIgnoringPolicyId(null)
  }

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Insurance Premiums Due
      </h2>
      <div className="card-grid grid gap-3">
        {groups.map((group) => {
          const isIgnoringGroup = ignoringPolicyId === group.policy_id
          const isExpanded = groupExpand.isExpanded(group.policy_id)
          return (
            <ExpandableGridCard
              key={group.policy_id}
              expanded={isExpanded}
              onToggle={() => groupExpand.toggle(group.policy_id)}
              className={isExpanded ? 'ring-2 ring-rose-400 ring-offset-1 rounded-xl' : ''}
              collapsed={
                <div className="tap min-w-0 rounded-xl border border-rose-100 bg-rose-50 dark:border-rose-900/30 dark:bg-rose-900/10 px-4 py-3">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{group.policy_name}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {group.dues.length} due{group.dues.length === 1 ? '' : 's'}
                    {group.insurer_name ? ` · ${group.insurer_name}` : ''}
                    {group.member_name ? ` · ${group.member_name}` : ''}
                  </p>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="text-lg font-bold text-rose-700 dark:text-rose-300 tabular-nums">
                      {group.total > 0 ? <Money value={group.total} /> : '—'}
                    </span>
                    <p className="text-xs text-[var(--text-faint)]">total due</p>
                  </div>
                </div>
              }
            >
              <div className="overflow-hidden rounded-xl border border-rose-100 bg-rose-50 dark:border-rose-900/30 dark:bg-rose-900/10">
                {group.dues.length > 1 && (
                  <div className="flex items-center justify-end gap-3 border-b border-rose-100/60 dark:border-rose-900/20 px-4 py-1.5">
                    <button
                      type="button"
                      disabled={isIgnoringGroup}
                      onClick={() => ignoreGroup(group)}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-2)] disabled:opacity-40"
                    >
                      {isIgnoringGroup ? 'Ignoring…' : 'Ignore all'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkSheetGroup(group)}
                      className="text-xs font-medium text-rose-700 dark:text-rose-300 hover:text-rose-800"
                    >
                      Mark all paid →
                    </button>
                  </div>
                )}

                {group.dues.map((item) => {
                  const key = `${item.policy_id}-${item.due_date}`
                  const isIgnoring = ignoringId === key
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 border-b border-rose-100/60 dark:border-rose-900/20 px-4 py-2.5 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[var(--text-muted)]">Due {item.due_date}</p>
                        {item.grace_end && item.grace_end !== item.due_date && (
                          <p className="text-[10px] text-[var(--text-muted)]">Grace until {item.grace_end}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-medium text-rose-700 dark:text-rose-300">
                        {parseFloat(item.premium_amount) > 0 ? <Money value={item.premium_amount} /> : '—'}
                      </p>
                      <button
                        type="button"
                        disabled={isIgnoring}
                        onClick={() => ignoreOne(item)}
                        className="shrink-0 rounded-md border border-rose-200 dark:border-rose-800 px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-rose-100 dark:hover:bg-rose-900/30 disabled:opacity-40"
                      >
                        {isIgnoring ? '…' : 'Ignore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetTarget(item)}
                        className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                      >
                        Paid
                      </button>
                    </div>
                  )
                })}
              </div>
            </ExpandableGridCard>
          )
        })}
      </div>

      {sheetTarget && (
        <MarkPremiumPaidSheet
          alert={sheetTarget}
          accountOptions={accountOptions}
          onClose={() => setSheetTarget(null)}
          onPaid={onPaid}
        />
      )}

      {bulkSheetGroup && (
        <BulkPremiumSheet
          items={bulkSheetGroup.dues}
          accountOptions={accountOptions}
          onClose={() => setBulkSheetGroup(null)}
          onDone={onPaid}
        />
      )}
    </div>
  )
}
