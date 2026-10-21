import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Non-interactive status/tag label. Semantic tones only; pair a warning/danger tone
 * with words ("Matures in 12 days", "Inactive"), never colour alone.
 * For anything clickable or selectable use <Chip>.
 */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
type LegacyColor = 'teal' | 'amber' | 'red' | 'purple' | 'blue' | 'slate' | 'green'

type Props = {
  children?: ReactNode
  /** Older API: text via `label`. */
  label?: string
  tone?: BadgeTone
  /** Older API: mapped onto tones. */
  color?: LegacyColor
  size?: 'sm' | 'md'
  icon?: ReactNode
  className?: string
  title?: string
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-2 ring-line',
  accent: 'bg-accent-subtle text-accent ring-accent/25',
  success: 'bg-success-subtle text-success ring-success/25',
  warning: 'bg-warning-subtle text-warning ring-warning/25',
  danger: 'bg-danger-subtle text-danger ring-danger/25',
  info: 'bg-info-subtle text-info ring-info/25',
}

const LEGACY: Record<LegacyColor, BadgeTone> = {
  teal: 'accent', blue: 'info', purple: 'accent', amber: 'warning', red: 'danger', green: 'success', slate: 'neutral',
}

export function Badge({ children, label, tone, color, size = 'sm', icon, className, title }: Props) {
  const t = tone ?? (color ? LEGACY[color] : 'neutral')
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium ring-1 ring-inset [&>svg]:h-3 [&>svg]:w-3',
        size === 'sm' ? 'h-5 px-2 text-xs' : 'h-6 px-2 text-sm',
        toneClasses[t],
        className,
      )}
    >
      {icon}
      {children ?? label}
    </span>
  )
}
