import { useState } from 'react'
import { Money } from '../common/Money'
import { DateText } from '../ui/DateText'
import { ExpandableGridCard } from '../common/ExpandableGridCard'
import { useExpandable } from '../../hooks/useExpandable'
import { MarkPremiumPaidSheet } from '../insurance/MarkPremiumPaidSheet'
import { BulkPremiumSheet } from '../insurance/BulkPremiumSheet'
import { insuranceApi } from '../../api/insuranceApi'
import type { MissedPremiumAlert, OptionItem } from '../../types/domain'
import { useErrorToast } from '../../hooks/useErrorToast'

type Props = {
  /** Inside the Home action-items sheet: no heading of its own. */
  embedded?: boolean
  items: MissedPremiumAlert[]
  accountOptions: OptionItem[]
  onPaid: () => void | Promise<void>
}

type PolicyGroup = {
  policy_id: number
  policy_name: string
  policy_number: string
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
        policy_number: item.policy_number,
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

export function MissedPremiumsCard({ items, accountOptions, onPaid, embedded }: Props) {
  const [sheetTarget, setSheetTarget] = useState<MissedPremiumAlert | null>(null)
  const [bulkSheetGroup, setBulkSheetGroup] = useState<PolicyGroup | null>(null)
  const [ignoringId, setIgnoringId] = useState<string | null>(null)
  const [ignoringPolicyId, setIgnoringPolicyId] = useState<number | null>(null)
  const groupExpand = useExpandable<number>()
  const errorToast = useErrorToast()

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
    } catch (e) {
      errorToast('Couldn’t ignore the premium')(e)
    }
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
    } catch (e) {
      errorToast('Couldn’t ignore the premiums')(e)
    }
    setIgnoringPolicyId(null)
  }

  return (
    <div>
      {!embedded && <h2 className="mb-3 text-base font-semibold text-ink">
        Insurance Premiums Due
      </h2>}
      <div className="card-grid grid gap-3">
        {groups.map((group) => {
          const isIgnoringGroup = ignoringPolicyId === group.policy_id
          const isExpanded = groupExpand.isExpanded(group.policy_id)
          return (
            <ExpandableGridCard
              key={group.policy_id}
              expanded={isExpanded}
              onToggle={() => groupExpand.toggle(group.policy_id)}
              className={isExpanded ? 'ring-2 ring-accent ring-offset-1 rounded-xl' : ''}
              collapsed={
                <div className="tap min-w-0 rounded-xl border border-line bg-surface dark:border-line px-4 py-3">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{group.policy_name}</p>
                  {group.policy_number && (
                    <p className="truncate font-mono text-xs text-[var(--text-faint)]">{group.policy_number}</p>
                  )}
                  <p className="text-xs text-[var(--text-muted)]">
                    {group.dues.length} due{group.dues.length === 1 ? '' : 's'}
                    {group.insurer_name ? ` · ${group.insurer_name}` : ''}
                    {group.member_name ? ` · ${group.member_name}` : ''}
                  </p>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="text-lg font-bold text-ink tabular-nums">
                      {group.total > 0 ? <Money value={group.total} /> : '—'}
                    </span>
                    <p className="text-xs text-[var(--text-faint)]">total due</p>
                  </div>
                </div>
              }
            >
              <div className="overflow-hidden rounded-xl border border-line bg-surface dark:border-line">
                {group.dues.length > 1 && (
                  <div className="flex items-center justify-end gap-3 border-b border-line dark:border-line px-4 py-1.5">
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
                      className="text-xs font-medium text-ink hover:text-ink"
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
                      className="flex items-center gap-2 border-b border-line dark:border-line px-4 py-2.5 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[var(--text-muted)]">Due <DateText value={item.due_date} /></p>
                        {item.grace_end && item.grace_end !== item.due_date && (
                          <p className="text-xs text-[var(--text-muted)]">Grace until {item.grace_end}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-medium text-ink">
                        {parseFloat(item.premium_amount) > 0 ? <Money value={item.premium_amount} /> : '—'}
                      </p>
                      <button
                        type="button"
                        disabled={isIgnoring}
                        onClick={() => ignoreOne(item)}
                        className="shrink-0 rounded-md border border-line dark:border-line px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-surface-2 disabled:opacity-40"
                      >
                        {isIgnoring ? '…' : 'Ignore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetTarget(item)}
                        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
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
