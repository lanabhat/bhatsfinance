import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { ChartTooltip } from './chartTheme'
import type { DashboardAllocation } from '../../types/domain'

const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e', '#a78bfa', '#fb923c', '#34d399']

type Props = { data: DashboardAllocation[] }

export function AllocationPieChart({ data }: Props) {
  const fmt = useMaskedFmt()
  const chartData = data.map((d) => ({
    name: d.instrument_type,
    value: parseFloat(d.market_value),
    pct: d.allocation_percent,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, payload }) => `${name} ${(payload as typeof chartData[0]).pct}%`} labelLine={false}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={(p) => <ChartTooltip {...p} fmt={fmt} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
