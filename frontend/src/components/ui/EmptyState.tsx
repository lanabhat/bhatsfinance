import type { ReactNode } from 'react'
import { AlertCircle, Inbox, RotateCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

type Props = {
  /** A lucide icon element; defaults to an inbox. */
  icon?: ReactNode
  title: string
  description?: ReactNode
  /** Usually one Button (secondary, or the page's primary action). */
  action?: ReactNode
  /** compact: inside a card or table body; page: a whole empty page. */
  size?: 'compact' | 'page'
  className?: string
}

/** Shared empty state for every card, table and page. */
export function EmptyState({ icon = <Inbox />, title, description, action, size = 'compact', className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 text-center', size === 'page' ? 'py-16' : 'py-8', className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-muted [&>svg]:h-5 [&>svg]:w-5" aria-hidden>{icon}</span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Shared error state: what failed, and a retry when there is one. */
export function ErrorState({ title = 'Couldn’t load this', message, onRetry, className }: {
  title?: string; message?: ReactNode; onRetry?: () => void; className?: string
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 px-4 py-8 text-center', className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-subtle text-danger" aria-hidden><AlertCircle className="h-5 w-5" /></span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {message && <p className="max-w-sm text-sm text-ink-muted">{message}</p>}
      {onRetry && <Button variant="secondary" size="sm" icon={<RotateCw />} onClick={onRetry} className="mt-2">Try again</Button>}
    </div>
  )
}
