import { useState } from 'react'
import { useMaskedFmt } from '../common/Money'
import { MarkPremiumPaidSheet } from '../insurance/MarkPremiumPaidSheet'
import type { MissedPremiumAlert, OptionItem } from '../../types/domain'

type Props = {
  items: MissedPremiumAlert[]
  accountOptions: OptionItem[]
  onPaid: () => void | Promise<void>
}

export function MissedPremiumsCard({ items, accountOptions, onPaid }: Props) {
  const fmtINR = useMaskedFmt()
  const [sheetTarget, setSheetTarget] = useState<MissedPremiumAlert | null>(null)

  if (items.length === 0) return null

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Insurance Premiums Due</h2>
      </div>
      <div className="overflow-hidden rounded-xl border border-rose-100 bg-rose-50 dark:bg-rose-900/15">
        {items.map((item) => (
          <div key={`${item.policy_id}-${item.due_date}`} className="flex items-center gap-3 border-b border-rose-100 px-4 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text)]">{item.policy_name}</p>
              <p className="text-xs text-[var(--text-muted)]">
                Due {item.due_date}
                {item.member_name ? ` · ${item.member_name}` : ''}
                {item.insurer_name ? ` · ${item.insurer_name}` : ''}
              </p>
            </div>
            <p className="shrink-0 text-sm font-bold text-rose-700 dark:text-rose-300">
              {parseFloat(item.premium_amount) > 0 ? fmtINR(item.premium_amount) : '—'}
            </p>
            <button
              type="button"
              onClick={() => setSheetTarget(item)}
              className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
            >
              Mark paid
            </button>
          </div>
        ))}
      </div>
      {sheetTarget && (
        <MarkPremiumPaidSheet
          alert={sheetTarget}
          accountOptions={accountOptions}
          onClose={() => setSheetTarget(null)}
          onPaid={onPaid}
        />
      )}
    </div>
  )
}
