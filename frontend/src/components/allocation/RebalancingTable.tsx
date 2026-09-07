import { useEffect, useState } from 'react'
import { Money } from '../common/Money'
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3 text-right">Current</th>
            <th className="py-2 pr-3 text-right">Target</th>
            <th className="py-2 pr-3 text-right">Drift</th>
            <th className="py-2 pr-3 text-right">Value</th>
            <th className="py-2 text-right">Suggested</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const drift = parseFloat(r.drift_percent)
            return (
              <tr key={r.category_id ?? 'uncategorised'} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                    <span className="text-[var(--text)]">{r.category_name}</span>
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--text)]">{r.current_percent}%</td>
                <td className="py-2.5 pr-3">
                  <TargetCell row={r} canWrite={canWrite} onSaveTarget={onSaveTarget} />
                </td>
                <td className={`py-2.5 pr-3 text-right tabular-nums font-medium ${drift > 0 ? 'text-amber-600 dark:text-amber-400' : drift < 0 ? 'text-sky-600 dark:text-sky-400' : 'text-[var(--text-muted)]'}`}>
                  {drift > 0 ? '+' : ''}{r.drift_percent}%
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--text-muted)]">
                  <Money value={r.current_value} />
                </td>
                <td className={`py-2.5 text-right text-xs font-semibold ${ACTION_STYLES[r.suggested_action]}`}>
                  {r.suggested_action === 'hold' ? ACTION_LABELS.hold : (
                    <>
                      {ACTION_LABELS[r.suggested_action]} <Money value={r.suggested_amount} />
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
