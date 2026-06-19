import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme, ChartTooltip } from '../charts/chartTheme'
import { useMaskedFmt } from '../common/Money'
import type { DashboardHolding, CategoryBreakdownItem } from '../../types/domain'

type GroupBy = 'category' | 'type'

type Props = {
  holdings: DashboardHolding[]
  categoryBreakdown: CategoryBreakdownItem[]
  groupBy: GroupBy
}

const TYPE_LABELS: Record<string, string> = {
  equity: 'Equity', mutual_fund: 'Mutual Fund', fd: 'FD', rd: 'RD',
  epf: 'EPF', ppf: 'PPF', nps: 'NPS', gold: 'Gold',
  real_estate: 'Real Estate', sip: 'SIP', insurance: 'Insurance',
  lending: 'Lending', cash: 'Cash', vehicle: 'Vehicle', liability: 'Liability', other: 'Other',
}

export function InvestmentBarChart({ holdings, categoryBreakdown, groupBy }: Props) {
  const ct = useChartTheme()
  const fmt = useMaskedFmt()

  const chartData = (() => {
    if (groupBy === 'category') {
      const groups: Record<string, { invested: number; current: number }> = {}
      for (const h of holdings) {
        const cat = categoryBreakdown.find(c => c.category_id === h.asset_category)?.category_name
          ?? 'Uncategorised'
        if (!groups[cat]) groups[cat] = { invested: 0, current: 0 }
        groups[cat].invested += parseFloat(h.net_invested)
        groups[cat].current += parseFloat(h.market_value)
      }
      return Object.entries(groups).map(([name, v]) => ({ name, ...v }))
    } else {
      const groups: Record<string, { invested: number; current: number }> = {}
      for (const h of holdings) {
        const label = TYPE_LABELS[h.instrument_type] ?? h.instrument_type
        if (!groups[label]) groups[label] = { invested: 0, current: 0 }
        groups[label].invested += parseFloat(h.net_invested)
        groups[label].current += parseFloat(h.market_value)
      }
      return Object.entries(groups).map(([name, v]) => ({ name, ...v }))
    }
  })()

  const fmtL = (v: number) => `₹${(v / 100000).toFixed(1)}L`

  return (
    <ResponsiveContainer width="100%" height={260} minWidth={0}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} />
        <YAxis width={52} tick={{ fontSize: 11, fill: ct.axis }} stroke={ct.grid} tickFormatter={fmtL} />
        <Tooltip content={(p) => <ChartTooltip {...p} fmt={(v) => fmt(v)} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="invested" name="Invested" fill="#94a3b8" radius={[4, 4, 0, 0]} />
        <Bar dataKey="current" name="Current" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
