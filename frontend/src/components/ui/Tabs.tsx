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
}

export function Tabs<T extends string>({ tabs, active, onChange, size = 'md' }: Props<T>) {
  const base = size === 'sm'
    ? 'px-3 py-1.5 text-xs'
    : 'px-4 py-2 text-sm'

  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-[var(--surface-2)] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-all ${base} ${
            active === tab.key
              ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
              active === tab.key
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
