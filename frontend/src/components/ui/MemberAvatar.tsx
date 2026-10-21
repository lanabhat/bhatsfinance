import { cn } from '../../lib/cn'
import { Avatar } from '../common/Avatar'

type Props = {
  name: string
  photo?: string | null
  /** sm: 20px (table cells) · md: 28px · lg: 36px (member cards) */
  size?: 'sm' | 'md' | 'lg'
  /** Avatar only (the name becomes its tooltip). */
  hideName?: boolean
  /** Muted second line, e.g. relation or "Joint". */
  caption?: string
  className?: string
}

const PX = { sm: 20, md: 28, lg: 36 }

/** Avatar + name for an owner/member. Several owners: pass "A, B" — shows the first + "+1". */
export function MemberAvatar({ name, photo, size = 'sm', hideName, caption, className }: Props) {
  const names = name.split(',').map((n) => n.trim()).filter(Boolean)
  const first = names[0] ?? 'Unassigned'
  const extra = names.length - 1
  const unassigned = first === 'Unassigned'
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)} title={hideName ? name : undefined}>
      {unassigned
        ? <span style={{ width: PX[size], height: PX[size] }} className="shrink-0 rounded-full border border-dashed border-line-strong" aria-hidden />
        : <Avatar name={first} photo={photo ?? undefined} size={PX[size]} />}
      {!hideName && (
        <span className="min-w-0">
          <span className={cn('block truncate', size === 'lg' ? 'text-sm font-medium text-ink' : 'text-sm text-ink-2', unassigned && 'text-ink-muted')}>
            {first}{extra > 0 && <span className="text-ink-muted"> +{extra}</span>}
          </span>
          {caption && <span className="block truncate text-xs text-ink-muted">{caption}</span>}
        </span>
      )}
    </span>
  )
}
