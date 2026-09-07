import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme, ChartTooltip } from '../charts/chartTheme'
import type { FundPerformanceRow } from '../../types/domain'

type Props = { rows: FundPerformanceRow[] }

const PERIOD_KEYS = ['3M', '6M', '1Y', '3Y', '5Y'] as const

function fmtPercent(v: number) {
  return `${v.toFixed(1)}%`
}

/** Short-term (3M/6M/1Y) vs long-term (3Y/5Y) CAGR, grouped per fund. Periods
 * with no history simply omit that bar rather than showing a fabricated 0%. */
export function FundCagrBarChart({ rows }: Props) {
  const ct = useChartTheme()

  const chartData = rows.map((r) => {
    const row: Record<string, string | number | null> = { name: r.instrument_name }
    for (const p of PERIOD_KEYS) {
      row[p] = r.cagr[p] === null ? null : Number((r.cagr[p]! * 100).toFixed(2))
    }
    return row
  })

  const colors: Record<(typeof PERIOD_KEYS)[number], string> = {
    '3M': '#a5b4fc', '6M': '#818cf8', '1Y': '#6366f1', '3Y': '#0ea5e9', '5Y': '#0369a1',
  }

  if (chartData.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-xs text-[var(--text-muted)]">No CAGR data yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">CAGR by period</h2>
      <ResponsiveContainer width="100%" height={280} minWidth={0}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: ct.axis }} stroke={ct.grid} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis width={48} tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} tickFormatter={(v) => `${v}%`} />
          <Tooltip content={(p) => <ChartTooltip {...p} fmt={fmtPercent} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {PERIOD_KEYS.map((p) => (
            <Bar key={p} dataKey={p} name={p} fill={colors[p]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
