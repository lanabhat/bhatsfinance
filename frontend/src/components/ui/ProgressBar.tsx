import { cn } from '../../lib/cn'

type Props = {
  value: number
  max?: number
  label?: string
  sublabel?: string
  showPercent?: boolean
  color?: 'primary' | 'positive' | 'negative' | 'accent' | 'auto'
}

const COLOR_CLASS: Record<string, string> = {
  primary: 'bg-accent',
  positive: 'bg-success',
  negative: 'bg-danger',
  accent: 'bg-warning',
}

function autoColor(pct: number) {
  if (pct >= 70) return 'bg-danger'
  if (pct >= 40) return 'bg-warning'
  return 'bg-success'
}

/** Thin share/usage bar. Pair it with the number in text; the bar is never the only signal. */
export function ProgressBar({ value, max = 100, label, sublabel, showPercent = true, color = 'primary' }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const barColor = color === 'auto' ? autoColor(pct) : COLOR_CLASS[color]
  return (
    <div className="space-y-1">
      {(label || showPercent) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-sm font-medium text-ink-2">{label}</span>}
          {sublabel && <span className="text-xs text-ink-muted">{sublabel}</span>}
          {showPercent && !sublabel && <span className="text-xs font-medium tabular-nums text-ink-muted">{pct.toFixed(0)}%</span>}
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="presentation">
        <div className={cn('h-full rounded-full transition-[width] duration-500', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
