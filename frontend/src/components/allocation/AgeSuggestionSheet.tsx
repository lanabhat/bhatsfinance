import { useEffect, useState } from 'react'
import { allocationTargetApi } from '../../api/allocationTargetApi'
import { householdApi } from '../../api/householdApi'
import type { AllocationSuggestion, Member } from '../../types/domain'

type Props = {
  householdId: number
  asOf: string
  onApplied: () => void
  onClose: () => void
}

const RULE_OPTIONS: { base: 100 | 110 | 120; label: string; blurb: string }[] = [
  { base: 100, label: 'Conservative — 100 minus age', blurb: 'The traditional rule of thumb.' },
  { base: 110, label: 'Balanced — 110 minus age', blurb: 'Accounts for longer life expectancy.' },
  { base: 120, label: 'Growth — 120 minus age', blurb: 'More equity-friendly, for higher risk tolerance.' },
]

export function AgeSuggestionSheet({ householdId, asOf, onApplied, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [memberId, setMemberId] = useState<number | ''>('')
  const [equityBase, setEquityBase] = useState<100 | 110 | 120>(100)
  const [suggestion, setSuggestion] = useState<AllocationSuggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    householdApi.listMembers(householdId).then(setMembers).catch(() => {})
  }, [householdId])

  const selectedMember = members.find((m) => m.id === memberId)

  useEffect(() => {
    if (!memberId || !selectedMember?.date_of_birth) { setSuggestion(null); return }
    setLoading(true)
    setError('')
    allocationTargetApi.getAgeSuggestion(householdId, Number(memberId), equityBase, asOf)
      .then(setSuggestion)
      .catch((e) => setError(e?.detail || 'Failed to get suggestion.'))
      .finally(() => setLoading(false))
  }, [memberId, equityBase, householdId, asOf])

  const coveredRows = suggestion?.categories.filter((c) => c.suggested_target_percent !== null) ?? []
  const uncoveredRows = suggestion?.categories.filter((c) => c.suggested_target_percent === null) ?? []

  const apply = async () => {
    if (!coveredRows.length) return
    setApplying(true)
    setError('')
    try {
      const existing = await allocationTargetApi.list(householdId)
      for (const row of coveredRows) {
        const match = existing.find((t) => t.asset_category === row.category_id)
        if (match) {
          await allocationTargetApi.update(match.id, { target_percent: row.suggested_target_percent! })
        } else {
          await allocationTargetApi.create({ household: householdId, asset_category: row.category_id, target_percent: row.suggested_target_percent! })
        }
      }
      onApplied()
    } catch {
      setError('Failed to apply targets.')
    } finally {
      setApplying(false)
    }
  }

  const sel = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="grid gap-4">
      <p className="text-xs text-[var(--text-muted)]">
        A well-known rule of thumb for a starting equity/debt split, based only on age — not your income,
        goals, or personal risk tolerance. Treat it as a starting point, not a final answer.
      </p>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Member (for age)</label>
        <select value={memberId} onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : '')} className={sel}>
          <option value="">— Select —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        {selectedMember && !selectedMember.date_of_birth && (
          <p className="mt-1 text-xs text-amber-600">No date of birth set for this member — add one in Household &amp; Members first.</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Rule variant</label>
        <div className="grid gap-1.5">
          {RULE_OPTIONS.map((opt) => (
            <button
              key={opt.base}
              type="button"
              onClick={() => setEquityBase(opt.base)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                equityBase === opt.base
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300'
                  : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="block text-xs text-[var(--text-muted)]">{opt.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-center text-xs text-[var(--text-muted)]">Calculating…</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {suggestion && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-sm font-semibold text-[var(--text)]">
            Age {suggestion.age} → {suggestion.equity_percent}% Equity / {suggestion.debt_percent}% Debt
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{suggestion.rule_label}</p>

          {coveredRows.length > 0 && (
            <div className="mt-3 grid gap-1">
              {coveredRows.map((row) => (
                <div key={row.category_id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
                    {row.category_name}
                  </span>
                  <span className="font-medium text-[var(--text)]">{row.suggested_target_percent}%</span>
                </div>
              ))}
            </div>
          )}

          {uncoveredRows.length > 0 && (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Not covered by this rule — set manually: {uncoveredRows.map((r) => r.category_name).join(', ')}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">
          Cancel
        </button>
        <button
          type="button"
          disabled={!coveredRows.length || applying}
          onClick={apply}
          className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {applying ? 'Applying…' : 'Apply as targets'}
        </button>
      </div>
    </div>
  )
}
