import { ResponsiveContainer, Tooltip, Treemap } from 'recharts'
import { useChartTheme } from '../../charts/chartTheme'
import { aggregate, pct, useDashboardColors, useMoney } from './facts'
import type { Dim, Fact, Filters } from './facts'

type Props = {
  filters: Filters
  rowsFor: (dim: Dim) => Fact[]
  set: (dim: Dim, values: string[]) => void
  toggle: (dim: Dim, value: string) => void
}

type Cell = { name: string; size: number; fill: string; share: number }

/** Ink that clears contrast on a coloured fill (labels inside a cell are the one place
 *  text sits on the data colour). */
function inkFor(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#0b0b0b' : '#ffffff'
}

/**
 * Drill-down treemap: types → classifications within one type → holdings within one
 * classification. The level follows the cross-filter (one type selected = its
 * classifications, and so on), so the breadcrumb, the treemap and every other chart
 * stay in step. Cells are coloured by asset class, matching the asset-class bar.
 */
export function AllocationTreemap({ filters, rowsFor, set, toggle }: Props) {
  const ct = useChartTheme()
  const colors = useDashboardColors()
  const money = useMoney()

  const oneType = filters.type?.length === 1 ? filters.type[0] : null
  const oneClass = oneType && filters.classification?.length === 1 ? filters.classification[0] : null
  const level: Dim = oneClass ? 'holding' : oneType ? 'classification' : 'type'
  const rows = rowsFor(level)
  const buckets = aggregate(rows, level)
  const total = buckets.reduce((s, b) => s + b.value, 0)

  // Each cell takes the colour of the asset class holding most of its value.
  const dominantClass = (key: string) => {
    const byClass = aggregate(rows.filter((r) => r[level] === key), 'asset_class')
    return byClass[0]?.key ?? 'Other'
  }
  const data: Cell[] = buckets.map((b) => ({
    name: b.key, size: b.value, fill: colors.assetClass(dominantClass(b.key)), share: pct(b.value, total),
  }))

  const onCell = (name: string) => {
    if (level === 'type') { set('type', [name]); set('classification', []); set('holding', []) }
    else if (level === 'classification') { set('classification', [name]); set('holding', []) }
    else toggle('holding', name)
  }

  const crumb = 'text-xs text-primary-600 hover:underline dark:text-primary-300'
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-[var(--text-muted)]" aria-label="Treemap drill-down">
          <button type="button" className={level === 'type' ? 'font-semibold text-[var(--text)]' : crumb}
            onClick={() => { set('type', []); set('classification', []); set('holding', []) }}>
            Overview
          </button>
          {oneType && <>
            <span>›</span>
            <button type="button" className={level === 'classification' ? 'font-semibold text-[var(--text)]' : crumb}
              onClick={() => { set('classification', []); set('holding', []) }}>
              {oneType}
            </button>
          </>}
          {oneClass && <><span>›</span><span className="font-semibold text-[var(--text)]">{oneClass}</span></>}
        </nav>
        <span className="text-[11px] text-[var(--text-muted)]">
          {level === 'holding' ? 'Click holdings to select them' : 'Click a block to drill in'}
        </span>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-xs text-[var(--text-muted)]">Nothing in this view.</p>
      ) : (
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={data} dataKey="size" nameKey="name" isAnimationActive={false}
              onClick={(node) => { const name = (node as { name?: string }).name; if (name) onCell(name) }}
              content={(props) => {
                const { x, y, width, height, name, fill, share, depth } = props as unknown as Cell & { x: number; y: number; width: number; height: number; depth: number }
                // Recharts also renders the root node (depth 0, no data fields) — draw only the cells.
                if (depth === 0 || width <= 0 || height <= 0 || typeof share !== 'number') return <g />
                const showLabel = width > 64 && height > 30
                const ink = inkFor(fill || '#94a3b8')
                return (
                  <g style={{ cursor: 'pointer' }}>
                    {/* 2px surface gap between cells */}
                    <rect x={x} y={y} width={width} height={height} rx={4} fill={fill} stroke={ct.surface} strokeWidth={2} />
                    {showLabel && (
                      <>
                        <text x={x + 8} y={y + 18} fill={ink} fontSize={12} fontWeight={600}>
                          {name.length > Math.floor(width / 7.5) ? `${name.slice(0, Math.max(3, Math.floor(width / 7.5) - 1))}…` : name}
                        </text>
                        {height > 46 && (
                          <text x={x + 8} y={y + 34} fill={ink} fontSize={11} opacity={0.9}>{share.toFixed(1)}%</text>
                        )}
                      </>
                    )}
                  </g>
                )
              }}>
              <Tooltip content={({ active, payload }) => {
                const cell = active ? (payload?.[0]?.payload as Cell | undefined) : undefined
                if (!cell) return null
                return (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-modal)]">
                    <p className="text-sm font-semibold tabular-nums text-[var(--text)]">{money.full(cell.size)}</p>
                    <p className="text-xs text-[var(--text-muted)]">{cell.name} · {cell.share.toFixed(1)}%</p>
                  </div>
                )
              }} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
