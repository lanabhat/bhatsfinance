import { useMaskedFmt } from '../common/Money'
import type { MaturingFD } from '../../types/domain'

type Props = {
  items: MaturingFD[]
  windowDays: number
}

function formatRemaining(days: number): string {
  if (days === 0) return 'Matures today'
  if (days === 1) return '1 day left'
  if (days < 30) return `${days} days left`
  const months = Math.round(days / 30)
  return months === 1 ? '~1 month left' : `~${months} months left`
}

export function MaturingFDsCard({ items, windowDays }: Props) {
  const fmtINR = useMaskedFmt()
  if (items.length === 0) return null

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Maturing Soon</h2>
        <span className="text-[10px] text-[var(--text-muted)]">Next {windowDays} days</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-amber-100 bg-amber-50">
        {items.map((fd, i) => {
          const elapsedPct = fd.total_tenure_days > 0
            ? Math.min(100, (fd.elapsed_days / fd.total_tenure_days) * 100)
            : 0
          const isLast = i === items.length - 1
          return (
            <div key={fd.instrument_id} className={`px-4 py-3 ${isLast ? '' : 'border-b border-amber-100'}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-base">🏦</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{fd.instrument_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {fd.annual_rate}% · matures {fd.maturity_date}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-amber-800">{fmtINR(fd.maturity_value)}</p>
                  <p className="text-xs text-[var(--text-muted)]">{formatRemaining(fd.days_remaining)}</p>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-amber-100">
                <div className="h-1.5 rounded-full bg-amber-500 transition-all" style={{ width: `${elapsedPct}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                <span>now: {fmtINR(fd.current_value)}</span>
                <span>{Math.round(elapsedPct)}% of tenure elapsed</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
