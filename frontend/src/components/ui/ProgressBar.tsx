type Props = {
  value: number
  max?: number
  label?: string
  sublabel?: string
  showPercent?: boolean
  color?: 'primary' | 'positive' | 'negative' | 'accent' | 'auto'
}

const COLOR_CLASS: Record<string, string> = {
  primary:  'bg-primary-500',
  positive: 'bg-emerald-500',
  negative: 'bg-rose-500',
  accent:   'bg-amber-500',
}

function autoColor(pct: number) {
  if (pct >= 70) return 'bg-rose-500'
  if (pct >= 40) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function ProgressBar({ value, max = 100, label, sublabel, showPercent = true, color = 'primary' }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const barColor = color === 'auto' ? autoColor(pct) : COLOR_CLASS[color]

  return (
    <div className="space-y-1">
      {(label || showPercent) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>}
          {sublabel && <span className="text-xs text-[var(--text-muted)]">{sublabel}</span>}
          {showPercent && !sublabel && (
            <span className="text-xs font-medium text-[var(--text-muted)]">{pct.toFixed(0)}%</span>
          )}
        </div>
      )}
      <div className="fill-bar">
        <div className={`fill-bar-inner ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
