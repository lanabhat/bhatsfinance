import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { SectionHeader } from './SectionHeader'

type Props = {
  title?: string
  subtitle?: ReactNode
  /** Right side of the card header — a SectionLink or a small control. */
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** No body padding: for a DataTable or a list that runs edge to edge. */
  flush?: boolean
  /** Kept for older callers; padding is fixed (16 mobile / 24 desktop). */
  compact?: boolean
  /** Ignored — tinted/glass surfaces were retired; status is shown with a Badge. */
  glass?: boolean
  as?: 'section' | 'div'
}

/**
 * The one surface. Fixed padding (16px mobile / 24px desktop), radius, border; never a
 * tinted background — show state with a <Badge> or icon inside the card instead.
 */
export function Card({ title, subtitle, actions, children, className, flush, as: Tag = 'section' }: Props) {
  const header = (title || actions) && (
    <div className={cn(flush ? 'px-4 pt-4 md:px-6 md:pt-6' : '', 'mb-4')}>
      <SectionHeader title={title ?? ''} subtitle={subtitle} action={actions} />
    </div>
  )
  return (
    <Tag
      className={cn(
        'min-w-0 rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-card)]',
        flush ? 'overflow-hidden' : 'p-4 md:p-6',
        className,
      )}
    >
      {header}
      {children}
    </Tag>
  )
}

export { StatCard } from './StatCard'
