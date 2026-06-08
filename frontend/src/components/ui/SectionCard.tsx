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
  blue:   { bg: 'bg-blue-50',   border: 'border-l-blue-400',   badge: 'bg-blue-100 text-blue-700',   bar: 'bg-blue-400' },
  green:  { bg: 'bg-green-50',  border: 'border-l-green-500',  badge: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
  amber:  { bg: 'bg-amber-50',  border: 'border-l-amber-400',  badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' },
  violet: { bg: 'bg-violet-50', border: 'border-l-violet-400', badge: 'bg-violet-100 text-violet-700', bar: 'bg-violet-400' },
  rose:   { bg: 'bg-rose-50',   border: 'border-l-rose-400',   badge: 'bg-rose-100 text-rose-700',   bar: 'bg-rose-400' },
  sky:    { bg: 'bg-sky-50',    border: 'border-l-sky-400',    badge: 'bg-sky-100 text-sky-700',     bar: 'bg-sky-400' },
  orange: { bg: 'bg-orange-50', border: 'border-l-orange-400', badge: 'bg-orange-100 text-orange-700', bar: 'bg-orange-400' },
  yellow: { bg: 'bg-yellow-50', border: 'border-l-yellow-400', badge: 'bg-yellow-100 text-yellow-700', bar: 'bg-yellow-400' },
  slate:  { bg: 'bg-slate-50',  border: 'border-l-slate-300',  badge: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
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
          <p className="truncate text-sm font-medium text-slate-700">{title}</p>
          {value && <p className="ml-2 shrink-0 text-base font-bold text-slate-900">{value}</p>}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
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
