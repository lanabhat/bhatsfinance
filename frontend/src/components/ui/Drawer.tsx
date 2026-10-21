import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Max width of the centered dialog on desktop. */
  width?: string
}

// Module-level counter so stacked dialogs each get a higher z-index than the
// one below — a popup opened from within a popup layers on top, not behind.
let openCount = 0

export function Drawer({ open, onClose, title, children, width = 'w-full max-w-md' }: Props) {
  // Vertical drag offset for the mobile bottom-sheet (swipe-down-to-dismiss)
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  // z-index layer: above every sheet already open when this one opens.
  const layer = useMemo(() => (open ? 50 + (openCount + 1) * 10 : 50), [open])
  // Inline onClose from callers would otherwise re-run the effect below on every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return
    openCount += 1
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      openCount = Math.max(0, openCount - 1)
    }
  }, [open])

  if (!open) return null

  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; setDragging(true) }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) setDragY(delta) // only allow dragging downward
  }
  const onTouchEnd = () => {
    if (dragY > 110) onClose()
    setDragY(0)  // also resets after a swipe-to-close, so it reopens in place
    startY.current = null
    setDragging(false)
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        style={{ zIndex: layer }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Centering wrapper: bottom-aligned on mobile, centered on desktop */}
      <div
        className="fixed inset-0 flex items-end justify-center md:items-center md:p-4"
        style={{ zIndex: layer }}
      >
        <div
          className={
            `dialog-panel relative flex max-h-[90dvh] w-full flex-col bg-[var(--surface)] shadow-[var(--shadow-modal)] ` +
            `rounded-t-[var(--radius-xl)] md:rounded-[var(--radius-xl)] md:max-h-[88vh] ${width}`
          }
          style={{
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            transition: dragging ? 'none' : 'transform 0.22s ease-out',
          }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mobile drag handle */}
          <div
            className="flex shrink-0 justify-center pt-2.5 pb-1 md:hidden"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <span className="h-1.5 w-10 rounded-full bg-[var(--surface-3)]" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3 md:py-4">
            {title && <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>}
            <button
              type="button"
              onClick={onClose}
              className="tap ml-auto flex h-[var(--control-h)] w-[var(--control-h)] items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label="Close"
            ><X className="h-4 w-4" aria-hidden /></button>
          </div>
          {/* Body */}
          <div className="main-content-sheet flex-1 overflow-y-auto overflow-x-clip p-5 min-w-0">{children}</div>
        </div>
      </div>
    </>,
    document.body,
  )
}
