import { useEffect } from 'react'
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: string
}

export function Drawer({ open, onClose, title, children, width = 'w-full max-w-md' }: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`fixed bottom-0 right-0 top-0 z-50 flex flex-col bg-[var(--surface)] shadow-2xl ${width}`}
        style={{ animation: 'slide-in-right 0.22s ease-out' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          {title && <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 min-w-0">{children}</div>
      </div>
    </>
  )
}
