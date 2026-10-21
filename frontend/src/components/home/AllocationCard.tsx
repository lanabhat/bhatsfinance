import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useMaskedFmt } from '../common/Money'
import { NONE } from '../../hooks/useFilters'
import { holdingsLink } from '../../lib/deepLinks'
import { ChartCard, ChartLegend } from '../charts/ChartCard'
import { ChartTooltip, useChartTheme } from '../charts/chartTheme'
import { SectionLink } from '../ui/SectionHeader'
import type { CategoryBreakdownItem } from '../../types/domain'

type Props = {
  items: CategoryBreakdownItem[]
}

/**
 * Allocation by asset category: donut + legend (label · value · %). Category colours are
 * the user's own (AssetCategory.color), so they match the Allocation page and tables.
 */
export function AllocationCard({ items }: Props) {
  const fmt = useMaskedFmt()
  const ct = useChartTheme()
  const data = items
    .map((i) => ({
      key: String(i.category_id ?? 'uncategorised'), label: i.category_name, value: parseFloat(i.market_value),
      percent: parseFloat(i.allocation_percent), color: i.color,
      href: holdingsLink({ category: [i.category_id === null ? NONE : i.category_name] }),
      hrefLabel: `View ${i.category_name} holdings in Investments`,
    }))
    .filter((d) => d.value > 0)

  return (
    <ChartCard
      title="Allocation"
      subtitle="By asset category"
      action={<SectionLink href="#/allocation" />}
      empty={data.length === 0 ? { title: 'No allocation yet', description: 'Add holdings and give them a category.' } : null}
    >
      <div className="flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="h-40 w-40 shrink-0" role="img" aria-label={`Allocation: ${data.map((d) => `${d.label} ${d.percent.toFixed(0)}%`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={1} stroke={ct.surface} strokeWidth={2} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.key} fill={d.color} />)}
              </Pie>
              <Tooltip content={(p) => <ChartTooltip {...p} fmt={fmt} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full min-w-0 flex-1 [&>ul]:mt-0">
          <ChartLegend items={data} />
        </div>
      </div>
    </ChartCard>
  )
}
