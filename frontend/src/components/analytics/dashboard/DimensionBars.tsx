import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from '../../charts/chartTheme'
import { aggregate, pct, useDashboardColors, useMoney } from './facts'
import type { Bucket, Dim, Fact } from './facts'

type Props = {
  title: string
  dim: Dim
  /** Rows filtered by every other dimension (useCrossFilter.rowsFor(dim)). */
  rows: Fact[]
  selected: Set<string>
  onToggle: (value: string) => void
  onClear: () => void
  /** Show the top N; the rest fold into an unclickable "Other" bar. */
  limit?: number
  hint?: string
}

const OTHER = 'Other (smaller)'
const BAR_PX = 16
const ROW_PX = 28

type Row = Bucket & { label: string; share: number; isOther: boolean }

function BarTooltip({ active, payload, full }: { active?: boolean; payload?: readonly { payload?: Row }[]; full: (v: number) => string }) {
  const row = active ? payload?.[0]?.payload : undefined
  if (!row) return null
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-modal)]">
      <p className="text-sm font-semibold tabular-nums text-[var(--text)]">{full(row.value)}</p>
      <p className="text-xs text-[var(--text-muted)]">{row.label} · {row.share.toFixed(1)}% of view</p>
      {row.invested > 0 && (
        <p className="text-xs text-[var(--text-muted)]">Invested {full(row.invested)}</p>
      )}
      {!row.isOther && <p className="mt-1 text-[10px] text-[var(--text-faint)]">Click to filter</p>}
    </div>
  )
}

/** One dimension as horizontal bars; clicking a bar toggles it in the cross-filter. */
export function DimensionBars({ title, dim, rows, selected, onToggle, onClear, limit = 10, hint }: Props) {
  const ct = useChartTheme()
  const colors = useDashboardColors()
  const money = useMoney()

  const buckets = aggregate(rows, dim)
  const total = buckets.reduce((s, b) => s + b.value, 0)
  let shown = buckets
  if (buckets.length > limit) {
    // Keep selected items visible even if they'd fall outside the top N.
    const top = buckets.slice(0, limit)
    const keep = [...top, ...buckets.slice(limit).filter((b) => selected.has(b.key))]
    const rest = buckets.filter((b) => !keep.includes(b))
    shown = [...keep, rest.reduce<Bucket>((o, b) => ({ ...o, value: o.value + b.value, invested: o.invested + b.invested, count: o.count + b.count }),
      { key: OTHER, value: 0, invested: 0, count: 0 })]
  }
  const data: Row[] = shown.map((b) => ({
    ...b, label: b.key.length > 17 ? `${b.key.slice(0, 16)}…` : b.key, share: pct(b.value, total), isOther: b.key === OTHER,
  }))
  const anySelected = selected.size > 0

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
        {anySelected ? (
          <button type="button" onClick={onClear} className="text-[11px] text-primary-600 hover:underline dark:text-primary-300">
            Clear ({selected.size})
          </button>
        ) : hint ? <span className="text-[11px] text-[var(--text-muted)]">{hint}</span> : null}
      </div>
      {data.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--text-muted)]">Nothing in this view.</p>
      ) : (
        <div style={{ height: data.length * ROW_PX + 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 112, bottom: 0, left: 0 }}
              className="[&_.recharts-surface:focus:not(:focus-visible)]:outline-none [&_.recharts-wrapper:focus:not(:focus-visible)]:outline-none">
              <XAxis type="number" hide domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="label" width={128} tickLine={false} axisLine={false} interval={0}
                tick={({ x, y, payload, index }: { x: string | number; y: string | number; payload: { value: string }; index: number }) => {
                  const row = data[index]
                  x = Number(x)
                  const isSel = row && selected.has(row.key)
                  return (
                    // The label is part of the hit target: clicking it filters like clicking the bar.
                    <text x={x - 6} y={y} dy={4} textAnchor="end" fontSize={11}
                      fill={isSel ? ct.text : ct.axis} fontWeight={isSel ? 600 : 400}
                      style={{ cursor: row && !row.isOther ? 'pointer' : 'default' }}
                      onClick={() => { if (row && !row.isOther) onToggle(row.key) }}>
                      {payload.value}
                    </text>
                  )
                }} />
              <Tooltip cursor={{ fill: ct.grid, opacity: 0.4 }} content={(p) => <BarTooltip {...p} full={money.full} />} />
              <Bar dataKey="value" barSize={BAR_PX} radius={[0, 4, 4, 0]} isAnimationActive={false}
                cursor="pointer"
                onClick={(entry) => {
                  const row = (entry as unknown as { payload?: Row }).payload
                  if (row && !row.isOther) onToggle(row.key)
                }}>
                {data.map((row) => (
                  <Cell key={row.key}
                    fill={row.isOther || (anySelected && !selected.has(row.key)) ? colors.barDim : colors.bar} />
                ))}
                <LabelList dataKey="value" content={(props) => {
                  // Drawn as one <text> so it never wraps (the default label wraps to the bar's band).
                  const { x, y, width, height, value } = props as { x: number; y: number; width: number; height: number; value: number }
                  const n = Number(value)
                  return (
                    <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={11} fill={ct.axis}>
                      {money.compact(n)} · {pct(n, total).toFixed(0)}%
                    </text>
                  )
                }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
