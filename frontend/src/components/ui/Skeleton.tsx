import { cn } from '../../lib/cn'

type Props = {
  variant?: 'text' | 'card' | 'table' | 'stat' | 'chart'
  rows?: number
  className?: string
}

const bar = 'animate-pulse rounded-[var(--radius-sm)] bg-surface-3'

/** Shared loading placeholder. Shapes match the real thing so nothing jumps on load. */
export function Skeleton({ variant = 'text', rows = 5, className }: Props) {
  if (variant === 'card') {
    return (
      <div className={cn('space-y-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 md:p-6', className)} aria-busy="true" aria-label="Loading">
        <div className={cn(bar, 'h-4 w-1/3')} />
        <div className={cn(bar, 'h-8 w-1/2')} />
        <div className={cn(bar, 'h-3 w-2/3')} />
      </div>
    )
  }
  if (variant === 'stat') {
    return (
      <div className={cn('h-full space-y-2 rounded-[var(--radius-lg)] border border-line bg-surface p-4', className)} aria-busy="true" aria-label="Loading">
        <div className={cn(bar, 'h-3 w-20')} />
        <div className={cn(bar, 'h-7 w-28')} />
        <div className={cn(bar, 'h-3 w-16')} />
      </div>
    )
  }
  if (variant === 'chart') {
    return <div className={cn(bar, 'h-[220px] w-full', className)} aria-busy="true" aria-label="Loading chart" />
  }
  if (variant === 'table') {
    return (
      <div className={cn('divide-y divide-line', className)} aria-busy="true" aria-label="Loading">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className={cn(bar, 'h-4 flex-1')} />
            <div className={cn(bar, 'h-4 w-20')} />
            <div className={cn(bar, 'h-4 w-24')} />
          </div>
        ))}
      </div>
    )
  }
  return <div className={cn(bar, className)} />
}

export function SkeletonCard() {
  return <Skeleton variant="card" />
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return <Skeleton variant="table" rows={rows} />
}
