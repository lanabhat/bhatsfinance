import { createContext, useContext } from 'react'
import type { AmountFormat } from '../../lib/fmt'

type StatValueContextValue = {
  /** What a `format="compact"` Amount inside a StatCard value should render as. */
  format: AmountFormat
  /** An Amount calls this so the card knows it can toggle full ↔ short. */
  registerAmount: () => void
}

export const StatValueContext = createContext<StatValueContextValue | null>(null)

export function useStatValue() {
  return useContext(StatValueContext)
}
