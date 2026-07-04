import { Money } from '../common/Money'
import { ExpandableGridCard } from '../common/ExpandableGridCard'
import { useExpandable } from '../../hooks/useExpandable'
import type { MaturingFD } from '../../types/domain'

type Props = {
  items: MaturingFD[]
  windowDays: number
}

function formatRemaining(days: number): string {
  if (days === 0) return 'Matures today'
  if (days === 1) return '1 day left'
  if (days < 30) return `${days} days left`
  const months = Math.round(days / 30)
  return months === 1 ? '~1 month left' : `~${months} months left`
}

type MemberGroup = {
  key: string
  label: string
  items: MaturingFD[]
}

function groupByMember(items: MaturingFD[]): MemberGroup[] {
  const groups = new Map<string, MemberGroup>()
  const unassigned: MaturingFD[] = []

  for (const fd of items) {
    if (!fd.owners || fd.owners.length === 0) {
      unassigned.push(fd)
      continue
    }
    for (const owner of fd.owners) {
      const key = String(owner.member_id)
      if (!groups.has(key)) {
        groups.set(key, { key, label: owner.member_name, items: [] })
      }
      groups.get(key)!.items.push(fd)
    }
  }

  const result = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
  if (unassigned.length > 0) {
    result.push({ key: 'unassigned', label: 'Unassigned', items: unassigned })
  }
  return result
}

function GroupSummaryRow({ group }: { group: MemberGroup }) {
  const total = group.items.reduce((s, fd) => s + parseFloat(fd.maturity_value), 0)
  const soonest = group.items.reduce((min, fd) => Math.min(min, fd.days_remaining), Infinity)
  const initials = group.label.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="tap min-w-0 rounded-xl border border-amber-100 bg-amber-50 dark:bg-amber-900/15 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-sm font-semibold text-[var(--text-2)]">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text)]">{group.label}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{group.items.length} FD{group.items.length === 1 ? '' : 's'} · {formatRemaining(soonest)}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-end justify-between">
        <Money value={total} className="text-lg font-bold text-amber-800 dark:text-amber-300 tabular-nums" />
        <p className="text-xs text-[var(--text-faint)]">maturity total</p>
      </div>
    </div>
  )
}

export function MaturingFDsCard({ items, windowDays }: Props) {
  const groupExpand = useExpandable<string>()

  if (items.length === 0) return null

  const groups = groupByMember(items)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Maturing Soon</h2>
        <span className="text-[10px] text-[var(--text-muted)]">Next {windowDays} days</span>
      </div>
      <div className="card-grid grid gap-3">
        {groups.map(group => {
          const isExpanded = groupExpand.isExpanded(group.key)
          return (
            <ExpandableGridCard
              key={group.key}
              expanded={isExpanded}
              onToggle={() => groupExpand.toggle(group.key)}
              className={isExpanded ? 'ring-2 ring-amber-400 ring-offset-1 rounded-xl' : ''}
              collapsed={<GroupSummaryRow group={group} />}
            >
              <div className="overflow-hidden rounded-xl border border-amber-100 bg-amber-50 dark:bg-amber-900/15">
                {group.items.map((fd, i) => {
                  const elapsedPct = fd.total_tenure_days > 0
                    ? Math.min(100, (fd.elapsed_days / fd.total_tenure_days) * 100)
                    : 0
                  const isLast = i === group.items.length - 1
                  const isJoint = fd.owners && fd.owners.length > 1
                  const otherOwners = isJoint ? fd.owners.filter(o => o.member_name !== group.label).map(o => o.member_name) : []
                  return (
                    <div key={fd.instrument_id} className={`px-4 py-3 ${isLast ? '' : 'border-b border-amber-100'}`}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-base">🏦</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--text)]">{fd.instrument_name}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {fd.annual_rate}% · matures {fd.maturity_date}
                            {isJoint && otherOwners.length > 0 && ` · Joint with ${otherOwners.join(', ')}`}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-amber-800 dark:text-amber-300"><Money value={fd.maturity_value} /></p>
                          <p className="text-xs text-[var(--text-muted)]">{formatRemaining(fd.days_remaining)}</p>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-amber-100">
                        <div className="h-1.5 rounded-full bg-amber-500 transition-all" style={{ width: `${elapsedPct}%` }} />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span>now: <Money value={fd.current_value} /></span>
                        <span>{Math.round(elapsedPct)}% of tenure elapsed</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ExpandableGridCard>
          )
        })}
      </div>
    </div>
  )
}
