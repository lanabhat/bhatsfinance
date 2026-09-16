import { useState } from 'react'

/**
 * Click-to-sort state for a table: clicking the active column reverses
 * direction, clicking a different column switches to it at defaultDir.
 * Pair with SortableTh (frontend/src/components/ui/SortableTh.tsx).
 */
export function useSortableColumn<T extends string>(initial: T, defaultDir: 'asc' | 'desc' = 'desc') {
  const [sortCol, setSortCol] = useState<T>(initial)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir)
  const onSort = (col: T) => {
    if (col === sortCol) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir(defaultDir) }
  }
  return { sortCol, sortDir, onSort }
}
