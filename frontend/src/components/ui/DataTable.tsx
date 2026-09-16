import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useExpandable } from '../../hooks/useExpandable'
import { useSortableColumn } from '../../hooks/useSortableColumn'
import { SortableTh } from './SortableTh'

export type DataTableColumn<T> = {
  key: string
  label: string
  /** Default 'left'. */
  align?: 'left' | 'right'
  width?: string
  /** Extra th/td classes, e.g. hide-on-mobile ('hidden sm:table-cell'). */
  className?: string
  /** Opt-in — a column can supply sortValue purely to drive a dataBar without exposing sort UI. */
  sortable?: boolean
  sortValue?: (row: T) => string | number | null
  /** Opt-in, same reasoning as sortable. */
  searchable?: boolean
  searchValue?: (row: T) => string
  render?: (row: T) => ReactNode
  dataBar?: {
    value: (row: T) => number | null
    /** 'sequential': bar grows 0→value from the left. 'diverging': bar grows from a center
     * zero-line, for signed values like gain %/drift %. Default 'sequential'. */
    mode?: 'sequential' | 'diverging'
  }
}

export type DataTableGroupBy<T> = {
  options: { value: string; label: string }[]
  /** 'none' is reserved to mean "flat, no grouping" and is added automatically. */
  defaultValue?: string
  getGroup: (row: T, groupByValue: string) => { key: string; label: string; color?: string } | null
  aggregate?: (rows: T[]) => Record<string, ReactNode>
  /** Default true. */
  collapsible?: boolean
}

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number

  defaultSortCol?: string
  defaultSortDir?: 'asc' | 'desc'

  /** Default: true if any column has searchable: true. */
  searchable?: boolean
  searchPlaceholder?: string

  groupBy?: DataTableGroupBy<T>

  renderExpanded?: (row: T) => ReactNode
  rowClassName?: (row: T) => string
  onRowClick?: (row: T) => void

  loading?: boolean
  emptyState?: ReactNode
  className?: string
  minWidth?: string
}

const thCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap'
const GROUP_NONE = 'none'

function DataBarCell<T>({ column, row, max, maxAbs, children }: {
  column: DataTableColumn<T>
  row: T
  max: number
  maxAbs: number
  children: ReactNode
}) {
  const barValue = column.dataBar?.value(row) ?? null
  const diverging = column.dataBar?.mode === 'diverging'
  return (
    <td className={`relative px-3 py-2 ${column.align === 'right' ? 'text-right' : 'text-left'} text-xs text-[var(--text-2)] ${column.className ?? ''}`}>
      {barValue !== null && (diverging ? maxAbs > 0 : max > 0) && (
        <div
          className="absolute inset-y-1 rounded-sm"
          style={diverging
            ? {
                [barValue >= 0 ? 'left' : 'right']: '50%',
                width: `${(Math.abs(barValue) / maxAbs) * 50}%`,
                background: barValue >= 0 ? 'var(--databar-positive)' : 'var(--databar-negative)',
              }
            : { left: 0, width: `${Math.max(0, barValue / max) * 100}%`, background: 'var(--databar-positive)' }}
        />
      )}
      <span className="relative">{children}</span>
    </td>
  )
}

/**
 * Shared table: click a header to sort (reuses SortableTh/useSortableColumn),
 * optional built-in search box, optional page-supplied grouping (pill buttons
 * + collapsible sections — the page decides what a "group" is via getGroup,
 * this component only renders the chrome), optional per-row expand (a
 * detail row, colSpan auto-derived from column count), and optional in-cell
 * data bars on numeric columns (Excel-style, proportional to the max value
 * among currently visible — post-search, post-group-filter — rows).
 */
