import { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

type Toast = {
  id: number
  type: ToastType
  message: string
}

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
})

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
}

const STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-600 text-white',
  error:   'bg-rose-600 text-white',
  info:    'bg-primary-600 text-white',
  warning: 'bg-amber-500 text-white',
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

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId
    setToasts((t) => [...t.slice(-4), { id, type, message }])
    timers.current[id] = setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  const success = useCallback((m: string) => toast(m, 'success'), [toast])
  const error   = useCallback((m: string) => toast(m, 'error'), [toast])
  const info    = useCallback((m: string) => toast(m, 'info'), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-20 right-4 z-[9999] flex flex-col gap-2 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex min-w-[240px] max-w-sm items-center gap-3 rounded-xl px-4 py-3 shadow-lg ${STYLES[t.type]}`}
            style={{ animation: 'toast-in 0.2s ease-out' }}
          >
            <span className="text-base font-bold">{ICONS[t.type]}</span>
            <span className="flex-1 text-sm font-medium">{t.message}</span>
            <button type="button" className="ml-1 opacity-70 hover:opacity-100" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
