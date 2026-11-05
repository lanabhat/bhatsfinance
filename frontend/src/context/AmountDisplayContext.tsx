import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'amounts:kpi'

export type KpiFormat = 'full' | 'compact'

type AmountDisplayContextValue = {
  /** How amounts in summary cards (StatCard) are shown: ₹2,43,56,789 or ₹2.4 Cr. */
  kpiFormat: KpiFormat
  toggle: () => void
}

const AmountDisplayContext = createContext<AmountDisplayContextValue>({ kpiFormat: 'full', toggle: () => {} })

export function AmountDisplayProvider({ children }: { children: ReactNode }) {
  const [kpiFormat, setKpiFormat] = useState<KpiFormat>(() => {
    try { return window.localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'full' } catch { return 'full' }
  })

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, kpiFormat) } catch { /* ignore */ }
  }, [kpiFormat])

  return (
    <AmountDisplayContext.Provider value={{ kpiFormat, toggle: () => setKpiFormat((f) => (f === 'full' ? 'compact' : 'full')) }}>
      {children}
    </AmountDisplayContext.Provider>
  )
}

export function useAmountDisplay() {
  return useContext(AmountDisplayContext)
}
