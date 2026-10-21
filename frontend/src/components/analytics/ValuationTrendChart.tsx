import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme, ChartTooltip } from '../charts/chartTheme'
import { useMaskedFmt } from '../common/Money'
import { fmtDate, fmtDateShort, fmtMonthAxis } from '../../lib/fmt'
import type { HoldingsTrendPoint } from '../../api/analyticsApi'

type Props = {
  data: HoldingsTrendPoint[]
}

/** Invested (grey) vs current value (accent). Legend and empty state come from the ChartCard. */
export function ValuationTrendChart({ data }: Props) {
  const ct = useChartTheme()
  const fmt = useMaskedFmt()
  const spanDays = data.length > 1 ? (new Date(data[data.length - 1].date).getTime() - new Date(data[0].date).getTime()) / 86400000 : 0
  const byMonth = spanDays > 92
  const ticks = byMonth
    ? data.filter((p, i) => i === 0 || p.date.slice(0, 7) !== data[i - 1].date.slice(0, 7)).map((p) => p.date)
    : undefined

  return (
    <ResponsiveContainer width="100%" height={260} minWidth={0}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.22 }} />
            <stop offset="95%" style={{ stopColor: 'var(--primary)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <CartesianGrid {...ct.gridProps} />
        <XAxis dataKey="date" {...ct.xAxis} ticks={ticks} interval="preserveStartEnd"
          tickFormatter={(d: string) => (byMonth ? fmtMonthAxis(d) : fmtDateShort(d))} />
        <YAxis {...ct.yAxisINR} />
        <Tooltip content={(p) => <ChartTooltip {...p} fmt={(v) => fmt(v)} labelFmt={fmtDate} />} />
        <Area type="monotone" dataKey="invested" name="Invested" stroke="var(--series-other)" strokeWidth={2} fill="none" dot={false} isAnimationActive={false} />
        <Area type="monotone" dataKey="current" name="Current" stroke="var(--primary)" strokeWidth={2} fill="url(#gradCurrent)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