export function DataTable<T>({
  columns, rows, rowKey, defaultSortCol, defaultSortDir = 'desc',
  searchable, searchPlaceholder = 'Search…', groupBy, renderExpanded,
  rowClassName, onRowClick, loading, emptyState, className, minWidth,
}: DataTableProps<T>) {
  const anySearchable = columns.some((c) => c.searchable)
  const showSearch = searchable ?? anySearchable
  const [search, setSearch] = useState('')

  const firstSortable = columns.find((c) => c.sortable)?.key ?? columns[0]?.key ?? ''
  const { sortCol, sortDir, onSort } = useSortableColumn<string>(defaultSortCol ?? firstSortable, defaultSortDir)
  const expand = useExpandable<string | number>()

  const groupOptions = useMemo(() => groupBy ? [{ value: GROUP_NONE, label: 'None' }, ...groupBy.options] : [], [groupBy])
  const [groupValue, setGroupValue] = useState(groupBy?.defaultValue ?? GROUP_NONE)

  const searched = useMemo(() => {
    if (!showSearch || !search.trim()) return rows
    const q = search.trim().toLowerCase()
    const searchCols = columns.filter((c) => c.searchable)
    return rows.filter((r) => searchCols.some((c) => (c.searchValue?.(r) ?? '').toLowerCase().includes(q)))
  }, [rows, columns, showSearch, search])

  const sortColDef = columns.find((c) => c.key === sortCol)
  const sortFn = useMemo(() => (a: T, b: T) => {
    if (!sortColDef?.sortValue) return 0
    const va = sortColDef.sortValue(a)
    const vb = sortColDef.sortValue(b)
    const dirMul = sortDir === 'asc' ? 1 : -1
    if (va === null && vb === null) return 0
    if (va === null) return dirMul
    if (vb === null) return -dirMul
    const cmp = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : (va as number) - (vb as number)
    return dirMul * cmp
  }, [sortColDef, sortDir])

  const sorted = useMemo(() => [...searched].sort(sortFn), [searched, sortFn])

  // Data bar max/maxAbs per column, over currently visible (searched, pre-group-split) rows.
  const barStats = useMemo(() => {
    const stats = new Map<string, { max: number; maxAbs: number }>()
    for (const col of columns) {
      if (!col.dataBar) continue
      let max = 0, maxAbs = 0
      for (const r of searched) {
        const v = col.dataBar.value(r)
        if (v === null) continue
        if (v > max) max = v
        if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v)
      }
      stats.set(col.key, { max, maxAbs })
    }
    return stats
  }, [columns, searched])

  const renderRow = (row: T) => {
    const key = rowKey(row)
    const expandable = !!renderExpanded
    const isOpen = expandable && expand.isExpanded(key)
    return (
      <Fragment key={key}>
        <tr
          className={`border-t border-[var(--border)] ${expandable ? 'cursor-pointer hover:bg-[var(--surface-2)]' : ''} ${rowClassName?.(row) ?? ''}`}
          onClick={() => { if (expandable) expand.toggle(key); onRowClick?.(row) }}
        >
          {columns.map((col) => {
            const content = col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')
            if (col.dataBar) {
              const stats = barStats.get(col.key) ?? { max: 0, maxAbs: 0 }
              return <DataBarCell key={col.key} column={col} row={row} max={stats.max} maxAbs={stats.maxAbs}>{content}</DataBarCell>
            }
            return (
              <td key={col.key} className={`px-3 py-2 text-xs text-[var(--text-2)] ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.className ?? ''}`}>
                {content}
              </td>
            )
          })}
        </tr>
        {isOpen && (
          <tr>
            <td colSpan={columns.length} className="bg-[var(--surface-2)] p-0">
              {renderExpanded!(row)}
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  const groups = useMemo(() => {
    if (!groupBy || groupValue === GROUP_NONE) return null
    const map = new Map<string, { label: string; color?: string; rows: T[] }>()
    for (const r of sorted) {
      const g = groupBy.getGroup(r, groupValue)
      if (!g) continue
      if (!map.has(g.key)) map.set(g.key, { label: g.label, color: g.color, rows: [] })
      map.get(g.key)!.rows.push(r)
    }
    return map
  }, [groupBy, groupValue, sorted])

  return (
    <div className={className}>
      {(showSearch || (groupBy && groupOptions.length > 0)) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {showSearch && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-primary-500 sm:w-48"
            />
          )}
          {groupBy && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--text-muted)]">Group:</span>
              {groupOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setGroupValue(o.value)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${groupValue === o.value ? 'bg-primary-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={`overflow-x-auto rounded-xl border border-[var(--border)] ${loading ? 'opacity-60' : ''}`}>
        <table className={`w-full text-sm ${minWidth ?? ''}`}>
          <thead className="bg-[var(--surface-2)]">
            <tr>
              {columns.map((col) => col.sortable ? (
                <SortableTh
                  key={col.key}
                  label={col.label}
                  col={col.key}
                  sortCol={sortCol}
                  sortDir={sortDir}
                  onSort={onSort}
                  align={col.align}
                  className={col.className}
                />
              ) : (
                <th key={col.key} className={`${thCls} ${col.align === 'right' ? 'text-right' : ''} ${col.className ?? ''}`}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">{emptyState ?? 'No data'}</td></tr>
            ) : groups ? (
              [...groups.entries()].map(([key, g]) => (
                <GroupSection key={key} label={g.label} color={g.color} colSpan={columns.length} collapsible={groupBy!.collapsible ?? true}>
                  {g.rows.map(renderRow)}
                </GroupSection>
              ))
            ) : (
              sorted.map(renderRow)
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GroupSection({ label, color, colSpan, collapsible, children }: {
  label: string
  color?: string
  colSpan: number
  collapsible: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <tr
        className={`border-t border-[var(--border)] bg-[var(--surface-2)] ${collapsible ? 'cursor-pointer' : ''}`}
        onClick={() => collapsible && setOpen((p) => !p)}
      >
        <td colSpan={colSpan} className="px-3 py-1.5 text-xs font-semibold text-[var(--text-2)]">
          <span className="inline-flex items-center gap-1.5">
            {collapsible && (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className={`h-3 w-3 shrink-0 text-[var(--text-faint)] transition-transform ${open ? 'rotate-90' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
              </svg>
            )}
            {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
            {label}
          </span>
        </td>
      </tr>
      {open && children}
    </>
  )
}
