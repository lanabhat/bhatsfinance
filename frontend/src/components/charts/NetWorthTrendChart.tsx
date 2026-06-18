import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { usePrivacy } from '../../context/PrivacyContext'
import { useChartTheme, ChartTooltip } from './chartTheme'
import type { NetWorthPoint } from '../../types/domain'

type Props = { data: NetWorthPoint[] }

export function NetWorthTrendChart({ data }: Props) {
  const fmt = useMaskedFmt()
  const { hidden } = usePrivacy()
  const ct = useChartTheme()
  return (
    <ResponsiveContainer width="100%" height={220} minWidth={0}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} tickFormatter={(d) => d.slice(0, 7)} />
        <YAxis width={48} tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} tickFormatter={(v) => hidden ? '••' : `₹${(v / 100000).toFixed(0)}L`} />
        <Tooltip content={(p) => <ChartTooltip {...p} fmt={fmt} />} />
        <Area type="monotone" dataKey="networth" name="Net Worth" stroke="#6366f1" fill="url(#nwGrad)" strokeWidth={2.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
