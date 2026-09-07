import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme, ChartTooltip } from '../charts/chartTheme'
import type { RebalancingRow } from '../../types/domain'

type Props = { rows: RebalancingRow[] }

/** Lighten a hex color toward the surface, used for the "target" bar so it reads
 * as the same category's identity but visually recessive next to "current". */
function lighten(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16))
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

export function AllocationChart({ rows }: Props) {
  const theme = useChartTheme()

  const chartData = rows.map((r) => ({
    name: r.category_name,
    current: parseFloat(r.current_percent),
    target: parseFloat(r.target_percent),
    color: r.color,
  }))

  const height = Math.max(220, chartData.length * 44 + 40)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke={theme.grid} strokeOpacity={0.6} />
        <XAxis type="number" unit="%" tick={{ fill: theme.axis, fontSize: 11 }} axisLine={{ stroke: theme.border }} tickLine={false} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fill: theme.text, fontSize: 12 }} axisLine={{ stroke: theme.border }} tickLine={false} />
        <Tooltip content={(p) => <ChartTooltip {...p} fmt={(v) => `${v.toFixed(1)}%`} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="current" name="Current %" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
        <Bar dataKey="target" name="Target %" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {chartData.map((d, i) => <Cell key={i} fill={lighten(d.color, 0.55)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
