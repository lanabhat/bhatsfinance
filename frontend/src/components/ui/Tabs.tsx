import { cn } from '../../lib/cn'

type Tab<T extends string> = {
  key: T
  label: string
  count?: number
}

type Props<T extends string> = {
  tabs: Tab<T>[]
  active: T
  onChange: (key: T) => void
  size?: 'sm' | 'md'
  /** Accessible name for the group. */
  label?: string
  className?: string
}

/** Segmented control — view tabs (By type / By member) and chart range tabs (1M … All). */
export function Tabs<T extends string>({ tabs, active, onChange, size = 'md', label, className }: Props<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-[var(--radius-md)] bg-surface-2 p-1', className)}>
      {tabs.map((tab) => {
        const on = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-sm)] font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2 text-xs' : 'h-[calc(var(--control-h)-8px)] px-3 text-sm',
              on ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className={cn('tabular-nums', on ? 'text-accent' : 'text-ink-faint')}>{tab.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export const SegmentedControl = Tabs
