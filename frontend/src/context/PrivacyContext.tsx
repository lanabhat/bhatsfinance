import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'privacy:on'

type PrivacyContextValue = {
  hidden: boolean
  toggle: () => void
  setHidden: (v: boolean) => void
}

const PrivacyContext = createContext<PrivacyContextValue>(null!)

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState<boolean>(() => {
    try { return window.localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0') } catch { /* ignore */ }
  }, [hidden])

  return (
    <PrivacyContext.Provider value={{ hidden, toggle: () => setHidden((v) => !v), setHidden }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  return useContext(PrivacyContext)
}
