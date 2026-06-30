import type { MemberNetWorth } from '../../types/domain'

const RELATION_DOT: Record<string, string> = {
  self: 'bg-indigo-600 text-white',
  spouse: 'bg-violet-600 text-white',
  child: 'bg-sky-600 text-white',
  parent: 'bg-amber-600 text-white',
  other: 'bg-[var(--surface-3)] text-[var(--text-2)]',
}

type Props = {
  members: MemberNetWorth[]
  selected: number | null
  onSelect: (memberId: number | null) => void
}

export function MemberViewSelector({ members, selected, onSelect }: Props) {
  if (members.length < 2) return null

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Viewing</span>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
          selected === null
            ? 'border-primary-500 bg-primary-600 text-white'
            : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)]'
        }`}
      >
        Household
      </button>
      {members.map((m) => {
        const initial = m.member_name.trim().slice(0, 1).toUpperCase()
        const active = selected === m.member_id
        const dotClass = RELATION_DOT[m.relation_type] ?? RELATION_DOT.other
        return (
          <button
            key={m.member_id}
            type="button"
            onClick={() => onSelect(m.member_id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition-colors ${
              active
                ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)]'
            }`}
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${dotClass}`}>
              {initial}
            </span>
            {m.member_name}
          </button>
        )
      })}
    </div>
  )
}
