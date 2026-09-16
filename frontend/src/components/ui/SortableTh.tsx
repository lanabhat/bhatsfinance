/**
 * Clickable table column header — click to sort by this column, click again
 * to reverse direction. Shared across every sortable table in the app so
 * clicking a header behaves and looks the same everywhere (previously 3
 * different in-house variants existed independently: SummaryTable's
 * ColHeader, analytics/HoldingsTable's Th, and allocation's inline th()).
 * Pair with useSortableColumn (frontend/src/hooks/useSortableColumn.ts) for
 * the click-to-toggle state.
 */
export function SortableTh<T extends string>({ label, col, sortCol, sortDir, onSort, align = 'left', className = '' }: {
  label: string
  col: T
  sortCol: T
  sortDir: 'asc' | 'desc'
  onSort: (col: T) => void
  align?: 'left' | 'right'
  className?: string
}) {
  const active = sortCol === col
  return (
    <th
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] hover:text-[var(--text)] ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
      onClick={() => onSort(col)}
    >
      {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}
