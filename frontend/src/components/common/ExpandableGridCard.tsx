import type { ReactNode } from 'react'

type Props = {
  expanded: boolean
  onToggle: () => void
  collapsed: ReactNode
  children?: ReactNode
  className?: string
}

export function ExpandableGridCard({ expanded, onToggle, collapsed, children, className = '' }: Props) {
  return (
    <div className={`${expanded ? 'grid-card-expanded' : ''} ${className}`}>
      <button type="button" onClick={onToggle} className="block w-full text-left">
        {collapsed}
      </button>
      {expanded && children && <div className="expand-panel mt-2">{children}</div>}
    </div>
  )
}
