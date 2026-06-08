import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function SectionHeader({ title, subtitle, action }: Props) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}
