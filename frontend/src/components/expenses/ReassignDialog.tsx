import { useState } from 'react'
import type { ExpenseCategory } from '../../types/domain'

type Props = {
  open: boolean
  deletingCategory: ExpenseCategory
  allCategories: ExpenseCategory[]
  expenseCount: number
  onConfirm: (reassignToKey: string) => void
  onCancel: () => void
  saving?: boolean
}

export function ReassignDialog({ open, deletingCategory, allCategories, expenseCount, onConfirm, onCancel, saving }: Props) {
  const [selected, setSelected] = useState('')

  if (!open) return null

  const options = allCategories.filter(c => c.key !== deletingCategory.key)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-6 shadow-xl">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-2xl">{deletingCategory.icon}</span>
          <h2 className="text-base font-semibold text-[var(--text)]">Delete "{deletingCategory.label}"</h2>
        </div>

        {expenseCount > 0 ? (
          <p className="mb-4 text-sm text-[var(--text-2)]">
            <span className="font-medium text-amber-600">{expenseCount} expense{expenseCount > 1 ? 's' : ''}</span> use this category.
            Choose a category to reassign them to before deleting.
          </p>
        ) : (
          <p className="mb-4 text-sm text-[var(--text-2)]">
            No expenses use this category. Select a category to reassign to (required), then confirm deletion.
          </p>
        )}

        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Reassign expenses to</label>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            <option value="">— Select a category —</option>
            {options.map(c => (
              <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || saving}
            onClick={() => onConfirm(selected)}
            className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40"
          >
            {saving ? 'Deleting…' : 'Delete & Reassign'}
          </button>
        </div>
      </div>
    </div>
  )
}
