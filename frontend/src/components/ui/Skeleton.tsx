import { cn } from '../../lib/cn'

type Props = {
  variant?: 'text' | 'card' | 'table'
  rows?: number
  className?: string
}

export function Skeleton({ variant = 'text', rows = 5, className }: Props) {
  if (variant === 'card') {
    return (
      <div className={cn('bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm p-4 md:p-6 space-y-3', className)}>
        <div className="animate-pulse rounded-md bg-[var(--surface-3)] h-4 w-1/3" />
        <div className="animate-pulse rounded-md bg-[var(--surface-3)] h-8 w-1/2" />
        <div className="animate-pulse rounded-md bg-[var(--surface-3)] h-3 w-2/3" />
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="animate-pulse rounded-lg bg-[var(--surface-3)] h-9 w-full" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg bg-[var(--surface-3)] h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-[var(--surface-3)]',
        className,
      )}
    />
  )
}

export function SkeletonCard() {
  return <Skeleton variant="card" />
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return <Skeleton variant="table" rows={rows} />
}
