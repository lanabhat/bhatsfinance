import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { fmtMonth, fmtMonthAxis } from '../../lib/fmt'
import { CASHFLOW_COLOR, CASHFLOW_SERIES } from '../../lib/palette'
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

/** Monthly income / expense / investment / savings. Legend is rendered by the ChartCard. */
export function CashFlowChart({ data, onSelect }: Props) {
  const fmt = useMaskedFmt()
  const ct = useChartTheme()
  const barProps = (bucket: CashFlowBucket) => onSelect ? {
    cursor: 'pointer' as const,
    onClick: (entry: unknown) => {
      const row = entry as { month?: string }
      if (row?.month) onSelect(row.month, bucket)
    },
  } : {}
  return (
    <ResponsiveContainer width="100%" height={300} minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid {...ct.gridProps} />
        <XAxis dataKey="month" {...ct.xAxis} tickFormatter={fmtMonthAxis} />
        <YAxis {...ct.yAxisINR} />
        <Tooltip cursor={{ fill: ct.grid, opacity: 0.3 }} content={(p) => <ChartTooltip {...p} fmt={fmt} labelFmt={fmtMonth} />} />
        {CASHFLOW_SERIES.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={CASHFLOW_COLOR[s.key]} radius={[4, 4, 0, 0]} isAnimationActive={false} {...barProps(s.key)} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
