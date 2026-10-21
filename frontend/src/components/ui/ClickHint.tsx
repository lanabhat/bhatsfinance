import { MousePointerClick } from 'lucide-react'

/**
 * Small pointer icon in the top-right corner of a clickable card (StatCard, member cards…).
 * The card needs `relative` and `group/click`; the icon turns accent on hover.
 */
export function ClickHint() {
  return (
    <MousePointerClick aria-hidden
      className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ink-faint transition-colors group-hover/click:text-accent group-focus-visible/click:text-accent" />
  )
}
