import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  compact?: boolean
  /** Use the layered glass surface (for focal cards). Defaults to solid. */
  glass?: boolean
}

export function Card({ title, subtitle, actions, children, className, compact, glass }: Props) {
  return (
    <div
      className={cn(
        glass ? 'glass' : 'bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-[var(--shadow-card)]',
        compact ? 'p-4' : 'p-4 md:p-6',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h3 className="text-base font-semibold text-[var(--text)] leading-tight">{title}</h3>}
            {subtitle && <p className="text-sm text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

type StatCardProps = {
  label: string
  value: string
  subtitle?: string
  accent?: boolean
  children?: ReactNode
}

export function StatCard({ label, value, subtitle, accent, children }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border shadow-[var(--shadow-card)] p-4',
        accent
          ? 'border-primary-200 bg-primary-50 dark:border-primary-800/40 dark:bg-primary-900/20'
          : 'border-[var(--border)] bg-[var(--surface)]',
      )}
    >
      <p className={cn('text-xs font-medium uppercase tracking-wide mb-1', accent ? 'text-primary-600 dark:text-primary-400' : 'text-[var(--text-muted)]')}>
        {label}
      </p>
      <p className={cn('text-2xl font-bold leading-none', accent ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--text)]')}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-[var(--text-faint)] mt-1">{subtitle}</p>}
      {children}
    </div>
  )
}
