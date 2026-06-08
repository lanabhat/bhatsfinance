import { useState } from 'react'
import type { ReactNode } from 'react'

type Props = {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom'
}

export function Tooltip({ content, children, position = 'top' }: Props) {
  const [visible, setVisible] = useState(false)

  const posClass = position === 'top'
    ? 'bottom-full left-1/2 mb-2 -translate-x-1/2'
    : 'top-full left-1/2 mt-2 -translate-x-1/2'

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white shadow-lg dark:bg-zinc-700 ${posClass}`}
        >
          {content}
        </span>
      )}
    </span>
  )
}
