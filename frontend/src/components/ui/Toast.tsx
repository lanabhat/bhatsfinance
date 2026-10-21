import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

type ToastAction = { label: string; onClick: () => void }

type Toast = {
  id: number
  type: ToastType
  message: string
  action?: ToastAction
}

type ShowOptions = { type?: ToastType; action?: ToastAction; durationMs?: number }

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  /** Toast with an action button (e.g. "Undo"); returns a function that dismisses it. */
  show: (message: string, options?: ShowOptions) => () => void
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  show: () => () => {},
})

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
  error: <XCircle className="h-4 w-4 text-danger" aria-hidden />,
  info: <Info className="h-4 w-4 text-info" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />,
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const show = useCallback((message: string, { type = 'info', action, durationMs = 4000 }: ShowOptions = {}) => {
    const id = ++nextId
    setToasts((t) => [...t.slice(-4), { id, type, message, action }])
    timers.current[id] = setTimeout(() => dismiss(id), durationMs)
    return () => dismiss(id)
  }, [dismiss])

  const toast = useCallback((message: string, type: ToastType = 'info') => { show(message, { type }) }, [show])
  const success = useCallback((m: string) => toast(m, 'success'), [toast])
  const error   = useCallback((m: string) => toast(m, 'error'), [toast])
  const info    = useCallback((m: string) => toast(m, 'info'), [toast])
  // Stable across renders, so callers can list it in effect dependencies.
  const value = useMemo(() => ({ toast, success, error, info, show }), [toast, success, error, info, show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[9999] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex w-full max-w-sm items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3 text-ink shadow-[var(--shadow-modal)]"
            style={{ animation: 'toast-in 0.2s ease-out' }}
          >
            {ICONS[t.type]}
            <span className="flex-1 text-sm">{t.message}</span>
            {t.action && (
              <button type="button" className="shrink-0 text-sm font-semibold text-accent hover:underline"
                onClick={() => { t.action!.onClick(); dismiss(t.id) }}>
                {t.action.label}
              </button>
            )}
            <button type="button" className="shrink-0 text-ink-muted hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

type UndoableOptions = {
  /** e.g. "Transaction deleted". */
  message: string
  /** Hide the item now (optimistic). */
  apply: () => void
  /** Put it back (Undo pressed, or the commit failed). */
  revert: () => void
  /** The real change, run once the undo window closes. */
  commit: () => Promise<unknown>
  delayMs?: number
}

/**
 * Destructive actions with undo: the item disappears at once, a toast offers Undo for a
 * few seconds, and only then is the server call made. Pending commits are flushed if the
 * page unmounts or the tab is closed, so nothing confirmed is silently dropped.
 */
export function useUndoable() {
  const { show, error } = useToast()
  const pending = useRef(new Set<() => void>())

  useEffect(() => {
    const flushAll = () => { [...pending.current].forEach((f) => f()) }
    window.addEventListener('pagehide', flushAll)
    return () => { window.removeEventListener('pagehide', flushAll); flushAll() }
  }, [])

  return useCallback(({ message, apply, revert, commit, delayMs = 5000 }: UndoableOptions) => {
    apply()
    let settled = false
    const flush = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      pending.current.delete(flush)
      commit().catch(() => { revert(); error(`Couldn’t complete: ${message.toLowerCase()}`) })
    }
    const timer = setTimeout(flush, delayMs)
    pending.current.add(flush)
    show(message, {
      type: 'success',
      durationMs: delayMs,
      action: {
        label: 'Undo',
        onClick: () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          pending.current.delete(flush)
          revert()
        },
      },
    })
  }, [show, error])
}
