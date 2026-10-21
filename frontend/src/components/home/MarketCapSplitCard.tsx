import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { getJson, toQueryString } from '../../api/http'
import { cn } from '../../lib/cn'
import { seriesVar } from '../../lib/palette'
import type { SeriesSlot } from '../../lib/palette'
import { Amount } from '../ui/Amount'
import { Card } from '../ui/Card'
import type { MarketCapSplit } from '../../types/domain'

type Props = { householdId: number; asOf: string }

// Adjacent segments use adjacent palette slots (validated for adjacent-pair contrast).
const CAP_SLOT: Record<string, SeriesSlot> = { large_cap: 1, mid_cap: 2, small_cap: 3, multi: 4, unclassified: 'other' }
const capColor = (key: string) => seriesVar(CAP_SLOT[key] ?? 'other')

/** Equity exposure by market cap — direct stocks/ETFs and equity funds together. One labelled stacked bar. */
export function MarketCapSplitCard({ householdId, asOf }: Props) {
  const [data, setData] = useState<MarketCapSplit | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getJson<MarketCapSplit>(`/api/market-cap-split?${toQueryString({ household_id: householdId, as_of: asOf })}`)
      .then((d) => { if (active) setData(d) })
      .catch(() => { if (active) setData(null) })
    return () => { active = false }
  }, [householdId, asOf])

  if (!data || data.rows.length === 0) return null

  return (
    <Card title="Market cap split" subtitle={<>Equity <Amount value={data.total} format="compact" /> · stocks and funds</>}>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" /* ui-check-ignore: 2px surface gap between segments */
        aria-label={data.rows.map((r) => `${r.label} ${r.percent}%`).join(', ')}>
        {data.rows.map((r) => (
          <div key={r.key} title={`${r.label}: ${r.percent}%`} style={{ width: `${r.percent}%`, background: capColor(r.key) }} />
        ))}
      </div>
      <ul className="m-0 mt-4 grid list-none gap-1 p-0">
        {data.rows.map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => setOpen(open === r.key ? null : r.key)} aria-expanded={open === r.key}
              className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-md)] px-2 text-left hover:bg-surface-2">
              <ChevronRight className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', open === r.key && 'rotate-90')} aria-hidden />
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: capColor(r.key) }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{r.label}</span>
                <span className="block text-xs text-ink-muted">
                  {Number(r.stocks) > 0 && <>Stocks <Amount value={r.stocks} format="compact" /></>}
                  {Number(r.stocks) > 0 && Number(r.funds) > 0 && ' · '}
                  {Number(r.funds) > 0 && <>Funds <Amount value={r.funds} format="compact" /></>}
                </span>
              </span>
              <span className="text-right">
                <Amount value={r.total} format="compact" className="block text-sm font-semibold text-ink" />
                <span className="block text-xs tabular-nums text-ink-muted">{r.percent}%</span>
              </span>
            </button>
            {open === r.key && (
              <ul className="m-0 mb-2 ml-8 grid list-none gap-1 border-l border-line py-1 pl-3">
                {r.holdings.map((h, i) => (
                  <li key={`${h.name}-${i}`} className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink-2">
                      {h.name} <span className="text-xs text-ink-muted">{h.kind === 'stock' ? 'stock' : 'fund'}</span>
                    </span>
                    <Amount value={h.value} format="compact" className="text-ink-muted" />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">
        Stocks by SEBI band (top 100 large, 101–250 mid, rest small) from NSE index lists; funds by their category.
        Debt, hybrid and gold are left out.
      </p>
    </Card>
  )
}
