import { useMemo, useState } from 'react'
import type { FundPerformanceRow } from '../../types/domain'

type Props = { rows: FundPerformanceRow[] }

type SortKey = 'name' | 'allocation' | 'xirr' | '3M' | '6M' | '1Y' | '3Y' | '5Y'

const PERIOD_KEYS: SortKey[] = ['3M', '6M', '1Y', '3Y', '5Y']

function num(v: number | null | undefined): number {
  return v === null || v === undefined ? -Infinity : v
}

function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`
}

export function FundPerformanceTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('allocation')
  const [sortDesc, setSortDesc] = useState(true)

  const sorted = useMemo(() => {
    const withKey = [...rows]
    const key = (r: FundPerformanceRow): number | string => {
      switch (sortKey) {
        case 'name': return r.instrument_name
        case 'allocation': return num(parseFloat(r.allocation_percent))
        case 'xirr': return num(r.xirr)
        default: return num(r.cagr[sortKey as keyof typeof r.cagr])
      }
    }
    withKey.sort((a, b) => {
      const ka = key(a), kb = key(b)
      const cmp = typeof ka === 'string' ? ka.localeCompare(kb as string) : (ka as number) - (kb as number)
      return sortDesc ? -cmp : cmp
    })
    return withKey
  }, [rows, sortKey, sortDesc])

  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((p) => !p)
    else { setSortKey(key); setSortDesc(true) }
  }

  const th = (key: SortKey, label: string) => (
    <th
      className="cursor-pointer select-none py-2 pr-3 text-right hover:text-[var(--text)]"
      onClick={() => setSort(key)}
    >
      {label}{sortKey === key ? (sortDesc ? ' ▼' : ' ▲') : ''}
    </th>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <th className="cursor-pointer select-none py-2 pr-3 hover:text-[var(--text)]" onClick={() => setSort('name')}>
              Fund{sortKey === 'name' ? (sortDesc ? ' ▼' : ' ▲') : ''}
            </th>
            {th('allocation', 'Allocation %')}
            {th('xirr', 'XIRR')}
            {PERIOD_KEYS.map((p) => th(p, `CAGR ${p}`))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.instrument_id} className="border-b border-[var(--border)] last:border-0">
              <td className="py-2.5 pr-3">
                <p className="text-[var(--text)]">{r.instrument_name}</p>
                {r.fund_sub_category && <p className="text-xs text-[var(--text-muted)]">{r.fund_sub_category}</p>}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--text)]">
                {parseFloat(r.allocation_percent).toFixed(1)}%
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums font-medium text-[var(--text)]">
                {r.xirr !== null ? `${(r.xirr * 100).toFixed(1)}%` : '—'}
              </td>
              {PERIOD_KEYS.map((p) => (
                <td
                  key={p}
                  className={`py-2.5 pr-3 text-right tabular-nums ${
                    r.cagr[p] === null ? 'text-[var(--text-faint)]' : (r.cagr[p]! >= 0 ? 'text-emerald-600' : 'text-red-500')
                  }`}
                  title={r.cagr[p] === null ? 'Not enough history' : undefined}
                >
                  {pct(r.cagr[p])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
