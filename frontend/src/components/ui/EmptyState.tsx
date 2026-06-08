import type { ReactNode } from 'react'

type Props = {
  icon?: ReactNode | string
  title: string
  description?: string
  action?: ReactNode
}

const defaultIcon = '📭'

export function EmptyState({ icon = defaultIcon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <span className="text-4xl" aria-hidden="true">
        {typeof icon === 'string' ? icon : <span className="text-[var(--text-faint)]">{icon}</span>}
      </span>
      <p className="text-base font-semibold text-[var(--text-2)]">{title}</p>
      {description && <p className="max-w-xs text-sm text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
