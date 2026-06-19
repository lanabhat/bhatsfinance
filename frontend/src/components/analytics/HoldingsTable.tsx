import { useState, useMemo } from 'react'
import { useMaskedFmt } from '../common/Money'
import type { DashboardHolding, CategoryBreakdownItem } from '../../types/domain'

type SortKey = 'name' | 'type' | 'category' | 'invested' | 'current' | 'gain' | 'gainPct'
type SortDir = 'asc' | 'desc'

type Props = {
  holdings: DashboardHolding[]
  categoryBreakdown: CategoryBreakdownItem[]
}

const TYPE_LABELS: Record<string, string> = {
  equity: 'Equity', mutual_fund: 'Mutual Fund', fd: 'FD', rd: 'RD',
  epf: 'EPF', ppf: 'PPF', nps: 'NPS', gold: 'Gold',
  real_estate: 'Real Estate', sip: 'SIP', insurance: 'Insurance',
  cash: 'Cash', vehicle: 'Vehicle', liability: 'Liability', other: 'Other',
}

export function HoldingsTable({ holdings, categoryBreakdown }: Props) {
  const fmt = useMaskedFmt()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('gainPct')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const catMap = useMemo(() => {
    const m: Record<number, string> = {}
    for (const c of categoryBreakdown) if (c.category_id) m[c.category_id] = c.category_name
    return m
  }, [categoryBreakdown])

  const rows = useMemo(() => {
    const enriched = holdings.map(h => {
      const invested = parseFloat(h.net_invested)
      const current = parseFloat(h.market_value)
      const gain = current - invested
      const gainPct = invested > 0 ? (gain / invested) * 100 : null
      return { ...h, invested, current, gain, gainPct, catName: h.asset_category ? catMap[h.asset_category] ?? '—' : '—' }
    })

    const filtered = search
      ? enriched.filter(r => r.instrument_name.toLowerCase().includes(search.toLowerCase()))
      : enriched

    return [...filtered].sort((a, b) => {
      let va: number | string = 0
      let vb: number | string = 0
      if (sortKey === 'name') { va = a.instrument_name; vb = b.instrument_name }
      else if (sortKey === 'type') { va = a.instrument_type; vb = b.instrument_type }
      else if (sortKey === 'category') { va = a.catName; vb = b.catName }
      else if (sortKey === 'invested') { va = a.invested; vb = b.invested }
      else if (sortKey === 'current') { va = a.current; vb = b.current }
      else if (sortKey === 'gain') { va = a.gain; vb = b.gain }
      else if (sortKey === 'gainPct') { va = a.gainPct ?? -Infinity; vb = b.gainPct ?? -Infinity }

      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
  }, [holdings, search, sortKey, sortDir, catMap])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      onClick={() => toggleSort(k)}
      className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] hover:text-[var(--text)]"
    >
      {label}{sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search holdings…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-primary-400 w-56"
        />
        <span className="text-xs text-[var(--text-muted)]">{rows.length} holdings</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-2)]">
            <tr>
              <Th k="name" label="Name" />
              <Th k="type" label="Type" />
              <Th k="category" label="Category" />
              <Th k="invested" label="Invested" />
              <Th k="current" label="Current" />
              <Th k="gain" label="Gain (₹)" />
              <Th k="gainPct" label="Gain %" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">No holdings found</td></tr>
            ) : rows.map(r => {
              const pos = r.gain >= 0
              return (
                <tr key={r.instrument_id} className="bg-[var(--surface)] transition-colors hover:bg-[var(--surface-2)]">
                  <td className="max-w-[200px] truncate px-3 py-2.5 font-medium text-[var(--text)]" title={r.instrument_name}>{r.instrument_name}</td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)]">{TYPE_LABELS[r.instrument_type] ?? r.instrument_type}</td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)]">{r.catName}</td>
                  <td className="px-3 py-2.5 text-[var(--text)]">{fmt(r.invested)}</td>
                  <td className="px-3 py-2.5 text-[var(--text)]">{fmt(r.current)}</td>
                  <td className={`px-3 py-2.5 font-medium ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                    {pos ? '+' : ''}{fmt(r.gain)}
                  </td>
                  <td className={`px-3 py-2.5 font-medium ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                    {r.gainPct !== null ? `${pos ? '+' : ''}${r.gainPct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
