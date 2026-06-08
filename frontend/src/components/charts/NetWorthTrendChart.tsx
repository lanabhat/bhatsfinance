import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { usePrivacy } from '../../context/PrivacyContext'
import type { NetWorthPoint } from '../../types/domain'

type Props = { data: NetWorthPoint[] }

export function NetWorthTrendChart({ data }: Props) {
  const fmt = useMaskedFmt()
  const { hidden } = usePrivacy()
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(0, 7)} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => hidden ? '••' : `₹${(v / 100000).toFixed(0)}L`} />
        <Tooltip formatter={(v) => [fmt(Number(v)), 'Net Worth']} labelFormatter={(l) => `Month: ${l}`} />
        <Area type="monotone" dataKey="networth" stroke="#6366f1" fill="url(#nwGrad)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
