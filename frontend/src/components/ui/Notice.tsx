import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

type Tone = 'info' | 'warning' | 'danger' | 'success'

const ICON: Record<Tone, ReactNode> = {
  info: <Info className="h-4 w-4 text-info" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />,
  danger: <XCircle className="h-4 w-4 text-danger" aria-hidden />,
  success: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
}

/**
 * Page-level notice ("3 accounts have no owner"). A neutral surface with a semantic icon —
 * never a yellow/red filled box.
 */
export function Notice({ tone = 'info', title, children, action, className }: {
  tone?: Tone; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex min-w-0 items-start gap-3 rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3', className)}>
      <span className="mt-0.5 shrink-0">{ICON[tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
