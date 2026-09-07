import { useMemo, useState } from 'react'
import type { FundComparisonRow } from '../../types/domain'

type Props = { rows: FundComparisonRow[] }

type SortKey = 'name' | 'expense_ratio' | 'xirr' | 'std_dev' | 'beta' | 'alpha' | 'sharpe' | 'overlap' | 'benchmark_gap'

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return -Infinity
  return typeof v === 'number' ? v : parseFloat(v)
}

export function FundComparisonTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('sharpe')
  const [sortDesc, setSortDesc] = useState(true)

  const sorted = useMemo(() => {
    const withKey = [...rows]
    const key = (r: FundComparisonRow): number | string => {
      switch (sortKey) {
        case 'name': return r.instrument_name
        case 'expense_ratio': return num(r.expense_ratio)
        case 'xirr': return num(r.xirr_percent)
        case 'std_dev': return num(r.risk_metrics?.standard_deviation_percent)
        case 'beta': return num(r.risk_metrics?.beta)
        case 'alpha': return num(r.risk_metrics?.alpha_percent)
        case 'sharpe': return num(r.risk_metrics?.sharpe_ratio)
        case 'overlap': return r.max_overlap_percent
        case 'benchmark_gap': return num(r.benchmark_comparison?.periods?.['3Y']?.gap_percent)
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
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <th className="cursor-pointer select-none py-2 pr-3 hover:text-[var(--text)]" onClick={() => setSort('name')}>
              Name{sortKey === 'name' ? (sortDesc ? ' ▼' : ' ▲') : ''}
            </th>
            {th('expense_ratio', 'Expense')}
            {th('xirr', 'XIRR')}
            {th('std_dev', 'Std Dev')}
            {th('beta', 'Beta')}
            {th('alpha', 'Alpha')}
            {th('sharpe', 'Sharpe')}
            {th('overlap', 'Overlap')}
            <th className="py-2 pr-3 text-right">Benchmark</th>
            {th('benchmark_gap', '3Y vs Benchmark')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const rm = r.risk_metrics
            return (
              <tr key={r.instrument_id} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2.5 pr-3">
                  <p className="text-[var(--text)]">{r.instrument_name}</p>
                  {r.fund_category && <p className="text-xs text-[var(--text-muted)]">{r.fund_category}</p>}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--text)]">
                  {r.expense_ratio ? `${r.expense_ratio}%` : '—'}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--text)]">
                  {r.xirr_percent !== null ? `${r.xirr_percent.toFixed(1)}%` : '—'}
                </td>
                {rm?.available ? (
                  <>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--text)]">{rm.standard_deviation_percent}%</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--text)]">{rm.beta ?? '—'}</td>
                    <td className={`py-2.5 pr-3 text-right tabular-nums font-medium ${(rm.alpha_percent ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {rm.alpha_percent !== null ? `${rm.alpha_percent}%` : '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums font-medium text-[var(--text)]">{rm.sharpe_ratio ?? '—'}</td>
                  </>
                ) : (
                  <td colSpan={4} className="py-2.5 pr-3 text-right text-xs text-[var(--text-faint)]">
                    {r.linked_to_nav_source ? (rm?.reason ?? 'Not enough data') : 'Not linked to NAV data'}
                  </td>
                )}
                <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--text)]">
                  {r.max_overlap_percent > 0 ? `${r.max_overlap_percent.toFixed(1)}%` : '—'}
                </td>
                {r.benchmark_comparison?.available ? (
                  <>
                    <td className="py-2.5 pr-3 text-right text-xs text-[var(--text-muted)]">
                      {r.benchmark_comparison.benchmark_name?.split('(')[0].trim()}
                    </td>
                    <td
                      className={`py-2.5 text-right tabular-nums font-medium ${
                        r.benchmark_comparison.underperforming ? 'text-red-500' : 'text-emerald-600'
                      }`}
                    >
                      {r.benchmark_comparison.periods?.['3Y']?.gap_percent !== null && r.benchmark_comparison.periods?.['3Y']?.gap_percent !== undefined
                        ? `${r.benchmark_comparison.periods['3Y'].gap_percent! >= 0 ? '+' : ''}${r.benchmark_comparison.periods['3Y'].gap_percent}%`
                        : '—'}
                    </td>
                  </>
                ) : (
                  <td colSpan={2} className="py-2.5 text-right text-xs text-[var(--text-faint)]">
                    {r.benchmark_comparison?.reason ?? 'No matching benchmark'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
