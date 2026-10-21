import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

type Props = {
  children: ReactNode
  /** Filled when selected, neutral outline otherwise. */
  selected?: boolean
  onClick?: () => void
  /** Shows an × that calls this (active-filter chips). */
  onRemove?: () => void
  count?: number
  icon?: ReactNode
  size?: 'sm' | 'md'
  className?: string
  title?: string
}

/** Interactive pill: filter toggles, active-filter tokens, quick choices. For status use <Badge>. */
export const Chip = forwardRef<HTMLButtonElement, Props>(function Chip({ children, selected, onClick, onRemove, count, icon, size = 'md', className, title }, ref) {
  const base = cn(
    'inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border text-sm font-medium transition-colors [&_svg]:h-4 [&_svg]:w-4',
    size === 'md' ? 'h-[var(--control-h-sm)] px-3' : 'h-7 px-2',
    selected
      ? 'border-accent bg-accent-subtle text-accent'
      : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
    className,
  )
  const body = (
    <>
      {icon}
      <span className="truncate">{children}</span>
      {count !== undefined && <span className={cn('tabular-nums', selected ? 'text-accent' : 'text-ink-muted')}>{count}</span>}
    </>
  )
  if (onRemove) {
    return (
      <span className={base} title={title}>
        {body}
        <button type="button" onClick={onRemove} aria-label={`Remove ${typeof children === 'string' ? children : 'filter'}`}
          className="-mr-1 ml-1 flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-3 [&_svg]:h-3.5 [&_svg]:w-3.5">
          <X aria-hidden />
        </button>
      </span>
    )
  }
  return (
    <button ref={ref} type="button" onClick={onClick} aria-pressed={selected} className={base} title={title}>
      {body}
    </button>
  )
})
