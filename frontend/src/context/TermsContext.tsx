import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { TERMS } from '../lib/terms'
import type { Mode, TermKey } from '../lib/terms'

type TermsContextValue = {
  mode: Mode
  setMode: (m: Mode) => void
  t: (key: TermKey) => string
  isSimple: boolean
}

const TermsContext = createContext<TermsContextValue>({
  mode: 'advanced',
  setMode: () => {},
  t: (key) => key,
  isSimple: false,
})

export function TermsProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    const stored = localStorage.getItem('ui:mode')
    return stored === 'simple' || stored === 'advanced' ? stored : 'advanced'
  })

  const setMode = (m: Mode) => {
    setModeState(m)
    localStorage.setItem('ui:mode', m)
  }

  const t = (key: TermKey): string => TERMS[mode][key] ?? key

  return (
    <TermsContext.Provider value={{ mode, setMode, t, isSimple: mode === 'simple' }}>
      {children}
    </TermsContext.Provider>
  )
}

export function useTerms() {
  return useContext(TermsContext)
}

export function hasModePreference(): boolean {
  return localStorage.getItem('ui:mode') !== null
}
