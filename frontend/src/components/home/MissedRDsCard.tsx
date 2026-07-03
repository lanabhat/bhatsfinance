import { useState } from 'react'
import { Money } from '../common/Money'
import { MarkRDPaidSheet } from './MarkRDPaidSheet'
import { MarkAllRDsPaidSheet } from './MarkAllRDsPaidSheet'
import type { MissedRDAlert, OptionItem } from '../../types/domain'

type Props = {
  items: MissedRDAlert[]
  accountOptions: OptionItem[]
  onPaid: () => void | Promise<void>
}

export function MissedRDsCard({ items, accountOptions, onPaid }: Props) {
  const [paidSheetTarget, setPaidSheetTarget] = useState<MissedRDAlert | null>(null)
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false)

  if (items.length === 0) return null

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Missed RD Installments</h2>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => setBulkSheetOpen(true)}
            className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800"
          >
            Mark all paid →
          </button>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-amber-100 bg-amber-50 dark:bg-amber-900/15">
        {items.map((rd) => (
          <div key={`${rd.mandate_id}-${rd.due_date}`} className="flex items-center gap-3 border-b border-amber-100 px-4 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text)]">{rd.instrument}</p>
              <p className="text-xs text-[var(--text-muted)]">Due {rd.due_date} · {rd.account}</p>
            </div>
            <Money value={rd.expected_amount} className="shrink-0 text-sm font-bold text-amber-700 dark:text-amber-300" />
            <button
              type="button"
              onClick={() => setPaidSheetTarget(rd)}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              Mark paid
            </button>
          </div>
        ))}
      </div>

      {paidSheetTarget && (
        <MarkRDPaidSheet
          alert={paidSheetTarget}
          accountOptions={accountOptions}
          onClose={() => setPaidSheetTarget(null)}
          onPaid={onPaid}
        />
      )}

      {bulkSheetOpen && (
        <MarkAllRDsPaidSheet
          alerts={items}
          accountOptions={accountOptions}
          onClose={() => setBulkSheetOpen(false)}
          onPaid={onPaid}
        />
      )}
    </div>
  )
}
