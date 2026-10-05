import { useEffect, useState } from 'react'
import { getJson, toQueryString } from '../../api/http'
import { useMaskedFmt } from '../common/Money'
import type { MarketCapSplit } from '../../types/domain'

type Props = { householdId: number; asOf: string }

const CAP_COLOR: Record<string, string> = {
  large_cap: 'bg-indigo-600 dark:bg-indigo-400',
  mid_cap: 'bg-sky-500 dark:bg-sky-400',
  small_cap: 'bg-amber-500 dark:bg-amber-400',
  multi: 'bg-violet-400 dark:bg-violet-300',
  unclassified: 'bg-slate-300 dark:bg-slate-600',
}

/** Equity exposure split by market cap — direct stocks/ETFs and equity funds together. */
export function MarketCapSplitCard({ householdId, asOf }: Props) {
  const fmt = useMaskedFmt()
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
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Market cap split</h2>
        <span className="text-[11px] text-[var(--text-muted)]">Equity {fmt(data.total)} · stocks + funds</span>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex h-3 gap-px overflow-hidden rounded-lg bg-[var(--surface-2)]">
          {data.rows.map((r) => (
            <div key={r.key} title={`${r.label}: ${r.percent}%`} style={{ width: `${r.percent}%` }} className={CAP_COLOR[r.key]} />
          ))}
        </div>
        <div className="mt-3 grid gap-1">
          {data.rows.map((r) => (
            <div key={r.key}>
              <button type="button" onClick={() => setOpen(open === r.key ? null : r.key)}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-[var(--surface-2)]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CAP_COLOR[r.key]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--text)]">{r.label}</span>
                  <span className="block text-[11px] text-[var(--text-muted)]">
                    {Number(r.stocks) > 0 && `Stocks ${fmt(r.stocks)}`}
                    {Number(r.stocks) > 0 && Number(r.funds) > 0 && ' · '}
                    {Number(r.funds) > 0 && `Funds ${fmt(r.funds)}`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums text-[var(--text)]">{fmt(r.total)}</span>
                  <span className="block text-[11px] tabular-nums text-[var(--text-muted)]">{r.percent}%</span>
                </span>
              </button>
              {open === r.key && (
                <ul className="mb-1 ml-6 grid gap-0.5 border-l border-[var(--border)] pl-3">
                  {r.holdings.map((h, i) => (
                    <li key={`${h.name}-${i}`} className="flex justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-[var(--text-2)]">
                        {h.name}
                        <span className="ml-1 text-[10px] text-[var(--text-muted)]">{h.kind === 'stock' ? 'stock' : 'fund'}</span>
                      </span>
                      <span className="tabular-nums text-[var(--text-muted)]">{fmt(h.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          Stocks by SEBI band (top 100 large, 101–250 mid, rest small) from NSE index lists; funds by their category.
          Debt, hybrid and gold are left out.
        </p>
      </div>
    </div>
  )
}
