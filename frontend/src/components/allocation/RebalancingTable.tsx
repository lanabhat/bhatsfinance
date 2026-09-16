import { useEffect, useState } from 'react'
import { Money } from '../common/Money'
import { DataTable } from '../ui/DataTable'
import type { DataTableColumn } from '../ui/DataTable'
import type { RebalancingRow } from '../../types/domain'

type Props = {
  rows: RebalancingRow[]
  canWrite: boolean
  onSaveTarget: (categoryId: number, targetPercent: string) => Promise<void>
}

function TargetCell({ row, canWrite, onSaveTarget }: { row: RebalancingRow; canWrite: boolean; onSaveTarget: Props['onSaveTarget'] }) {
  const [value, setValue] = useState(row.target_percent)
  const [saving, setSaving] = useState(false)

  // row.target_percent can change after a save/refetch (e.g. applying an
  // age-based suggestion updates several rows at once) — useState's initial
  // value only applies on mount, so without this the input would keep
  // showing a stale value while the real saved target has moved on.
  useEffect(() => {
    if (!saving) setValue(row.target_percent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.target_percent])

  if (row.category_id === null) {
    return <span className="text-xs text-[var(--text-faint)]">—</span>
  }

  const commit = async () => {
    if (value === row.target_percent || !canWrite) return
    const num = parseFloat(value)
    if (Number.isNaN(num) || num < 0) { setValue(row.target_percent); return }
    setSaving(true)
    try {
      await onSaveTarget(row.category_id!, num.toFixed(2))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        min="0"
        max="100"
        step="0.5"
        value={value}
        disabled={!canWrite || saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-16 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-right text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
      />
      <span className="text-xs text-[var(--text-muted)]">%</span>
    </div>
  )
}

const ACTION_STYLES: Record<RebalancingRow['suggested_action'], string> = {
  buy: 'text-emerald-600 dark:text-emerald-400',
  sell: 'text-red-500 dark:text-red-400',
  hold: 'text-[var(--text-muted)]',
}

const ACTION_LABELS: Record<RebalancingRow['suggested_action'], string> = {
  buy: 'Buy',
  sell: 'Sell',
  hold: 'Hold',
}

export function RebalancingTable({ rows, canWrite, onSaveTarget }: Props) {
  const columns: DataTableColumn<RebalancingRow>[] = [
    {
      key: 'category', label: 'Category', sortable: true, searchable: true,
      sortValue: (r) => r.category_name, searchValue: (r) => r.category_name,
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
          <span className="text-[var(--text)]">{r.category_name}</span>
        </span>
      ),
    },
    {
      key: 'current', label: 'Current', align: 'right', sortable: true,
      sortValue: (r) => parseFloat(r.current_percent),
      render: (r) => `${r.current_percent}%`,
    },
    {
      key: 'target', label: 'Target', align: 'right',
      render: (r) => <TargetCell row={r} canWrite={canWrite} onSaveTarget={onSaveTarget} />,
    },
    {
      key: 'drift', label: 'Drift', align: 'right', sortable: true,
      sortValue: (r) => parseFloat(r.drift_percent),
      dataBar: { value: (r) => parseFloat(r.drift_percent), mode: 'diverging' },
      render: (r) => {
        const drift = parseFloat(r.drift_percent)
        return (
          <span className={`font-medium ${drift > 0 ? 'text-amber-600 dark:text-amber-400' : drift < 0 ? 'text-sky-600 dark:text-sky-400' : 'text-[var(--text-muted)]'}`}>
            {drift > 0 ? '+' : ''}{r.drift_percent}%
          </span>
        )
      },
    },
    {
      key: 'value', label: 'Value', align: 'right', sortable: true,
      sortValue: (r) => parseFloat(r.current_value),
      dataBar: { value: (r) => parseFloat(r.current_value) || null },
      render: (r) => <Money value={r.current_value} />,
    },
    {
      key: 'suggested', label: 'Suggested', align: 'right',
      render: (r) => (
        <span className={`text-xs font-semibold ${ACTION_STYLES[r.suggested_action]}`}>
          {r.suggested_action === 'hold' ? ACTION_LABELS.hold : (
            <>{ACTION_LABELS[r.suggested_action]} <Money value={r.suggested_amount} /></>
          )}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.category_id ?? 'uncategorised'}
      defaultSortCol="value"
      defaultSortDir="desc"
      minWidth="min-w-[560px]"
    />
  )
}
