import { useMaskedFmt } from '../common/Money'

type Props = {
  networth: string
  xirr: number | null
  asOf: string
  onDateChange: (d: string) => void
  onRefresh: () => void
  loading?: boolean
}


export function NetWorthHero({ networth, xirr, asOf, onDateChange, onRefresh, loading }: Props) {
  const fmtINR = useMaskedFmt()
  return (
    <div className="relative overflow-hidden rounded-3xl p-6 text-white shadow-[0_12px_40px_-8px_rgba(99,102,241,0.5)]">
      {/* Gradient base + sheen */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-violet-600 to-purple-600" aria-hidden="true" />
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
      <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-purple-400/20 blur-3xl" aria-hidden="true" />

      <div className="relative">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium text-white/80">Total Net Worth</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={asOf}
              onChange={(e) => onDateChange(e.target.value)}
              className="h-8 rounded-lg border border-white/25 bg-white/15 px-2 text-xs text-white backdrop-blur focus:outline-none focus:ring-1 focus:ring-white"
            />
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="tap flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-white backdrop-blur hover:bg-white/25 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>

        <p className="text-[2.75rem] font-black leading-none tracking-tight drop-shadow-sm md:text-5xl">
          {loading ? '—' : fmtINR(networth)}
        </p>
        <p className="mt-2 text-sm text-white/70">
          {new Date(asOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        {xirr !== null && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 backdrop-blur">
            <span className="text-xs font-medium text-white/90">XIRR</span>
            <span className={`text-sm font-bold ${xirr >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
              {xirr >= 0 ? '▲' : '▼'} {(Math.abs(xirr) * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
