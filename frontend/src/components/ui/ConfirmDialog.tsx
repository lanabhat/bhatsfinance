import { useEffect } from 'react'

type Props = {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title = 'Confirm', message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, onConfirm, onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-6 shadow-[var(--shadow-modal)]">
          <h3 id="confirm-title" className="mb-2 text-base font-semibold text-[var(--text)]">{title}</h3>
          <p className="mb-6 text-sm text-[var(--text-muted)]">{message}</p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="secondary-btn"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 ${
                danger ? 'bg-rose-600' : 'bg-primary-600'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
