import { useMemo, useState } from 'react'
import { pct, useMoney } from './facts'
import type { Fact } from './facts'

type Props = {
  rows: Fact[]
  selected: Set<string>
  onToggle: (holding: string) => void
}

type Line = {
  holding: string; type: string; classification: string; members: string[]
  value: number; invested: number
}
type SortKey = 'holding' | 'value' | 'invested' | 'gain' | 'share'

/** Every holding in the current view (summed across the selected members); a row
 *  click toggles it in the holding filter. Doubles as the table view of the charts. */
export function FactsTable({ rows, selected, onToggle }: Props) {
  const money = useMoney()
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'value', desc: true })
  const [showAll, setShowAll] = useState(false)

  const lines = useMemo(() => {
    const map = new Map<string, Line>()
    for (const r of rows) {
      const key = `${r.holding}|${r.type}`
      const l = map.get(key) ?? { holding: r.holding, type: r.type, classification: r.classification, members: [], value: 0, invested: 0 }
      l.value += r.value
      l.invested += r.invested
      if (!l.members.includes(r.member)) l.members.push(r.member)
      map.set(key, l)
    }
    return [...map.values()]
  }, [rows])
  const total = lines.reduce((s, l) => s + l.value, 0)

  const gainPct = (l: Line) => (l.invested > 0 ? ((l.value - l.invested) / l.invested) * 100 : 0)
  const sorted = [...lines].sort((a, b) => {
    const v = (l: Line) => sort.key === 'holding' ? l.holding.toLowerCase()
      : sort.key === 'gain' ? gainPct(l) : sort.key === 'share' ? l.value : l[sort.key]
    const [x, y] = [v(a), v(b)]
    const cmp = x < y ? -1 : x > y ? 1 : 0
    return sort.desc ? -cmp : cmp
  })
  const visible = showAll ? sorted : sorted.slice(0, 25)

  const head = (key: SortKey, label: string, right = false, extra = '') => (
    <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] ${right ? 'text-right' : 'text-left'} ${extra}`}>
      <button type="button" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'holding' }))}
        className="hover:text-[var(--text)]">
        {label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-baseline justify-between px-4 pt-4">
        <h3 className="text-sm font-semibold text-[var(--text)]">Holdings in view <span className="font-normal text-[var(--text-muted)]">({lines.length})</span></h3>
        <span className="text-[11px] text-[var(--text-muted)]">Click a row to filter by it</span>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)]">
            <tr>
              {head('holding', 'Holding')}
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] md:table-cell">Type · class</th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] lg:table-cell">Members</th>
              {head('value', 'Value', true)}
              {head('invested', 'Invested', true, 'hidden sm:table-cell')}
              {head('gain', 'Gain %', true)}
              {head('share', 'Share', true, 'hidden sm:table-cell')}
            </tr>
          </thead>
          <tbody>
            {visible.map((l) => {
              const g = gainPct(l)
              return (
                <tr key={`${l.holding}|${l.type}`} onClick={() => onToggle(l.holding)}
                  className={`cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] ${selected.has(l.holding) ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                  <td className="max-w-[260px] truncate px-3 py-2 text-[var(--text)]">{l.holding}</td>
                  <td className="hidden px-3 py-2 text-xs text-[var(--text-muted)] md:table-cell">{l.type} · {l.classification}</td>
                  <td className="hidden max-w-[160px] truncate px-3 py-2 text-xs text-[var(--text-muted)] lg:table-cell">{l.members.join(', ')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text)]">{money.compact(l.value)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums text-[var(--text-muted)] sm:table-cell">{money.compact(l.invested)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${g > 0 ? 'text-emerald-700 dark:text-emerald-400' : g < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text-muted)]'}`}>
                    {l.invested > 0 ? `${g > 0 ? '+' : ''}${g.toFixed(1)}%` : '—'}
                  </td>
                  <td className="hidden px-3 py-2 text-right tabular-nums text-[var(--text-muted)] sm:table-cell">{pct(l.value, total).toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > 25 && (
        <div className="border-t border-[var(--border)] px-4 py-2 text-center">
          <button type="button" onClick={() => setShowAll((s) => !s)} className="text-xs text-primary-600 hover:underline dark:text-primary-300">
            {showAll ? 'Show top 25' : `Show all ${sorted.length}`}
          </button>
        </div>
      )}
    </section>
  )
}
