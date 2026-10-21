import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { RowMenu } from './Menu'
import type { RowAction } from './rowActions'

type Props = {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Right side, top: the figure (an <Amount>). */
  value?: ReactNode
  /** Right side, under the value: a <Delta> or short muted text. */
  meta?: ReactNode
  /** Badges after the title. */
  badges?: ReactNode
  actions?: RowAction[]
  onOpen?: () => void
  muted?: boolean
}

/**
 * Card-view item for any list (holdings, accounts…): the same anatomy as a DataTable row
 * in phone mode — icon, title + subtitle on the left, value + meta on the right, row menu.
 */
export function EntityCard({ icon, title, subtitle, value, meta, badges, actions = [], onOpen, muted }: Props) {
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => { if (onOpen && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }}
      className={cn(
        'group flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-colors',
        onOpen && 'cursor-pointer hover:border-line-strong',
        muted && 'opacity-60',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{title}</span>
          {badges}
        </span>
        {subtitle && <span className="block truncate text-xs text-ink-muted">{subtitle}</span>}
      </span>
      {(value || meta) && (
        <span className="shrink-0 text-right">
          {value && <span className="block text-sm font-semibold text-ink tabular-nums">{value}</span>}
          {meta && <span className="block text-xs text-ink-muted">{meta}</span>}
        </span>
      )}
      {actions.length > 0 && <RowMenu actions={actions} />}
    </div>
  )
}
