import { DataTable } from '../ui/DataTable'
import type { DataTableColumn } from '../ui/DataTable'
import type { OverlapPair } from '../../types/domain'

type Props = { pairs: OverlapPair[] }

/** Sequential intensity for overlap % — higher overlap reads as a stronger amber
 * wash (concentration risk), not a categorical color (this isn't identity, it's
 * magnitude on a single dimension). Kept as-is rather than switched to a generic
 * dataBar — this bucketed wash is a deliberate existing visual, not equivalent
 * to a continuous bar. */
function intensityStyle(percent: number) {
  if (percent >= 40) return { background: 'rgba(217, 119, 6, 0.22)', color: 'rgb(180, 83, 9)' }
  if (percent >= 20) return { background: 'rgba(217, 119, 6, 0.12)', color: 'rgb(180, 83, 9)' }
  if (percent >= 5) return { background: 'rgba(217, 119, 6, 0.05)' }
  return {}
}

function SharedHoldings({ pair }: { pair: OverlapPair }) {
  return (
    <div className="px-3 py-2">
      {pair.shared_holdings.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No shared holdings.</p>
      ) : (
        <div className="grid gap-1">
          {pair.shared_holdings.slice(0, 10).map((h) => (
            <div key={h.isin} className="flex items-center justify-between text-xs">
              <span className="truncate text-[var(--text-2)]">{h.name}</span>
              <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{h.weight_a}% / {h.weight_b}%</span>
            </div>
          ))}
          {pair.shared_holdings.length > 10 && (
            <p className="text-xs text-[var(--text-faint)]">+{pair.shared_holdings.length - 10} more</p>
          )}
        </div>
      )}
    </div>
  )
}

export function OverlapTable({ pairs }: Props) {
  if (pairs.length === 0) {
    return <p className="py-4 text-center text-xs text-[var(--text-muted)]">Upload holdings for at least 2 funds to see overlap.</p>
  }

  const columns: DataTableColumn<OverlapPair>[] = [
    {
      key: 'pair', label: 'Fund pair', sortable: true, searchable: true,
      sortValue: (p) => `${p.instrument_a_name} ${p.instrument_b_name}`,
      searchValue: (p) => `${p.instrument_a_name} ${p.instrument_b_name}`,
      render: (p) => <>{p.instrument_a_name} <span className="text-[var(--text-faint)]">×</span> {p.instrument_b_name}</>,
    },
    {
      key: 'overlap', label: 'Overlap', align: 'right', sortable: true,
      sortValue: (p) => parseFloat(p.overlap_percent),
      render: (p) => (
        <span className="inline-block rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums" style={intensityStyle(parseFloat(p.overlap_percent))}>
          {p.overlap_percent}%
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={pairs}
      rowKey={(p) => `${p.instrument_a_id}-${p.instrument_b_id}`}
      defaultSortCol="overlap"
      defaultSortDir="desc"
      minWidth="min-w-[420px]"
      renderExpanded={(p) => <SharedHoldings pair={p} />}
    />
  )
}
