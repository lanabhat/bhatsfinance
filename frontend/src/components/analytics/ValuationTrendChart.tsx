import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme, ChartTooltip } from '../charts/chartTheme'
import { useMaskedFmt } from '../common/Money'
import type { HoldingsTrendPoint } from '../../api/analyticsApi'

type Props = {
  data: HoldingsTrendPoint[]
}

export function ValuationTrendChart({ data }: Props) {
  const ct = useChartTheme()
  const fmt = useMaskedFmt()
  const fmtL = (v: number) => `₹${(v / 100000).toFixed(1)}L`

  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-[var(--text-muted)]">
        No valuation history yet — run a bulk snapshot or import holdings data to build history.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260} minWidth={0}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradInvested" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} />
        <YAxis width={56} tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} tickFormatter={fmtL} />
        <Tooltip content={(p) => <ChartTooltip {...p} fmt={(v) => fmt(v)} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="invested"
          name="Invested"
          stroke="#94a3b8"
          strokeWidth={2}
          fill="url(#gradInvested)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="current"
          name="Current"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#gradCurrent)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
