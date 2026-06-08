import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

export function PageShell({ children, className = '' }: Props) {
  return (
    <div className={`page-enter mx-auto max-w-6xl space-y-4 p-4 pb-24 md:pb-6 ${className}`}>
      {children}
    </div>
  )
}
