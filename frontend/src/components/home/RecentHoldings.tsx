import { useMaskedFmt } from '../common/Money'
import type { DashboardHolding } from '../../types/domain'

type Props = {
  holdings: DashboardHolding[]
  onViewAll: () => void
}

const TYPE_ICONS: Record<string, string> = {
  mutual_fund: '📊', equity: '📈', fd: '🏦', rd: '🏦', epf: '🛡',
  ppf: '🛡', nps: '🛡', gold: '🪙', real_estate: '🏠', sip: '🔄',
  insurance: '☂️', other: '💼',
}


export function RecentHoldings({ holdings, onViewAll }: Props) {
  const fmtINR = useMaskedFmt()
  const top = [...holdings].sort((a, b) => parseFloat(b.market_value) - parseFloat(a.market_value)).slice(0, 5)
  if (!top.length) return null

  const total = holdings.reduce((s, h) => s + parseFloat(h.market_value), 0)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Top Holdings</h2>
        <button type="button" onClick={onViewAll} className="text-xs font-medium text-primary-600 hover:text-primary-700">
          View all →
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {top.map((h, i) => {
          const pct = total > 0 ? ((parseFloat(h.market_value) / total) * 100) : 0
          const gain = parseFloat(h.market_value) - parseFloat(h.net_invested)
          const gainPct = parseFloat(h.net_invested) > 0 ? (gain / parseFloat(h.net_invested)) * 100 : null
          return (
            <div key={h.instrument_id} className={`px-4 py-3 ${i < top.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-base">
                  {TYPE_ICONS[h.instrument_type] ?? '💼'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{h.instrument_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{h.instrument_type.replace(/_/g, ' ')}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-[var(--text)]">{fmtINR(h.market_value)}</p>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs text-[var(--text-muted)]">{pct.toFixed(1)}% of portfolio</span>
                    {gainPct !== null && (
                      <span className={`text-xs font-medium ${gain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {total > 0 && (
                <div className="mt-2 h-1 w-full rounded-full bg-[var(--surface-2)]">
                  <div className="h-1 rounded-full bg-indigo-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
