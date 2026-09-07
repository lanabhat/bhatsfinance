import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { aiInsightsApi } from '../../api/aiInsightsApi'
import type { FundClassificationProposal } from '../../types/domain'

type Props = {
  householdId: number
  onClose: () => void
  onApplied: (appliedCount: number) => void
}

type ReviewRow = FundClassificationProposal & { approved: boolean }

const BUCKET_LABELS: Record<string, string> = { equity: 'Equity', debt: 'Debt', hybrid: 'Hybrid' }
const RULE_LABELS: Record<string, string> = { growth: 'Growth (60%)', stability: 'Stability (40%)' }
const BUCKET_OPTIONS = ['equity', 'debt', 'hybrid'] as const
const RULE_OPTIONS = ['growth', 'stability'] as const

/** Wide review dialog for the bulk classify-all flow — deliberately not the
 * shared `Sheet` (capped at max-w-lg, too narrow for a multi-column table).
 * Same portal/overlay/escape-key shape as Sheet, just wider. */
export function BulkClassifyReviewModal({ householdId, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    setError('')
    aiInsightsApi.classifyAllFunds(householdId)
      .then((proposals) => setRows(proposals.map((p) => ({ ...p, approved: !p.error }))))
      .catch((e: unknown) => {
        const msg = e && typeof e === 'object' && 'detail' in e ? String((e as { detail: unknown }).detail) : 'Failed to classify funds.'
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [householdId])

  const updateRow = (instrumentId: number, patch: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((r) => (r.instrument_id === instrumentId ? { ...r, ...patch } : r)))
  }

  const approvedCount = rows.filter((r) => r.approved && !r.error).length

  const apply = async () => {
    setApplying(true)
    setError('')
    try {
      const payload = rows
        .filter((r) => r.approved && !r.error && r.bucket && r.rule_60_40_category)
        .map((r) => ({
          instrument_id: r.instrument_id,
          bucket: r.bucket!,
          rule_60_40_category: r.rule_60_40_category!,
          reasoning: r.reasoning ?? '',
          approved: true,
        }))
      const result = await aiInsightsApi.applyClassifications(payload)
      onApplied(result.applied)
    } catch {
      setError('Failed to apply classifications.')
    } finally {
      setApplying(false)
    }
  }

  const sel = 'rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500'

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="dialog-panel flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-modal)]"
          role="dialog" aria-modal="true" aria-label="Classify all funds with AI"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--text)]">Classify all funds with AI</h3>
              <p className="text-xs text-[var(--text-muted)]">Review each suggestion before applying — nothing is saved until you click Apply.</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]" aria-label="Close">✕</button>
          </div>

          <div className="min-w-0 flex-1 overflow-auto px-5 py-4">
            {loading ? (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">Classifying funds…</p>
            ) : error ? (
              <p className="text-sm text-red-500">{error}</p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">No mutual fund holdings to classify.</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    <th className="py-2 pr-3">Fund</th>
                    <th className="py-2 pr-3">Current</th>
                    <th className="py-2 pr-3">Proposed bucket</th>
                    <th className="py-2 pr-3">Proposed 60/40</th>
                    <th className="py-2 pr-3">Reasoning</th>
                    <th className="py-2 text-center">Approve</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.instrument_id} className="border-b border-[var(--border)] last:border-0 align-top">
                      <td className="py-2.5 pr-3 text-[var(--text)]">{r.instrument_name}</td>
                      {r.error ? (
                        <td colSpan={4} className="py-2.5 pr-3 text-xs text-red-500">Failed: {r.error}</td>
                      ) : (
                        <>
                          <td className="py-2.5 pr-3 text-xs text-[var(--text-muted)]">
                            {r.current_bucket ? `${BUCKET_LABELS[r.current_bucket]} / ${RULE_LABELS[r.current_rule_60_40_category ?? '']}` : '—'}
                          </td>
                          <td className="py-2.5 pr-3">
                            <select className={sel} value={r.bucket} onChange={(e) => updateRow(r.instrument_id, { bucket: e.target.value as ReviewRow['bucket'] })}>
                              {BUCKET_OPTIONS.map((b) => <option key={b} value={b}>{BUCKET_LABELS[b]}</option>)}
                            </select>
                          </td>
                          <td className="py-2.5 pr-3">
                            <select className={sel} value={r.rule_60_40_category} onChange={(e) => updateRow(r.instrument_id, { rule_60_40_category: e.target.value as ReviewRow['rule_60_40_category'] })}>
                              {RULE_OPTIONS.map((c) => <option key={c} value={c}>{RULE_LABELS[c]}</option>)}
                            </select>
                          </td>
                          <td className="max-w-[220px] py-2.5 pr-3 text-xs text-[var(--text-muted)]">{r.reasoning}</td>
                          <td className="py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={r.approved}
                              onChange={(e) => updateRow(r.instrument_id, { approved: e.target.checked })}
                              className="h-4 w-4 rounded border-[var(--border)] text-primary-600 focus:ring-primary-500"
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-4">
            <p className="text-xs text-[var(--text-muted)]">{approvedCount} of {rows.length} approved</p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
              <button
                type="button"
                disabled={applying || approvedCount === 0}
                onClick={apply}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {applying ? 'Applying…' : `Approve ${approvedCount} / Apply`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
