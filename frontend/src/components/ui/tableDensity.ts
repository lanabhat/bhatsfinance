import { useSyncExternalStore } from 'react'

export type Density = 'comfortable' | 'compact'

const KEY = 'table:density'
const listeners = new Set<() => void>()

function read(): Density {
  try { return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'comfortable' } catch { return 'comfortable' }
}

let current: Density = read()

export function setDensity(d: Density) {
  current = d
  try { localStorage.setItem(KEY, d) } catch { /* not persisted */ }
  listeners.forEach((l) => l())
}

/** Row height preference, shared by every DataTable and remembered across visits. */
export function useDensity(): Density {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => current,
    () => 'comfortable',
  )
}
