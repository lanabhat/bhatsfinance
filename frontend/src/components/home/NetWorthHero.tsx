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
    <div className="rounded-2xl bg-gradient-to-br from-primary-600 to-primary-700 p-6 text-white shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-primary-100">Total Net Worth</p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={asOf}
            onChange={(e) => onDateChange(e.target.value)}
            className="h-8 rounded-lg border border-primary-400 bg-primary-500/50 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white"
          />
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500/50 text-white hover:bg-primary-500 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </div>
      </div>

      <p className="text-4xl font-black tracking-tight">
        {loading ? '—' : fmtINR(networth)}
      </p>
      <p className="mt-1 text-sm text-primary-200">{new Date(asOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>

      {xirr !== null && (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1">
          <span className="text-xs font-medium text-white">XIRR</span>
          <span className={`text-sm font-bold ${xirr >= 0 ? 'text-green-300' : 'text-red-300'}`}>
            {(xirr * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}
