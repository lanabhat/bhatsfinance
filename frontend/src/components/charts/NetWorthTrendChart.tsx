import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { fmtDate, fmtDateShort, fmtMonthAxis } from '../../lib/fmt'
import { filterByRange } from '../../lib/chartRange'
import type { ChartRange } from '../../lib/chartRange'
import { useChartTheme, ChartTooltip } from './chartTheme'
import type { NetWorthPoint } from '../../types/domain'

type Props = {
  /** Saved net-worth snapshots (frozen totals from past valuation runs). */
  data: NetWorthPoint[]
  /** Today's live net worth — the same figure as the summary strip. */
  live?: { date: string; value: number }
  range?: ChartRange
}

type Row = { date: string; networth?: number; live?: number }

/**
 * Solid area: saved snapshots. Dashed line: from the last snapshot to today's live
 * value, so the chart always ends on the headline figure and the gap since the last
 * snapshot shows. One tick per month (never the same month twice); short ranges tick by day.
 */
export function NetWorthTrendChart({ data, live, range = 'All' }: Props) {
  const fmt = useMaskedFmt()
  const ct = useChartTheme()

  const rows: Row[] = filterByRange(data, range, (p) => p.date).map((p) => ({ date: p.date, networth: p.networth }))
  const last = rows[rows.length - 1]
  const showLive = !!live && (!last || live.date > last.date)
  if (showLive) {
    if (last) last.live = last.networth // the dashed line starts on the last snapshot
    rows.push({ date: live.date, live: live.value })
  }

  const spanDays = rows.length > 1
    ? (new Date(rows[rows.length - 1].date).getTime() - new Date(rows[0].date).getTime()) / 86400000
    : 0
  const byMonth = spanDays > 92
  // First point of each month → one tick per month.
  const ticks = byMonth
    ? rows.filter((r, i) => i === 0 || r.date.slice(0, 7) !== rows[i - 1].date.slice(0, 7)).map((r) => r.date)
    : undefined

  return (
    <ResponsiveContainer width="100%" height={240} minWidth={0}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.22 }} />
            <stop offset="95%" style={{ stopColor: 'var(--primary)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <CartesianGrid {...ct.gridProps} />
        <XAxis dataKey="date" {...ct.xAxis} ticks={ticks} interval="preserveStartEnd"
          tickFormatter={(d: string) => (byMonth ? fmtMonthAxis(d) : fmtDateShort(d))} />
        <YAxis {...ct.yAxisINR} domain={['auto', 'auto']} />
        <Tooltip content={(p) => <ChartTooltip {...p} fmt={fmt} labelFmt={fmtDate} />} />
        <Area type="monotone" dataKey="networth" name="Snapshot" stroke="var(--primary)" fill="url(#nwGrad)"
          strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        {showLive && (
          <Line type="linear" dataKey="live" name="Today (live)" stroke="var(--primary)" strokeWidth={2}
            strokeDasharray="5 4" connectNulls isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === rows.length - 1 && props.cx != null && props.cy != null
                ? <circle key="today" cx={props.cx} cy={props.cy} r={4} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
                : <g key={`d${props.index}`} />} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
