import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { usePrivacy } from '../../context/PrivacyContext'

export type CashFlowPoint = {
  month: string
  income: number
  expense: number
  investment: number
  savings: number
}

type Props = { data: CashFlowPoint[] }

export function CashFlowChart({ data }: Props) {
  const fmt = useMaskedFmt()
  const { hidden } = usePrivacy()
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => hidden ? '••' : `₹${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => fmt(Number(v))} />
        <Legend />
        <Bar dataKey="income" name="Income" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[3, 3, 0, 0]} />
        <Bar dataKey="investment" name="Investment" fill="#6366f1" radius={[3, 3, 0, 0]} />
        <Bar dataKey="savings" name="Savings" fill="#f59e0b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
