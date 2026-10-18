import { CoinSpinner } from '../common/CoinSpinner'
import { apiErrorText } from '../../hooks/errorUtils'
import { ChangeSummary } from './ChangeSummary'
import type { ChangeSummary as Summary } from '../../api/importApi'

export type PreviewSection = { title?: string; summary: Summary; fileDate?: string }

/** "What this import will change" box shown on a wizard's confirm step. */
export function ChangePreviewPanel({ loading, error, sections }: {
  loading: boolean
  error: unknown
  sections: PreviewSection[] | undefined
}) {
  return (
    <section className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:p-4" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">What this import will change</h3>
        <p className="text-xs text-[var(--text-muted)]">Nothing is saved until you click Apply.</p>
      </div>
      {loading && !sections ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><CoinSpinner size={20} /> Working out the changes…</div>
      ) : error ? (
        <p className="text-sm text-[var(--negative)]">Couldn’t preview the changes: {apiErrorText(error, 'request failed')}</p>
      ) : (
        (sections ?? []).map((s, i) => (
          <div key={i} className="grid gap-1.5">
            {s.title && <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{s.title}</p>}
            <ChangeSummary summary={s.summary} fileDate={s.fileDate} />
          </div>
        ))
      )}
      {loading && sections && <p className="text-xs text-[var(--text-muted)]">Updating…</p>}
    </section>
  )
}
