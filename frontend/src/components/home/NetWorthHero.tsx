import { Money } from '../common/Money'

type Props = {
  networth: string
  xirr: number | null
  asOf: string
  onDateChange: (d: string) => void
  onRefresh: () => void
  loading?: boolean
  label?: string
}


export function NetWorthHero({ networth, xirr, asOf, onDateChange, onRefresh, loading, label = 'Total Net Worth' }: Props) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 shadow-[var(--shadow-card)]"
      style={{ background: 'var(--hero-bg)', color: 'var(--hero-fg)' }}
    >
      <div className="relative">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs font-medium" style={{ color: 'var(--hero-muted)' }}>{label}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              type="date"
              value={asOf}
              onChange={(e) => onDateChange(e.target.value)}
              className="h-6 w-[5.5rem] rounded-md px-1.5 text-[11px] focus:outline-none focus:ring-1"
              style={{ border: '1px solid var(--hero-line)', background: 'rgba(246,239,226,.08)', color: 'var(--hero-fg)' }}
            />
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="tap flex h-6 w-6 items-center justify-center rounded-md disabled:opacity-50"
              style={{ border: '1px solid var(--hero-line)', background: 'rgba(246,239,226,.08)', color: 'var(--hero-fg)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <p className="font-serif text-2xl font-semibold leading-none tracking-tight">
            {loading ? '—' : <Money value={networth} />}
          </p>
          {xirr !== null && (
            <div
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5"
              style={{ border: '1px solid var(--hero-line)', background: 'rgba(246,239,226,.08)' }}
            >
              <span className="text-[10px] font-medium" style={{ color: 'var(--hero-muted)' }}>XIRR</span>
              <span className={`text-xs font-bold ${xirr >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {xirr >= 0 ? '▲' : '▼'} {(Math.abs(xirr) * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--hero-muted)' }}>
          {new Date(asOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}
