import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { useChartTheme, ChartTooltip } from '../charts/chartTheme'
import type { FundPerformanceRow } from '../../types/domain'

type Props = { rows: FundPerformanceRow[] }

// Fixed categorical order, not cycled per-render — consistent identity across
// reloads/filters since funds are sorted by market value each time.
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316']

export function FundDistributionChart({ rows }: Props) {
  const fmt = useMaskedFmt()
  const ct = useChartTheme()

  const data = rows.map((r, i) => ({
    id: r.instrument_id,
    name: r.instrument_name,
    value: parseFloat(r.market_value),
    pct: r.allocation_percent,
    color: COLORS[i % COLORS.length],
  }))

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-xs text-[var(--text-muted)]">No fund holdings yet</p>
      </div>
    )
  }

  return (
    <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Fund distribution</h2>
      <div className="flex min-w-0 items-center gap-4">
        <div className="h-[104px] w-[104px] shrink-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={32} outerRadius={50} paddingAngle={2} stroke={ct.surface} strokeWidth={2}>
                {data.map((d) => (
                  <Cell key={d.id} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={(p) => <ChartTooltip {...p} fmt={fmt} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {data.slice(0, 6).map((d) => (
            <div key={d.id} className="flex w-full items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-2)]">{d.name}</span>
              <span className="shrink-0 text-xs font-semibold text-[var(--text-muted)]">{parseFloat(d.pct).toFixed(0)}%</span>
            </div>
          ))}
          {data.length > 6 && (
            <p className="text-xs text-[var(--text-faint)]">+{data.length - 6} more</p>
          )}
        </div>
      </div>
    </div>
  )
}
