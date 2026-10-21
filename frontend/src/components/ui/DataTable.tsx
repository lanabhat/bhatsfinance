import { Fragment, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Rows3, Rows4 } from 'lucide-react'
import { useExpandable } from '../../hooks/useExpandable'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { useSortableColumn } from '../../hooks/useSortableColumn'
import { cn } from '../../lib/cn'
import { EmptyState, ErrorState } from './EmptyState'
import { IconButton } from './Button'
import { SearchInput, ToolbarSelect } from './Input'
import { RowMenu } from './Menu'
import { sortRowActions } from './rowActions'
import type { RowAction } from './rowActions'
import { Skeleton } from './Skeleton'
import { setDensity, useDensity } from './tableDensity'

export type DataTableColumn<T> = {
  key: string
  label: string
  /** Default 'left'. Numbers are always 'right'. */
  align?: 'left' | 'right'
  width?: string
  /** Extra th/td classes. */
  className?: string
  sortable?: boolean
  sortValue?: (row: T) => string | number | null
  searchable?: boolean
  searchValue?: (row: T) => string
  render?: (row: T) => ReactNode
  /** A thin bar under the number, proportional to the largest visible value. Never a filled blob. */
  dataBar?: {
    value: (row: T) => number | null
    mode?: 'sequential' | 'diverging'
  }
  /**
   * Phone card-list role. title: the left headline (default: first column) · subtitle: muted
   * line under it · value: right-aligned figure (default: first right-aligned column) ·
   * meta: small line under the value · hide: not shown on phones.
   */
  mobile?: 'title' | 'subtitle' | 'value' | 'meta' | 'hide'
  /** Drop this column while the table is grouped by this key (e.g. Type when grouped by type). */
  hideWhenGroupedBy?: string
}

export type DataTableGroupBy<T> = {
  options: { value: string; label: string }[]
  /** 'none' is reserved to mean "flat, no grouping" and is added automatically. */
  defaultValue?: string
  getGroup: (row: T, groupByValue: string) => { key: string; label: string; color?: string } | null
  /** Controlled by the page (one "Group by" in the FilterBar). 'none' means ungrouped. */
  value?: string
  /** Per-column subtotals shown on the group row, keyed by column key. */
  aggregate?: (rows: T[]) => Record<string, ReactNode>
  /** Default true. */
  collapsible?: boolean
  /** Keep group headers pinned while scrolling (e.g. dates). Default false. */
  sticky?: boolean
  /** Order of groups. Default: first appearance in the sorted rows. */
  sortGroups?: (a: { key: string; rows: T[] }, b: { key: string; rows: T[] }) => number
}

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number

  defaultSortCol?: string
  defaultSortDir?: 'asc' | 'desc'
  /** Server-side sorting: the table shows this state and reports clicks, but doesn't reorder. */
  sort?: { col: string; dir: 'asc' | 'desc'; onChange: (col: string, dir: 'asc' | 'desc') => void }

  /** Legacy built-in search box. New pages put search in the FilterBar instead. */
  searchable?: boolean
  searchPlaceholder?: string

  groupBy?: DataTableGroupBy<T>

  /** Rows nested under a row (e.g. the folios of one fund) — shown when it's expanded. */
  subRows?: (row: T) => T[] | undefined
  /** Detail panel under a row, toggled by clicking it (when there's no onRowClick). */
  renderExpanded?: (row: T) => ReactNode
  /** Row kebab menu (desktop) / swipe + kebab (phone). Order is normalised: view → edit → actions → delete. */
  rowActions?: (row: T) => RowAction[]
  rowClassName?: (row: T) => string
  /** Usually opens the DetailDrawer. */
  onRowClick?: (row: T) => void
  /** Muted row (inactive accounts, closed positions). */
  isRowMuted?: (row: T) => boolean

  /** Sticky footer: count + total. */
  footer?: ReactNode
  loading?: boolean
  error?: { message: ReactNode; onRetry?: () => void } | null
  emptyState?: ReactNode
  className?: string
  minWidth?: string
  /** Inner scroll height that makes the header (and group rows) sticky. Default: viewport-based. */
  maxHeight?: string
  /** Label for the table (screen readers). */
  ariaLabel?: string
}

