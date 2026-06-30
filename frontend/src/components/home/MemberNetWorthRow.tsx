import { Money } from '../common/Money'
import type { MemberNetWorth } from '../../types/domain'


const RELATION_COLOR: Record<string, string> = {
  self: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  spouse: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  child: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  parent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  other: 'bg-[var(--surface-3)] text-[var(--text-2)]',
}

type Props = {
  member: MemberNetWorth
  householdTotal?: number
}

export function MemberNetWorthRow({ member, householdTotal }: Props) {
  const colorClass = RELATION_COLOR[member.relation_type] ?? RELATION_COLOR.other
  const initials = member.member_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const excluded = !member.include_in_networth
  const memberValue = parseFloat(member.networth)
  const sharePct = householdTotal && householdTotal > 0
    ? (memberValue / householdTotal) * 100
    : null

  return (
    <div className={`tap min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)] ${excluded ? 'opacity-50 grayscale' : ''}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm font-semibold text-[var(--text-2)]">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text)]">{member.member_name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${colorClass}`}>
              {member.relation_type}
            </span>
            {excluded && (
              <span className="inline-block rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                excluded
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-end justify-between">
        <Money value={member.networth} className="text-lg font-bold text-[var(--text)] tabular-nums" />
        {sharePct !== null && (
          <p className="text-xs text-[var(--text-faint)]">{sharePct.toFixed(1)}% of hh</p>
        )}
      </div>
    </div>
  )
}
