import { useState } from 'react'
import type { ExpenseCategory, OptionItem, Transaction } from '../../types/domain'

type Props = {
  open: boolean
  transaction: Transaction
  categories: ExpenseCategory[]
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  onSave: (patch: {
    tx_date: string
    amount: string
    account: number
    member: number | null
    spend_category: string
    description: string
    notes: string
  }) => Promise<void>
  onCancel: () => void
  saving?: boolean
  error?: string
}

export function EditSpendDialog({ open, transaction, categories, memberOptions, accountOptions, onSave, onCancel, saving, error }: Props) {
  const [txDate, setTxDate] = useState(transaction.tx_date)
  const [amount, setAmount] = useState(transaction.amount)
  const [account, setAccount] = useState(transaction.account != null ? String(transaction.account) : '')
  const [member, setMember] = useState(transaction.member != null ? String(transaction.member) : '')
  const [spendCategory, setSpendCategory] = useState(transaction.spend_category || 'other')
  const [description, setDescription] = useState(transaction.description)
  const [notes, setNotes] = useState(transaction.notes)

  if (!open) return null

  const canSave = txDate.trim() !== '' && amount.trim() !== '' && account !== ''

  function handleSave() {
    if (!canSave) return
    void onSave({
      tx_date: txDate,
      amount,
      account: Number(account),
      member: member ? Number(member) : null,
      spend_category: spendCategory,
      description,
      notes,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-[var(--text)]">Edit transaction</h2>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Changing amount or account creates a corrected replacement. Other fields update in place.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--text-2)]">Date</span>
              <input
                type="date"
                value={txDate}
                onChange={e => setTxDate(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--text-2)]">Amount</span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-2)]">Account</span>
            <select
              value={account}
              onChange={e => setAccount(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">— select —</option>
              {accountOptions.map(a => <option key={a.id} value={String(a.id)}>{a.label}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--text-2)]">Category</span>
              <select
                value={spendCategory}
                onChange={e => setSpendCategory(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {categories.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--text-2)]">Member</span>
              <select
                value={member}
                onChange={e => setMember(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">— none —</option>
                {memberOptions.map(m => <option key={m.id} value={String(m.id)}>{m.label}</option>)}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-2)]">Description</span>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-2)]">Notes</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