const GROUP_NONE = 'none'
const ROW_PAD = { comfortable: 'py-3', compact: 'py-1.5' } as const

const isRight = <T,>(c: DataTableColumn<T>) => c.align === 'right'

/**
 * The one table. Sorting, grouping with subtotals, nested rows, row menus, density, a
 * sticky header/footer, the shared loading/empty/error states — and on phones a card
 * list (title + subtitle left, amount + meta right) with swipe actions.
 */
export function DataTable<T>({
  columns: allColumns, rows, rowKey, defaultSortCol, defaultSortDir = 'desc', sort,
  searchable, searchPlaceholder = 'Search…', groupBy, subRows, renderExpanded, rowActions,
  rowClassName, onRowClick, isRowMuted, footer, loading, error, emptyState, className, minWidth,
  maxHeight = 'calc(100dvh - 10rem)', ariaLabel,
}: DataTableProps<T>) {
  const isMobile = useIsMobile()
  const density = useDensity()
  const anySearchable = allColumns.some((c) => c.searchable)
  const showSearch = searchable ?? anySearchable
  const [search, setSearch] = useState('')

  const firstSortable = allColumns.find((c) => c.sortable)?.key ?? allColumns[0]?.key ?? ''
  const local = useSortableColumn<string>(defaultSortCol ?? firstSortable, defaultSortDir)
  const sortCol = sort?.col ?? local.sortCol
  const sortDir = sort?.dir ?? local.sortDir
  const onSort = (col: string) => {
    if (!sort) { local.onSort(col); return }
    sort.onChange(col, col === sort.col ? (sort.dir === 'asc' ? 'desc' : 'asc') : defaultSortDir)
  }
  const expand = useExpandable<string | number>()

  const groupOptions = useMemo(() => groupBy ? [{ value: GROUP_NONE, label: 'None' }, ...groupBy.options] : [], [groupBy])
  const [ownGroupValue, setGroupValue] = useState(groupBy?.defaultValue ?? GROUP_NONE)
  const groupControlled = groupBy?.value !== undefined
  const groupValue = groupControlled ? groupBy!.value! : ownGroupValue

  const columns = useMemo(
    () => allColumns.filter((c) => !c.hideWhenGroupedBy || c.hideWhenGroupedBy !== groupValue),
    [allColumns, groupValue],
  )

  const searched = useMemo(() => {
    if (!showSearch || !search.trim()) return rows
    const q = search.trim().toLowerCase()
    const searchCols = allColumns.filter((c) => c.searchable)
    return rows.filter((r) => searchCols.some((c) => (c.searchValue?.(r) ?? '').toLowerCase().includes(q)))
  }, [rows, allColumns, showSearch, search])

  const sortColDef = allColumns.find((c) => c.key === sortCol)
  const sorted = useMemo(() => {
    if (sort || !sortColDef?.sortValue) return searched
    const dirMul = sortDir === 'asc' ? 1 : -1
    return [...searched].sort((a, b) => {
      const va = sortColDef.sortValue!(a)
      const vb = sortColDef.sortValue!(b)
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      const cmp = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : (va as number) - (vb as number)
      return dirMul * cmp
    })
  }, [searched, sortColDef, sortDir, sort])

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

  const groups = useMemo(() => {
    if (!groupBy || groupValue === GROUP_NONE) return null
    const map = new Map<string, { key: string; label: string; color?: string; rows: T[] }>()
    for (const r of sorted) {
      const g = groupBy.getGroup(r, groupValue)
      if (!g) continue
      if (!map.has(g.key)) map.set(g.key, { key: g.key, label: g.label, color: g.color, rows: [] })
      map.get(g.key)!.rows.push(r)
    }
    const list = [...map.values()]
    if (groupBy.sortGroups) list.sort(groupBy.sortGroups)
    return list
  }, [groupBy, groupValue, sorted])

  const hasActions = !!rowActions
  const colCount = columns.length + (hasActions ? 1 : 0)

  const cellContent = (col: DataTableColumn<T>, row: T) =>
    col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')

  // ── Desktop table ────────────────────────────────────────────────────────────
  const renderRow = (row: T, depth = 0): ReactNode => {
    const key = rowKey(row)
    const children = subRows?.(row)
    const hasChildren = !!children && children.length > 0
    const expandable = hasChildren || (!!renderExpanded && !onRowClick)
    const isOpen = expand.isExpanded(key)
    const clickable = expandable || !!onRowClick
    const muted = isRowMuted?.(row)
    return (
      <Fragment key={key}>
        <tr
          className={cn(
            'group border-t border-line',
            clickable && 'cursor-pointer hover:bg-surface-2 focus-within:bg-surface-2',
            muted && '[&>td]:opacity-60',
            rowClassName?.(row),
          )}
          onClick={() => {
            if (hasChildren || (renderExpanded && !onRowClick)) expand.toggle(key)
            else onRowClick?.(row)
          }}
          tabIndex={clickable ? 0 : undefined}
          onKeyDown={(e) => {
            if (!clickable || e.target !== e.currentTarget) return
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click() }
          }}
          aria-expanded={expandable ? isOpen : undefined}
        >
          {columns.map((col, ci) => {
            const content = cellContent(col, row)
            const right = isRight(col)
            const stats = col.dataBar ? barStats.get(col.key) : undefined
            const barValue = col.dataBar?.value(row) ?? null
            return (
              <td
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn('relative px-3 text-sm text-ink', ROW_PAD[density], right && 'text-right tabular-nums whitespace-nowrap', col.className)}
              >
                {ci === 0 && (depth > 0 || expandable) ? (
                  <span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 24 }}>
                    {expandable
                      ? <ChevronRight className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', isOpen && 'rotate-90')} aria-hidden />
                      : <span className="w-4 shrink-0" />}
                    <span className="min-w-0 flex-1">{content}</span>
                  </span>
                ) : content}
                {stats && barValue !== null && (col.dataBar?.mode === 'diverging' ? stats.maxAbs > 0 : stats.max > 0) && (
                  <DataBar value={barValue} stats={stats} diverging={col.dataBar?.mode === 'diverging'} />
                )}
              </td>
            )
          })}
          {hasActions && (
            <td className={cn('w-12 px-2 text-right', ROW_PAD[density])}>
              <RowMenu actions={rowActions!(row)} />
            </td>
          )}
        </tr>
        {isOpen && hasChildren && children!.map((c) => renderRow(c, depth + 1))}
        {isOpen && !hasChildren && renderExpanded && (
          <tr>
            <td colSpan={colCount} className="border-t border-line bg-surface-2 p-0">{renderExpanded(row)}</td>
          </tr>
        )}
      </Fragment>
    )
  }

  const body = () => {
    if (loading && rows.length === 0) return <tr><td colSpan={colCount} className="p-0"><Skeleton variant="table" rows={6} /></td></tr>
    if (error) return <tr><td colSpan={colCount}><ErrorState message={error.message} onRetry={error.onRetry} /></td></tr>
    if (sorted.length === 0) {
      return (
        <tr><td colSpan={colCount}>
          {typeof emptyState === 'string' || !emptyState ? <EmptyState title={(emptyState as string) || 'Nothing to show'} /> : emptyState}
        </td></tr>
      )
    }
    if (groups) {
      return groups.map((g) => (
        <GroupSection
          key={g.key}
          label={g.label}
          color={g.color}
          count={g.rows.length}
          columns={columns}
          extraCol={hasActions}
          totals={groupBy!.aggregate?.(g.rows)}
          collapsible={groupBy!.collapsible ?? true}
          sticky={!!groupBy!.sticky}
        >
          {g.rows.map((r) => renderRow(r))}
        </GroupSection>
      ))
    }
    return sorted.map((r) => renderRow(r))
  }

  const legacyToolbar = (showSearch || (groupBy && !groupControlled)) && (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {showSearch && <SearchInput value={search} onChange={setSearch} placeholder={searchPlaceholder} className="w-full sm:w-64" />}
      {groupBy && !groupControlled && (
        <ToolbarSelect label="Group by" value={groupValue} options={groupOptions} onChange={setGroupValue} />
      )}
    </div>
  )

  if (isMobile) {
    return (
      <div className={className}>
        {legacyToolbar}
        <MobileList
          columns={columns}
          groups={groups}
          rows={sorted}
          rowKey={rowKey}
          subRows={subRows}
          renderExpanded={renderExpanded}
          rowActions={rowActions}
          onRowClick={onRowClick}
          isRowMuted={isRowMuted}
          groupBy={groupBy}
          loading={loading && rows.length === 0}
          error={error}
          emptyState={emptyState}
          footer={footer}
          cellContent={cellContent}
        />
      </div>
    )
  }

  return (
    <div className={className}>
      {legacyToolbar}
      <div
        className={cn('overflow-auto rounded-[var(--radius-lg)] border border-line bg-surface', loading && rows.length > 0 && 'opacity-60')}
        style={{ maxHeight }}
      >
        <table aria-label={ariaLabel} aria-busy={loading || undefined} className={cn('m-0 w-full border-collapse text-sm', minWidth)}>
          <thead className="sticky top-0 z-[2] bg-surface-2">
            <tr className="h-10">
              {columns.map((col) => {
                const right = isRight(col)
                const active = sortCol === col.key
                const cls = cn('whitespace-nowrap border-b border-line px-3 text-xs font-semibold text-ink-muted', right ? 'text-right' : 'text-left', col.className)
                if (!col.sortable) return <th key={col.key} scope="col" className={cls} style={col.width ? { width: col.width } : undefined}>{col.label}</th>
                return (
                  <th key={col.key} scope="col" className={cls} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    style={col.width ? { width: col.width } : undefined}>
                    <button type="button" onClick={() => onSort(col.key)}
                      className={cn('inline-flex items-center gap-1 hover:text-ink', right && 'flex-row-reverse', active && 'text-ink')}>
                      {col.label}
                      {active
                        ? (sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />)
                        : <ArrowDown className="h-3.5 w-3.5 opacity-0" aria-hidden />}
                    </button>
                  </th>
                )
              })}
              {hasActions && <th scope="col" className="w-12 border-b border-line"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>{body()}</tbody>
          {footer && (
            <tfoot className="sticky bottom-0 z-[2] bg-surface-2">
              <tr><td colSpan={colCount} className="border-t border-line px-3 py-2 text-sm text-ink-2">{footer}</td></tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function DataBar({ value, stats, diverging }: { value: number; stats: { max: number; maxAbs: number }; diverging: boolean }) {
  const style = diverging
    ? { [value >= 0 ? 'left' : 'right']: '50%', width: `${(Math.abs(value) / stats.maxAbs) * 50}%`, background: value >= 0 ? 'var(--success)' : 'var(--danger)' }
    : { right: 12, width: `calc(${Math.max(0, value / stats.max) * 100}% - 24px)`, background: 'var(--primary)' }
  return <span aria-hidden className="pointer-events-none absolute bottom-1 h-0.5 rounded-full opacity-40" style={style} />
}

function GroupSection<T>({ label, color, count, columns, extraCol, totals, collapsible, sticky, children }: {
  label: string
  color?: string
  count: number
  columns: DataTableColumn<T>[]
  extraCol: boolean
  totals?: Record<string, ReactNode>
  collapsible: boolean
  sticky: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  const firstTotalIdx = totals ? columns.findIndex((c) => totals[c.key] !== undefined) : -1
  const labelSpan = firstTotalIdx === -1 ? columns.length + (extraCol ? 1 : 0) : Math.max(firstTotalIdx, 1)
  const toggle = () => collapsible && setOpen((p) => !p)
  return (
    <>
      <tr
        className={cn('border-t border-line bg-surface-2', collapsible && 'cursor-pointer', sticky && 'sticky top-10 z-[1]')}
        onClick={toggle}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={(e) => { if (collapsible && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle() } }}
        aria-expanded={collapsible ? open : undefined}
      >
        <td colSpan={labelSpan} className="px-3 py-2 text-sm font-semibold text-ink">
          <span className="inline-flex items-center gap-2">
            {collapsible && <ChevronRight className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-90')} aria-hidden />}
            {color && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />}
            {label}
            <span className="font-normal text-ink-muted tabular-nums">{count}</span>
          </span>
        </td>
        {totals && columns.slice(labelSpan).map((col) => (
          <td key={col.key} className={cn('whitespace-nowrap px-3 py-2 text-sm font-semibold text-ink tabular-nums', isRight(col) && 'text-right')}>
            {totals[col.key] ?? null}
          </td>
        ))}
        {totals && extraCol && <td />}
      </tr>
      {open && children}
    </>
  )
}

// ── Phone card list ────────────────────────────────────────────────────────────

type MobileProps<T> = {
  columns: DataTableColumn<T>[]
  groups: { key: string; label: string; color?: string; rows: T[] }[] | null
  rows: T[]
  rowKey: (row: T) => string | number
  subRows?: (row: T) => T[] | undefined
  renderExpanded?: (row: T) => ReactNode
  rowActions?: (row: T) => RowAction[]
  onRowClick?: (row: T) => void
  isRowMuted?: (row: T) => boolean
  groupBy?: DataTableGroupBy<T>
  loading?: boolean
  error?: { message: ReactNode; onRetry?: () => void } | null
  emptyState?: ReactNode
  footer?: ReactNode
  cellContent: (col: DataTableColumn<T>, row: T) => ReactNode
}

function MobileList<T>(p: MobileProps<T>) {
  const { columns } = p
  const visible = columns.filter((c) => c.mobile !== 'hide' && c.key !== 'actions')
  const title = visible.find((c) => c.mobile === 'title') ?? visible[0]
  const value = visible.find((c) => c.mobile === 'value') ?? visible.find((c) => isRight(c) && c !== title && !c.mobile)
  const subtitles = visible.filter((c) => c.mobile === 'subtitle')
  const metas = visible.filter((c) => c.mobile === 'meta')
  const expand = useExpandable<string | number>()

  const renderCard = (row: T, depth = 0): ReactNode => {
    const key = p.rowKey(row)
    const children = p.subRows?.(row)
    const hasChildren = !!children && children.length > 0
    const expandable = hasChildren || (!!p.renderExpanded && !p.onRowClick)
    const isOpen = expand.isExpanded(key)
    const card = (
      <div
        role={expandable || p.onRowClick ? 'button' : undefined}
        tabIndex={expandable || p.onRowClick ? 0 : undefined}
        onClick={() => { if (expandable) expand.toggle(key); else p.onRowClick?.(row) }}
        className={cn('flex min-h-14 items-center gap-3 bg-surface px-4 py-3', p.isRowMuted?.(row) && 'opacity-60')}
        style={{ paddingLeft: 16 + depth * 16 }}
      >
        {expandable && <ChevronRight className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', isOpen && 'rotate-90')} aria-hidden />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{title && p.cellContent(title, row)}</div>
          {subtitles.length > 0 && (
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              {subtitles.map((c) => <span key={c.key} className="min-w-0 truncate">{p.cellContent(c, row)}</span>)}
            </div>
          )}
        </div>
        {(value || metas.length > 0) && (
          <div className="shrink-0 text-right">
            {value && <div className="text-sm font-semibold text-ink tabular-nums">{p.cellContent(value, row)}</div>}
            {metas.map((c) => <div key={c.key} className="text-xs text-ink-muted tabular-nums">{p.cellContent(c, row)}</div>)}
          </div>
        )}
        {p.rowActions && <RowMenu actions={p.rowActions(row)} />}
      </div>
    )
    return (
      <Fragment key={key}>
        <li className="border-t border-line first:border-t-0">
          {p.rowActions ? <SwipeRow actions={p.rowActions(row)}>{card}</SwipeRow> : card}
        </li>
        {isOpen && hasChildren && children!.map((c) => renderCard(c, depth + 1))}
        {isOpen && !hasChildren && p.renderExpanded && <li className="border-t border-line bg-surface-2">{p.renderExpanded(row)}</li>}
      </Fragment>
    )
  }

  if (p.loading) return <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface"><Skeleton variant="table" rows={6} /></div>
  if (p.error) return <div className="rounded-[var(--radius-lg)] border border-line bg-surface"><ErrorState message={p.error.message} onRetry={p.error.onRetry} /></div>
  if (p.rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface">
        {typeof p.emptyState === 'string' || !p.emptyState ? <EmptyState title={(p.emptyState as string) || 'Nothing to show'} /> : p.emptyState}
      </div>
    )
  }

  const valueKey = value?.key
  // overflow-clip (not hidden): hidden would make this box the sticky container and push
  // the pinned group headers down inside it.
  return (
    <div className="overflow-clip rounded-[var(--radius-lg)] border border-line bg-surface">
      {p.groups ? p.groups.map((g) => {
        const totals = p.groupBy?.aggregate?.(g.rows)
        return (
          <section key={g.key}>
            <div className={cn('flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-2 first:border-t-0', p.groupBy?.sticky && 'sticky top-14 z-[1]')}>
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                {g.color && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: g.color }} aria-hidden />}
                <span className="truncate">{g.label}</span>
                <span className="font-normal text-ink-muted tabular-nums">{g.rows.length}</span>
              </span>
              {valueKey && totals?.[valueKey] !== undefined && <span className="shrink-0 text-sm font-semibold tabular-nums">{totals[valueKey]}</span>}
            </div>
            <ul className="m-0 list-none border-t border-line p-0">{g.rows.map((r) => renderCard(r))}</ul>
          </section>
        )
      }) : <ul className="m-0 list-none p-0">{p.rows.map((r) => renderCard(r))}</ul>}
      {p.footer && <div className="sticky bottom-0 border-t border-line bg-surface-2 px-4 py-2 text-sm text-ink-2">{p.footer}</div>}
    </div>
  )
}

const SWIPE_BTN = 72

/** Swipe a card left to reveal up to three actions (the kebab offers all of them too). */
function SwipeRow({ actions, children }: { actions: RowAction[]; children: ReactNode }) {
  const shown = sortRowActions(actions).filter((a) => !a.href && !a.disabled).slice(-3)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; base: number } | null>(null)
  const horizontal = useRef<boolean | null>(null)
  const max = shown.length * SWIPE_BTN
  if (shown.length === 0) return <>{children}</>

  return (
    <div className="relative overflow-hidden">
      <div className={cn('absolute inset-y-0 right-0 flex', dx === 0 && !dragging && 'invisible')} aria-hidden={dx === 0}>
        {shown.map((a) => (
          <button key={a.label} type="button" tabIndex={dx === 0 ? -1 : 0}
            onClick={() => { setDx(0); if (!a.confirm || window.confirm(a.confirm.message)) a.onSelect?.() }}
            className={cn('flex h-full items-center justify-center px-2 text-xs font-medium', a.destructive ? 'bg-danger text-white' : 'bg-surface-3 text-ink')}
            style={{ width: SWIPE_BTN }}>
            {a.label}
          </button>
        ))}
      </div>
      <div
        className="relative"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 0.2s ease-out' }}
        onTouchStart={(e) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: dx }; horizontal.current = null; setDragging(true) }}
        onTouchMove={(e) => {
          if (!start.current) return
          const mx = e.touches[0].clientX - start.current.x
          const my = e.touches[0].clientY - start.current.y
          if (horizontal.current === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) horizontal.current = Math.abs(mx) > Math.abs(my)
          if (horizontal.current) setDx(Math.max(-max, Math.min(0, start.current.base + mx)))
        }}
        onTouchEnd={() => { start.current = null; setDragging(false); setDx((d) => (d < -max / 2 ? -max : 0)) }}
        onClickCapture={(e) => { if (dx !== 0) { e.stopPropagation(); setDx(0) } }}
      >
        {children}
      </div>
    </div>
  )
}

/** Comfortable / compact row height — goes in a FilterBar's controls; applies to every table. */
export function DensityToggle() {
  const density = useDensity()
  const compact = density === 'compact'
  return (
    <IconButton
      label={compact ? 'Comfortable rows' : 'Compact rows'}
      icon={compact ? <Rows3 /> : <Rows4 />}
      onClick={() => setDensity(compact ? 'comfortable' : 'compact')}
      className="hidden border border-line-strong md:inline-flex"
    />
  )
}
