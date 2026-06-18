import { useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Props = {
  onRefresh: () => Promise<unknown> | void
  children: ReactNode
}

const TRIGGER = 70   // px pull distance to trigger a refresh
const MAX = 110      // px max visual pull

/**
 * Mobile pull-to-refresh. Activates only when the page is scrolled to the very
 * top and the user drags downward. No-op with mouse (touch events only).
 */
export function PullToRefresh({ onRefresh, children }: Props) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    // Only arm when at the very top of the page
    if (window.scrollY <= 0 && !refreshing) startY.current = e.touches[0].clientY
    else startY.current = null
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0) { setPull(0); return }
    // Dampen the drag for a rubber-band feel
    setPull(Math.min(MAX, delta * 0.5))
  }

  const onTouchEnd = async () => {
    if (startY.current === null) return
    startY.current = null
    if (pull >= TRIGGER) {
      setRefreshing(true)
      setPull(TRIGGER)
      try { await onRefresh() } finally {
        setRefreshing(false)
        setPull(0)
      }
    } else {
      setPull(0)
    }
  }

  const showSpinner = refreshing || pull > 0

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ touchAction: pull > 0 ? 'none' : 'pan-y', minWidth: 0 }}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden text-[var(--text-muted)]"
        style={{
          height: showSpinner ? `${pull}px` : 0,
          transition: startY.current === null ? 'height 0.2s ease-out' : 'none',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`}
          style={{ transform: refreshing ? undefined : `rotate(${pull * 2.5}deg)`, opacity: Math.min(1, pull / TRIGGER) }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M19.5 9.348a8.25 8.25 0 10-1.91 5.106" />
        </svg>
      </div>
      {children}
    </div>
  )
}
