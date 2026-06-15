type Color = 'blue' | 'green' | 'amber' | 'violet' | 'rose' | 'sky' | 'orange' | 'yellow' | 'slate'

type Props = {
  color?: Color
  icon?: string
  title: string
  value?: string
  subtitle?: string
  percent?: number
  children?: React.ReactNode
  onClick?: () => void
  className?: string
}

const COLOR_MAP: Record<Color, { bg: string; border: string; badge: string; bar: string }> = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/15',     border: 'border-l-blue-400',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',       bar: 'bg-blue-400' },
  green:  { bg: 'bg-green-50 dark:bg-green-900/15',   border: 'border-l-green-500',  badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',   bar: 'bg-green-500' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-900/15',   border: 'border-l-amber-400',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',   bar: 'bg-amber-400' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-900/15', border: 'border-l-violet-400', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', bar: 'bg-violet-400' },
  rose:   { bg: 'bg-rose-50 dark:bg-rose-900/15',     border: 'border-l-rose-400',   badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',       bar: 'bg-rose-400' },
  sky:    { bg: 'bg-sky-50 dark:bg-sky-900/15',       border: 'border-l-sky-400',    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',           bar: 'bg-sky-400' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/15', border: 'border-l-orange-400', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', bar: 'bg-orange-400' },
  yellow: { bg: 'bg-yellow-50 dark:bg-yellow-900/15', border: 'border-l-yellow-400', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', bar: 'bg-yellow-400' },
  slate:  { bg: 'bg-[var(--surface-2)]',             border: 'border-l-[var(--border-2)]', badge: 'bg-[var(--surface-3)] text-[var(--text-2)]', bar: 'bg-[var(--text-faint)]' },
}

export function SectionCard({ color = 'slate', icon, title, value, subtitle, percent, children, onClick, className = '' }: Props) {
  const c = COLOR_MAP[color]

  return (
    <div
      className={`section-card ${c.bg} ${c.border} ${onClick ? 'cursor-pointer active:opacity-80' : ''} ${className}`}
      onClick={onClick}
    >
      {icon && (
        <span className={`icon-badge ${c.badge}`}>{icon}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm font-medium text-[var(--text-2)]">{title}</p>
          {value && <p className="ml-2 shrink-0 text-base font-bold text-[var(--text)]">{value}</p>}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
        {percent !== undefined && (
          <div className="fill-bar mt-2">
            <div className={`fill-bar-inner ${c.bar}`} style={{ width: `${Math.min(percent, 100)}%` }} />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function hexToSectionColor(hex: string): Color {
  const map: Record<string, Color> = {
    '#3b82f6': 'blue', '#0ea5e9': 'sky', '#22c55e': 'green', '#10b981': 'green',
    '#f59e0b': 'amber', '#eab308': 'yellow', '#8b5cf6': 'violet', '#a855f7': 'violet',
    '#f43f5e': 'rose', '#ef4444': 'rose', '#f97316': 'orange', '#94a3b8': 'slate',
  }
  return map[hex.toLowerCase()] ?? 'slate'
}
