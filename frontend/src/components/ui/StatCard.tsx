import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { ClickHint } from './ClickHint'
import { Skeleton } from './Skeleton'

type Props = {
  label: string
  /** Usually an <Amount format="compact">, a count, or a short text. */
  value: ReactNode
  /** A <Delta>, or a muted line ("XIRR 12.4%"). */
  delta?: ReactNode
  /** Older API: muted line under the value. */
  subtitle?: ReactNode
  loading?: boolean
  /** Makes the card a button; a small pointer icon in the corner shows it can be clicked. */
  onClick?: () => void
  /** Where a click goes, for the tooltip and screen readers (e.g. "Open Investments"). */
  actionLabel?: string
  /** Kept for older callers; ignored (no tinted cards). */
  accent?: boolean
  children?: ReactNode
}

/** One summary figure: label above, value, optional delta. Same size on every page. */
export function StatCard({ label, value, delta, subtitle, loading, onClick, actionLabel, children }: Props) {
  if (loading) return <Skeleton variant="stat" />
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={onClick ? (actionLabel ?? `Open ${label}`) : undefined}
      className={cn(
        'relative flex h-full min-w-0 flex-col gap-1 rounded-[var(--radius-lg)] border border-line bg-surface p-4 text-left shadow-[var(--shadow-card)]',
        onClick && 'group/click cursor-pointer transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      )}
    >
      {onClick && <ClickHint />}
      <span className={cn('truncate text-sm text-ink-muted', onClick && 'pr-6')}>{label}</span>
      {onClick && <span className="sr-only">{actionLabel ?? `Open ${label}`}</span>}
      <span className="truncate text-xl font-semibold leading-tight tracking-tight text-ink tabular-nums md:text-2xl">{value}</span>
      {(delta ?? subtitle) && <span className="min-w-0 truncate text-sm text-ink-muted">{delta ?? subtitle}</span>}
      {children}
    </Tag>
  )
}

/** The summary strip under the PageHeader: 2–4 StatCards, equal heights, 2 columns on phones. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid auto-rows-fr grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4', className)}>
      {children}
    </div>
  )
}
