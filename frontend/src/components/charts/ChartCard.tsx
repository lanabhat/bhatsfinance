import type { ReactNode } from 'react'
import { ArrowUpRight, BarChart3 } from 'lucide-react'
import { Amount } from '../ui/Amount'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Skeleton } from '../ui/Skeleton'
import { Tabs } from '../ui/Tabs'
import { CHART_RANGES } from '../../lib/chartRange'
import type { ChartRange } from '../../lib/chartRange'

export type LegendItem = {
  key: string; label: string; color: string; value?: number; percent?: number
  /** Makes the row a link (e.g. Investments filtered to this category). */
  href?: string
  hrefLabel?: string
}

type Props = {
  title: string
  subtitle?: ReactNode
  /** Right side of the header — e.g. a SectionLink. Range tabs go in `range`. */
  action?: ReactNode
  /** Shows the shared 1M / 3M / 6M / 1Y / All tabs. */
  range?: { value: ChartRange; onChange: (r: ChartRange) => void; options?: ChartRange[] }
  /** Below the plot, always — label, value, %. */
  legend?: LegendItem[]
  loading?: boolean
  empty?: { title: string; description?: string } | null
  /** Short note under the chart (what the dashed line means, data source). */
  note?: ReactNode
  children: ReactNode
}

/** The one chart wrapper: Card + header + optional range tabs + plot + legend + note. */
export function ChartCard({ title, subtitle, action, range, legend, loading, empty, note, children }: Props) {
  const header = range ? (
    <>
      {action}
      <Tabs size="sm" label={`${title} range`} tabs={(range.options ?? CHART_RANGES).map((r) => ({ key: r, label: r }))}
        active={range.value} onChange={range.onChange} />
    </>
  ) : action
  return (
    <Card title={title} subtitle={subtitle} actions={header}>
      {loading ? <Skeleton variant="chart" /> : empty ? <EmptyState icon={<BarChart3 />} title={empty.title} description={empty.description} /> : children}
      {!loading && !empty && legend && legend.length > 0 && <ChartLegend items={legend} />}
      {!loading && !empty && note && <p className="mt-3 text-xs text-ink-muted">{note}</p>}
    </Card>
  )
}

/** Legend rows: swatch · label · value · %. Text stays in ink colours; only the swatch carries the hue. */
export function ChartLegend({ items, onSelect }: { items: LegendItem[]; onSelect?: (key: string) => void }) {
  return (
    <ul className="m-0 mt-4 grid list-none gap-1 p-0">
      {items.map((d) => {
        const body = (
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{d.label}</span>
            {d.value !== undefined && <Amount value={d.value} format="compact" className="shrink-0 text-sm font-medium text-ink" />}
            {d.percent !== undefined && <span className="w-12 shrink-0 text-right text-sm tabular-nums text-ink-muted">{d.percent.toFixed(1)}%</span>}
          </>
        )
        const rowCls = 'flex min-h-8 w-full items-center gap-2 rounded-[var(--radius-sm)] px-1 text-left hover:bg-surface-2'
        return (
          <li key={d.key}>
            {d.href
              ? (
                <a href={d.href} title={d.hrefLabel} aria-label={d.hrefLabel} className={`group ${rowCls}`}>
                  {body}
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint group-hover:text-accent" aria-hidden />
                </a>
              )
              : onSelect
              ? <button type="button" onClick={() => onSelect(d.key)} className={rowCls}>{body}</button>
              : <div className="flex min-h-8 items-center gap-2 px-1">{body}</div>}
          </li>
        )
      })}
    </ul>
  )
}
