import { useCallback, useState } from 'react'

/** field key -> selected values. Values within a field are OR'd; fields are AND'd. */
export type FilterState = Record<string, string[]>

export type FilterOption = { value: string; label: string; count?: number }

/** What a FilterBar renders: a field and the values it can be set to. */
export type FilterField = { key: string; label: string; options: FilterOption[] }

/** How to read a filterable value off a row. Return several values for e.g. joint owners. */
export type FilterAccessor<T> = {
  key: string
  label: string
  get: (row: T) => string | string[] | null | undefined
  /** Display label for a raw value (defaults to the value itself). */
  labelOf?: (value: string) => string
}

const NONE = '(none)'

function valuesOf<T>(row: T, accessor: FilterAccessor<T>): string[] {
  const v = accessor.get(row)
  if (Array.isArray(v)) return v.length > 0 ? v : [NONE]
  return v === null || v === undefined || v === '' ? [NONE] : [v]
}

function rowMatches<T>(row: T, state: FilterState, accessors: FilterAccessor<T>[], skipKey?: string): boolean {
  for (const a of accessors) {
    if (a.key === skipKey) continue
    const wanted = state[a.key]
    if (!wanted || wanted.length === 0) continue
    if (!valuesOf(row, a).some((v) => wanted.includes(v))) return false
  }
  return true
}

export function applyFilters<T>(rows: T[], state: FilterState, accessors: FilterAccessor<T>[]): T[] {
  if (!Object.values(state).some((v) => v.length > 0)) return rows
  return rows.filter((r) => rowMatches(r, state, accessors))
}

/** Options per field, from values that actually occur. Each count reflects the *other*
 *  active filters, so the picker shows how many rows each choice would leave. */
export function filterFieldsFrom<T>(rows: T[], state: FilterState, accessors: FilterAccessor<T>[]): FilterField[] {
  return accessors.map((a) => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      if (!rowMatches(row, state, accessors, a.key)) continue
      for (const v of valuesOf(row, a)) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    // Keep already-selected values visible even if nothing currently matches them.
    for (const v of state[a.key] ?? []) if (!counts.has(v)) counts.set(v, 0)
    const options = [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: value === NONE ? 'None' : (a.labelOf?.(value) ?? value) }))
      .sort((x, y) => (x.value === NONE ? 1 : y.value === NONE ? -1 : x.label.localeCompare(y.label)))
    return { key: a.key, label: a.label, options }
  })
}

/** Filter state remembered per page. Storage can be unavailable (private mode), so it degrades to memory. */
export function useFilterState(storageKey: string): [FilterState, (next: FilterState) => void] {
  const fullKey = `filters:${storageKey}`
  const [state, setState] = useState<FilterState>(() => {
    try {
      const raw = localStorage.getItem(fullKey)
      const parsed = raw ? JSON.parse(raw) : {}
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch { return {} }
  })
  const update = useCallback((next: FilterState) => {
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => v.length > 0))
    setState(cleaned)
    try { localStorage.setItem(fullKey, JSON.stringify(cleaned)) } catch { /* not persisted */ }
  }, [fullKey])
  return [state, update]
}
