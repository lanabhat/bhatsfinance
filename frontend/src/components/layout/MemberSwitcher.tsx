import { Check, ChevronDown, Users } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useMemberScope } from '../../context/MemberScopeContext'
import { cn } from '../../lib/cn'
import { Avatar } from '../common/Avatar'
import { Menu } from '../ui/Menu'

/** Global "whose money am I looking at" switch in the app header. Hidden for single-member households. */
export function MemberSwitcher() {
  const { members, dashboard } = useApp()
  const { memberId, setMemberId, memberName } = useMemberScope()
  if (members.length < 2) return null

  const photoOf = (id: number) => dashboard.membersNetworth.find((m) => m.member_id === id)?.photo
  const check = (on: boolean) => <Check className={cn('h-4 w-4', !on && 'invisible')} aria-hidden />

  return (
    <Menu
      title="View as"
      items={[
        { label: 'Everyone', icon: check(memberId === null), hint: 'Whole household', onSelect: () => setMemberId(null) },
        ...members.map((m) => ({ label: m.label, icon: check(memberId === m.id), onSelect: () => setMemberId(m.id) })),
      ]}
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Viewing ${memberName ?? 'everyone'} — change`}
          className={cn(
            'inline-flex h-[var(--control-h-sm)] max-w-[11rem] items-center gap-2 rounded-full border px-2 pr-3 text-sm font-medium transition-colors',
            memberId === null ? 'border-line-strong text-ink-2 hover:bg-surface-2' : 'border-accent bg-accent-subtle text-accent',
          )}
        >
          {memberId === null
            ? <Users className="h-4 w-4 shrink-0" aria-hidden />
            : <Avatar name={memberName ?? '?'} photo={photoOf(memberId)} size={22} />}
          <span className="truncate">{memberName ?? 'Everyone'}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        </button>
      )}
    />
  )
}
