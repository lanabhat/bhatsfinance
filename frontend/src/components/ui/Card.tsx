import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  compact?: boolean
}

export function Card({ title, subtitle, actions, children, className, compact }: Props) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-slate-100 shadow-sm',
        compact ? 'p-4' : 'p-4 md:p-6',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-900 leading-tight">{title}</h3>}
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
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
        'bg-white rounded-xl border shadow-sm p-4',
        accent ? 'border-primary-200 bg-primary-50' : 'border-slate-100',
      )}
    >
      <p className={cn('text-xs font-medium uppercase tracking-wide mb-1', accent ? 'text-primary-600' : 'text-slate-500')}>
        {label}
      </p>
      <p className={cn('text-2xl font-bold leading-none', accent ? 'text-primary-700' : 'text-slate-900')}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      {children}
    </div>
  )
}
