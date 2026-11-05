import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAmountDisplay } from '../../context/AmountDisplayContext'
import { cn } from '../../lib/cn'
import { ClickHint } from './ClickHint'
import { Skeleton } from './Skeleton'
import { StatValueContext } from './statValueContext'

type Props = {
  label: string
  /**
   * Usually an <Amount format="compact">, a count, or a short text. Inside a StatCard,
   * "compact" amounts follow the user's KPI setting (full by default, click a card to switch).
   */
  value: ReactNode
  /** A <Delta>, or a muted line ("XIRR 12.4%"). */
  delta?: ReactNode
  /** Older API: muted line under the value. */
  subtitle?: ReactNode
  loading?: boolean
  /** Makes the card a button; a small pointer icon in the corner shows it can be clicked. */
  onClick?: () => void
  /** Where a click goes, for the tooltip and screen readers (e.g. "Open Investments"). */
  actionLabel?: string
  /** Kept for older callers; ignored (no tinted cards). */
  accent?: boolean
  children?: ReactNode
}

/** One summary figure: label above, value, optional delta. Same size on every page. */
export function StatCard({ label, value, delta, subtitle, loading, onClick, actionLabel, children }: Props) {
  const { kpiFormat, toggle } = useAmountDisplay()
  const [hasAmount, setHasAmount] = useState(false)
  // Width at which the full figure didn't fit; the card shows the short form until it is wider again.
  const [overflowWidth, setOverflowWidth] = useState<number | null>(null)
  const valueRef = useRef<HTMLSpanElement>(null)

  const showFull = kpiFormat === 'full' && overflowWidth === null
  const registerAmount = useCallback(() => setHasAmount(true), [])
  const ctx = useMemo(() => ({ format: showFull ? 'full' as const : 'compact' as const, registerAmount }), [showFull, registerAmount])

  const checkFit = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    checkFit.current = () => {
      const el = valueRef.current
      if (!el || !hasAmount || kpiFormat !== 'full') return
      if (showFull && el.scrollWidth > el.clientWidth) setOverflowWidth(el.clientWidth)
      else if (!showFull && overflowWidth !== null && el.clientWidth > overflowWidth) setOverflowWidth(null)
    }
    checkFit.current()
  })
  useLayoutEffect(() => {
    const el = valueRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => checkFit.current())
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading])

  if (loading) return <Skeleton variant="stat" />
  const toggles = !onClick && hasAmount
  const handleClick = onClick ?? (toggles ? toggle : undefined)
  const Tag = handleClick ? 'button' : 'div'
  const toggleLabel = kpiFormat === 'full' ? 'Show short amounts' : 'Show full amounts'
  return (
    <Tag
      type={handleClick ? 'button' : undefined}
      onClick={handleClick}
      title={onClick ? (actionLabel ?? `Open ${label}`) : toggles ? toggleLabel : undefined}
      className={cn(
        'relative flex h-full min-w-0 flex-col gap-1 rounded-[var(--radius-lg)] border border-line bg-surface p-4 text-left shadow-[var(--shadow-card)]',
        handleClick && 'group/click cursor-pointer transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      )}
    >
      {onClick && <ClickHint />}
      <span className={cn('truncate text-sm text-ink-muted', onClick && 'pr-6')}>{label}</span>
      {onClick && <span className="sr-only">{actionLabel ?? `Open ${label}`}</span>}
      {toggles && <span className="sr-only">{toggleLabel}</span>}
      <StatValueContext.Provider value={ctx}>
        <span ref={valueRef} className="truncate text-xl font-semibold leading-tight tracking-tight text-ink tabular-nums md:text-2xl">{value}</span>
      </StatValueContext.Provider>
      {(delta ?? subtitle) && <span className="min-w-0 truncate text-sm text-ink-muted">{delta ?? subtitle}</span>}
      {children}
    </Tag>
  )
}

/** The summary strip under the PageHeader: 2–4 StatCards, equal heights, 2 columns on phones. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid auto-rows-fr grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4', className)}>
      {children}
    </div>
  )
}
