import { cn } from '../../lib/cn'

type Color = 'teal' | 'amber' | 'red' | 'purple' | 'blue' | 'slate' | 'green'

type Props = {
  label: string
  color?: Color
  className?: string
}

const colorMap: Record<Color, string> = {
  teal: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-900/30 dark:text-indigo-300',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-300',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/30 dark:text-rose-300',
  purple: 'bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-900/30 dark:text-purple-300',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-300',
  slate: 'bg-[var(--surface-2)] text-[var(--text-2)] ring-[var(--border)]',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-300',
}

export function Badge({ label, color = 'slate', className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        colorMap[color],
        className,
      )}
    >
      {label}
    </span>
  )
}
