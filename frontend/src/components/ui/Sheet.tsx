import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
  /** Kept for API compatibility; the sheet always scrolls when content overflows. */
  tall?: boolean
}

// Shared counter so stacked sheets/dialogs layer above one another.
let openCount = 0

/**
 * Unified popup used across add/edit forms (Accounts, Investments, Instruments,
 * Assets…). Bottom-sheet on mobile, centered modal on desktop. Portaled to
 * document.body so it always paints above page content and other overlays.
 */
export function Sheet({ title, onClose, children }: Props) {
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)
  const [layer, setLayer] = useState(50)

  useEffect(() => {
    openCount += 1
    setLayer(50 + openCount * 10)
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      openCount = Math.max(0, openCount - 1)
    }
  }, [onClose])

  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) setDragY(delta)
  }
  const onTouchEnd = () => {
    if (dragY > 110) onClose()
    else setDragY(0)
    startY.current = null
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        style={{ zIndex: layer }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 flex items-end justify-center md:items-center md:p-4"
        style={{ zIndex: layer }}
        onClick={onClose}
      >
        <div
          className="dialog-panel relative flex max-h-[90dvh] w-full max-w-lg flex-col bg-[var(--surface)] shadow-[var(--shadow-modal)] rounded-t-2xl md:rounded-2xl md:max-h-[88vh]"
          style={{
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            transition: startY.current === null ? 'transform 0.22s ease-out' : 'none',
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
            <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="tap ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="main-content-sheet flex-1 overflow-y-auto overflow-x-clip px-5 py-4 min-w-0">
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
