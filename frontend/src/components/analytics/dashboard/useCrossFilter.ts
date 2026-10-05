import { useCallback, useEffect, useMemo, useState } from 'react'
import { DIMS } from './facts'
import type { Dim, Fact, Filters } from './facts'

function readHash(): Filters {
  const query = window.location.hash.split('?')[1] ?? ''
  const params = new URLSearchParams(query)
  const filters: Filters = {}
  for (const dim of DIMS) {
    const values = params.getAll(dim)
    if (values.length > 0) filters[dim] = values
  }
  return filters
}

function writeHash(filters: Filters) {
  const params = new URLSearchParams()
  for (const dim of DIMS) for (const v of filters[dim] ?? []) params.append(dim, v)
  const path = window.location.hash.split('?')[0] || '#/analytics'
  const query = params.toString()
  // replaceState: bookmarkable view without a history entry (or hashchange) per click
  window.history.replaceState(null, '', query ? `${path}?${query}` : path)
}

const matches = (row: Fact, filters: Filters, skip?: Dim) =>
  DIMS.every((dim) => dim === skip || !filters[dim]?.length || filters[dim]!.includes(row[dim]))

/**
 * Cross-filter state over the facts rows: one multi-select per dimension.
 * `rowsFor(dim)` is what a chart of `dim` draws — rows filtered by every *other*
 * dimension, so its own unselected items stay visible (dimmed) and can be added.
 * `filtered` applies every selection, for the KPIs and the table.
 */
export function useCrossFilter(rows: Fact[]) {
  const [filters, setFilters] = useState<Filters>(() => readHash())

  useEffect(() => { writeHash(filters) }, [filters])

  // Members left out of household net worth only appear when explicitly selected.
  const visible = useMemo(() => {
    const chosen = new Set(filters.member ?? [])
    return rows.filter((r) => r.included || chosen.has(r.member))
  }, [rows, filters.member])

  const filtered = useMemo(() => visible.filter((r) => matches(r, filters)), [visible, filters])

  const rowsFor = useCallback((dim: Dim) => visible.filter((r) => matches(r, filters, dim)), [visible, filters])

  const toggle = useCallback((dim: Dim, value: string) => {
    setFilters((prev) => {
      const current = prev[dim] ?? []
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
      return { ...prev, [dim]: next }
    })
  }, [])

  /** Replace a dimension's selection (e.g. drilling the treemap to one type). */
  const set = useCallback((dim: Dim, values: string[]) => setFilters((prev) => ({ ...prev, [dim]: values })), [])

  const clear = useCallback((dim?: Dim) => setFilters((prev) => (dim ? { ...prev, [dim]: [] } : {})), [])

  const selected = useCallback((dim: Dim) => new Set(filters[dim] ?? []), [filters])

  const active = DIMS.flatMap((dim) => (filters[dim] ?? []).map((value) => ({ dim, value })))

  return { filters, visible, filtered, rowsFor, toggle, set, clear, selected, active }
}
