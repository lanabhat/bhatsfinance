import { Money } from '../common/Money'
import type { InsuranceSummary } from '../../types/domain'

const TYPE_LABELS: Record<string, string> = {
  life: 'Life',
  health: 'Health',
  vehicle: 'Vehicle',
  govt_scheme: 'Govt',
  other: 'Other',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

type Props = {
  summary: InsuranceSummary | null
}

export function InsuranceSummaryCard({ summary }: Props) {
  if (!summary || summary.total_active === 0) return null

  const typeEntries = Object.entries(summary.by_type).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Insurance Coverage</h2>
        <a
          href="#/insurance"
          className="text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
        >
          View all →
        </a>
      </div>

      <div className="overflow-hidden rounded-xl border border-teal-100 bg-teal-50 dark:border-teal-900/40 dark:bg-teal-900/10">
        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-teal-100 dark:divide-teal-900/40 px-4 py-3">
          <div className="pr-4">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Policies</p>
            <p className="mt-0.5 text-lg font-bold text-teal-800 dark:text-teal-300">{summary.total_active}</p>
          </div>
          <div className="px-4">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Sum Insured</p>
            <p className="mt-0.5 text-lg font-bold text-teal-800 dark:text-teal-300">
              <Money value={parseFloat(summary.total_sum_insured)} />
            </p>
          </div>
          <div className="pl-4">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Annual Premium</p>
            <p className="mt-0.5 text-lg font-bold text-teal-800 dark:text-teal-300">
              <Money value={parseFloat(summary.total_annual_premium)} />
            </p>
          </div>
        </div>

        {/* Type breakdown chips */}
        {typeEntries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-teal-100 dark:border-teal-900/40 px-4 py-2">
            {typeEntries.map(([type, count]) => (
              <span
                key={type}
                className="rounded-full bg-teal-100 dark:bg-teal-800/40 px-2.5 py-0.5 text-xs font-medium text-teal-800 dark:text-teal-300"
              >
                {TYPE_LABELS[type] ?? type} {count}
              </span>
            ))}
          </div>
        )}

        {/* Upcoming renewals */}
        {summary.upcoming_renewals.length > 0 && (
          <div className="border-t border-teal-100 dark:border-teal-900/40">
            <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Upcoming renewals · next 60 days
            </p>
            {summary.upcoming_renewals.map((r) => (
              <div
                key={r.policy_id}
                className="flex items-center gap-3 border-b border-teal-100 dark:border-teal-900/30 px-4 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{r.policy_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {r.insurer_name ? `${r.insurer_name} · ` : ''}{TYPE_LABELS[r.policy_type] ?? r.policy_type}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-teal-800 dark:text-teal-300">
                    <Money value={parseFloat(r.premium_amount)} />
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{formatDate(r.due_date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
