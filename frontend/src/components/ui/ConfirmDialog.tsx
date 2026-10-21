import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

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

  // Portaled above everything, including a Sheet it may be opened from.
  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="w-full max-w-sm rounded-[var(--radius-xl)] bg-surface p-6 shadow-[var(--shadow-modal)] max-h-[90dvh] overflow-y-auto">
          <h3 id="confirm-title" className="mb-2 text-base font-semibold text-ink">{title}</h3>
          <p className="mb-6 text-sm text-ink-muted">{message}</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
            <Button variant={danger ? 'destructive' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
