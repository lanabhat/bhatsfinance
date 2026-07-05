import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { usePrivacy } from '../../context/PrivacyContext'
import { useChartTheme, ChartTooltip } from './chartTheme'

export type CashFlowPoint = {
  month: string
  income: number
  expense: number
  investment: number
  savings: number
}

export type CashFlowBucket = 'income' | 'expense' | 'investment' | 'savings'

type Props = {
  data: CashFlowPoint[]
  onSelect?: (month: string, bucket: CashFlowBucket) => void
}

export function CashFlowChart({ data, onSelect }: Props) {
  const fmt = useMaskedFmt()
  const { hidden } = usePrivacy()
  const ct = useChartTheme()
  const barProps = (bucket: CashFlowBucket) => onSelect ? {
    cursor: 'pointer' as const,
    onClick: (entry: unknown) => {
      const row = entry as { month?: string }
      if (row?.month) onSelect(row.month, bucket)
    },
  } : {}
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} />
        <YAxis tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} tickFormatter={(v) => hidden ? '••' : `₹${(v / 1000).toFixed(0)}k`} />
        <Tooltip cursor={{ fill: ct.grid, opacity: 0.3 }} content={(p) => <ChartTooltip {...p} fmt={fmt} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} {...barProps('income')} />
        <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[4, 4, 0, 0]} {...barProps('expense')} />
        <Bar dataKey="investment" name="Investment" fill="#6366f1" radius={[4, 4, 0, 0]} {...barProps('investment')} />
        <Bar dataKey="savings" name="Savings" fill="#f59e0b" radius={[4, 4, 0, 0]} {...barProps('savings')} />
      </BarChart>
    </ResponsiveContainer>
  )
}
