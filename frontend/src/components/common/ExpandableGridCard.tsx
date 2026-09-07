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
      {/* A <div role="button"> rather than a real <button> — collapsed content
          (e.g. InstrumentRow) can itself contain buttons (Buy/Update Value),
          and nesting <button> inside <button> is invalid HTML. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="block w-full cursor-pointer text-left"
      >
        {collapsed}
      </div>
      {expanded && children && <div className="expand-panel mt-2">{children}</div>}
    </div>
  )
}
