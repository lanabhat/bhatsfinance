type Props = {
  label: string
  value: string
  delta?: number | null
  deltaLabel?: string
  icon?: string
  accent?: 'primary' | 'positive' | 'negative' | 'accent'
  loading?: boolean
  onClick?: () => void
}

const ACCENT_ICON_BG: Record<string, string> = {
  primary:  'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400',
  positive: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  negative: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
  accent:   'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
}

export function KpiCard({ label, value, delta, deltaLabel, icon, accent = 'primary', loading, onClick }: Props) {
  if (loading) return <KpiCardSkeleton />

  const deltaPositive = delta !== null && delta !== undefined && delta >= 0
  const deltaText = delta !== null && delta !== undefined
    ? `${deltaPositive ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}%${deltaLabel ? ` ${deltaLabel}` : ''}`
    : null

  return (
    <div
      className={`card flex flex-col gap-3 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="label-muted">{label}</span>
        {icon && (
          <span className={`icon-badge text-lg ${ACCENT_ICON_BG[accent]}`}>{icon}</span>
        )}
      </div>
      <p className="hero-number">{value}</p>
      {deltaText && (
        <p className={`text-xs font-medium ${deltaPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
          {deltaText}
        </p>
      )}
    </div>
  )
}

export function KpiCardSkeleton() {
  return (
    <div className="card flex flex-col gap-3">
      <div className="skeleton h-3 w-24 rounded" />
      <div className="skeleton h-9 w-32 rounded" />
      <div className="skeleton h-3 w-16 rounded" />
    </div>
  )
}
