import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { useChartTheme, ChartTooltip } from './chartTheme'
import type { CategoryBreakdownItem } from '../../types/domain'

type Props = {
  items: CategoryBreakdownItem[]
  onSelect?: (categoryId: number | null) => void
  maxLegendItems?: number
}

const DEFAULT_MAX_LEGEND_ITEMS = 5

export function AllocationDonutChart({ items, onSelect, maxLegendItems = DEFAULT_MAX_LEGEND_ITEMS }: Props) {
  const fmt = useMaskedFmt()
  const ct = useChartTheme()
  const data = items.map((i) => ({
    id: i.category_id,
    name: i.category_name,
    value: parseFloat(i.market_value),
    pct: i.allocation_percent,
    color: i.color,
  }))

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-xs text-[var(--text-muted)]">No allocation data yet</p>
      </div>
    )
  }

  const legendItems = data.slice(0, maxLegendItems)

  return (
    <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Allocation</h2>
      <div className="flex min-w-0 items-center gap-4">
        <div className="h-[104px] w-[104px] shrink-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={32} outerRadius={50} paddingAngle={2} stroke={ct.surface} strokeWidth={2}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={(p) => <ChartTooltip {...p} fmt={fmt} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {legendItems.map((d) => (
            <button
              key={d.id ?? 'uncategorised'}
              type="button"
              onClick={() => onSelect?.(d.id)}
              className={`flex w-full items-center gap-2 text-left ${onSelect ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-2)]">{d.name}</span>
              <span className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">{parseFloat(d.pct).toFixed(0)}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
