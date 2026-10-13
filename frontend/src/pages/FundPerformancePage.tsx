import { useQuery } from '@tanstack/react-query'
import { fundPerformanceApi } from '../api/fundPerformanceApi'
import { FundCagrBarChart } from '../components/allocation/FundCagrBarChart'
import { FundDistributionChart } from '../components/allocation/FundDistributionChart'
import { FundPerformanceTable } from '../components/allocation/FundPerformanceTable'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { useApp } from '../context/AppContext'
import type { FundPerformanceRow } from '../types/domain'

export function FundPerformancePage() {
  const { householdId, asOf } = useApp()

  const query = useQuery({
    queryKey: ['fund-performance', householdId, asOf],
    queryFn: () => fundPerformanceApi.get(householdId, asOf),
    enabled: householdId > 0,
  })
  const rows: FundPerformanceRow[] = query.data?.funds ?? []
  const loading = query.isPending
  const error = query.error ? 'Failed to load fund performance data.' : ''

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <CoinSpinner size={48} />
      </div>
    )
  }

  if (error) {
    return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="mb-1 text-sm font-semibold text-[var(--text)]">Fund performance</p>
        <p className="text-xs text-[var(--text-muted)]">
          Distribution, money-weighted returns (XIRR), and point-to-point growth (CAGR) across short and long
          periods, for every mutual fund / SIP holding — use this alongside Asset Allocation and Diversification to
          decide what to rebalance.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">No mutual fund or SIP holdings yet.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <FundDistributionChart rows={rows} />
            <FundCagrBarChart rows={rows} />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-sm font-semibold text-[var(--text)]">Returns by fund</p>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Click a column to sort. CAGR is a simple point-to-point NAV growth rate (not money-weighted, unaffected
              by contribution timing); periods with insufficient history show "—" rather than a fabricated number.
            </p>
            <FundPerformanceTable rows={rows} />
          </div>
        </>
      )}
    </div>
  )
}
