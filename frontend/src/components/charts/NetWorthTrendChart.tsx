import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { usePrivacy } from '../../context/PrivacyContext'
import { fmtDate } from '../../lib/fmt'
import { useChartTheme, ChartTooltip } from './chartTheme'
import type { NetWorthPoint } from '../../types/domain'

type Props = {
  /** Saved net-worth snapshots (frozen totals from past valuation runs). */
  data: NetWorthPoint[]
  /** Today's live net worth — the same figure as the KPI. */
  live?: { date: string; value: number }
}

type Row = { date: string; networth?: number; live?: number }

/**
 * Solid area: saved snapshots. Dashed line: from the last snapshot to today's live
 * value, so the chart always ends on the KPI and the gap since the last snapshot shows.
 */
export function NetWorthTrendChart({ data, live }: Props) {
  const fmt = useMaskedFmt()
  const { hidden } = usePrivacy()
  const ct = useChartTheme()

  const rows: Row[] = data.map((p) => ({ date: p.date, networth: p.networth }))
  const last = rows[rows.length - 1]
  const showLive = !!live && (!last || live.date > last.date)
  if (showLive) {
    if (last) last.live = last.networth  // the dashed line starts on the last snapshot
    rows.push({ date: live.date, live: live.value })
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <ComposedChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.35 }} />
              <stop offset="95%" style={{ stopColor: 'var(--primary)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} tickFormatter={(d) => d.slice(0, 7)} />
          <YAxis width={48} tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} tickFormatter={(v) => hidden ? '••' : `₹${(v / 100000).toFixed(0)}L`} />
          <Tooltip content={(p) => <ChartTooltip {...p} fmt={fmt} />} />
          <Area type="monotone" dataKey="networth" name="Snapshot" stroke="var(--primary)" fill="url(#nwGrad)"
            strokeWidth={2.5} dot={false} connectNulls={false} />
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
      {showLive && last && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          Solid line: saved snapshots. Dashed: from the last snapshot ({fmtDate(last.date)}) to today’s live value.
        </p>
      )}
    </div>
  )
}
