import type { ReactNode } from 'react'

type Props = {
  /** Sentence case ("Net worth trend"), never ALL CAPS. */
  title: string
  subtitle?: ReactNode
  /** Right side: a "View all →" link (<SectionLink>) or a small control. */
  action?: ReactNode
  /** Heading level; sections inside a page are h2. */
  as?: 'h2' | 'h3'
}

export function SectionHeader({ title, subtitle, action, as: H = 'h2' }: Props) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <H className="text-base font-semibold leading-tight text-ink">{title}</H>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex min-w-0 max-w-full items-center gap-2">{action}</div>}
    </div>
  )
}

/** The standard right-side "View all →" text link. */
export function SectionLink({ href, onClick, children = 'View all' }: { href?: string; onClick?: () => void; children?: ReactNode }) {
  const cls = 'inline-flex h-8 items-center gap-1 whitespace-nowrap text-sm font-medium text-accent hover:underline underline-offset-4'
  if (href) return <a href={href} className={cls}>{children} <span aria-hidden>→</span></a>
  return <button type="button" onClick={onClick} className={cls}>{children} <span aria-hidden>→</span></button>
}
