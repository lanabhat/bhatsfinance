import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: string
}

export function Drawer({ open, onClose, title, children, width = 'w-full max-w-md' }: Props) {
  // Vertical drag offset for the mobile bottom-sheet (swipe-down-to-dismiss)
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Reset drag whenever the sheet opens
  useEffect(() => { if (open) setDragY(0) }, [open])

  if (!open) return null

  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) setDragY(delta) // only allow dragging downward
  }
  const onTouchEnd = () => {
    if (dragY > 110) onClose()
    else setDragY(0)
    startY.current = null
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={
          // Mobile: bottom sheet. Desktop (md+): right drawer.
          `fixed z-50 flex flex-col bg-[var(--surface)] shadow-2xl ` +
          `inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl ` +
          `md:inset-x-auto md:bottom-0 md:right-0 md:top-0 md:max-h-none md:rounded-none ${width}`
        }
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: startY.current === null ? 'transform 0.22s ease-out' : 'none',
          animation: startY.current === null && dragY === 0 ? 'sheet-in 0.24s ease-out' : undefined,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
            className="tap ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* Body */}
        <div className="main-content-sheet flex-1 overflow-y-auto overflow-x-hidden p-5 min-w-0">{children}</div>
      </div>
    </>
  )
}
