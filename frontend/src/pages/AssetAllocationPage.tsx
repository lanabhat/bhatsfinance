import { useEffect, useMemo, useState } from 'react'
import { aiInsightsApi } from '../api/aiInsightsApi'
import { allocationTargetApi } from '../api/allocationTargetApi'
import { portfolioApi } from '../api/portfolioApi'
import { AgeSuggestionSheet } from '../components/allocation/AgeSuggestionSheet'
import { AllocationChart } from '../components/allocation/AllocationChart'
import { ExcludedHoldingsPanel } from '../components/allocation/ExcludedHoldingsPanel'
import { RebalancingTable } from '../components/allocation/RebalancingTable'
import { AiInsightCard } from '../components/common/AiInsightCard'
import { Money } from '../components/common/Money'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { Sheet } from '../components/ui/Sheet'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import type { Instrument, RebalancingPayload } from '../types/domain'

export function AssetAllocationPage() {
  const { canWrite } = useAuth()
  const { householdId, categories, dashboard, asOf } = useApp()

  const [data, setData] = useState<RebalancingPayload | null>(null)
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAgeSheet, setShowAgeSheet] = useState(false)

  const load = async () => {
    if (!householdId) return
    setLoading(true)
    setError('')
    try {
      const [rebalancing, insts] = await Promise.all([
        allocationTargetApi.getRebalancing(householdId, asOf),
        portfolioApi.listInstruments(householdId),
      ])
      setData(rebalancing)
      setInstruments(insts)
    } catch {
      setError('Failed to load allocation data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [householdId, asOf])

  const targetsTotal = useMemo(() => {
    if (!data) return 0
    return data.rows.reduce((sum, r) => sum + parseFloat(r.target_percent), 0)
  }, [data])

  const saveTarget = async (categoryId: number, targetPercent: string) => {
    if (!householdId) return
    const existing = await allocationTargetApi.list(householdId)
    const row = existing.find((t) => t.asset_category === categoryId)
    if (row) {
      await allocationTargetApi.update(row.id, { target_percent: targetPercent })
    } else {
      await allocationTargetApi.create({ household: householdId, asset_category: categoryId, target_percent: targetPercent })
    }
    await load()
  }

  const toggleInclude = async (instrumentId: number, includeInRebalancing: boolean) => {
    await portfolioApi.updateInstrument(instrumentId, { include_in_rebalancing: includeInRebalancing })
    await load()
  }

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <CoinSpinner size={48} />
      </div>
    )
  }

  if (error) {
    return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="grid gap-4">
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-3xl">🎯</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-2)]">No holdings to allocate yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Add holdings and tag them with an asset category to get started.</p>
        </div>
      </div>
    )
  }

  const uncategorised = data.rows.find((r) => r.category_id === null)

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Rebalancing base</p>
          <p className="mt-1 text-lg font-bold text-[var(--text)]"><Money value={data.total_portfolio_value} /></p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Excluded from rebalancing</p>
          <p className="mt-1 text-lg font-bold text-[var(--text-muted)]"><Money value={data.excluded_value} /></p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--text-muted)]">Targets set</p>
          <p className={`mt-1 text-lg font-bold ${Math.abs(targetsTotal - 100) < 0.01 ? 'text-emerald-600' : 'text-[var(--text)]'}`}>
            {targetsTotal.toFixed(1)}%
            {Math.abs(targetsTotal - 100) >= 0.01 && (
              <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">
                ({(100 - targetsTotal).toFixed(1)}% unallocated)
              </span>
            )}
          </p>
        </div>
      </div>

      {uncategorised && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
          <span className="mt-0.5 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              <Money value={uncategorised.current_value} /> in uncategorised holdings
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Uncategorised holdings can't be targeted directly — tag them with an asset category from Assets → Manage first (use bulk-tag for several at once).
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="mb-3 text-sm font-semibold text-[var(--text)]">Current vs Target</p>
        <AllocationChart rows={data.rows} />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--text)]">Rebalancing</p>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowAgeSheet(true)}
              className="rounded-lg border border-indigo-300 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
            >
              Suggest targets for my age
            </button>
          )}
        </div>
        <RebalancingTable rows={data.rows} canWrite={canWrite} onSaveTarget={saveTarget} />
      </div>

      <AiInsightCard
        title="Explain my rebalancing"
        canWrite={canWrite}
        emptyHint="Generate a plain-English explanation of your current rebalancing picture."
        fetchCached={() => aiInsightsApi.getRebalancingExplanation(householdId, data.as_of)}
        generate={() => aiInsightsApi.explainRebalancing(householdId, data.as_of)}
      >
        {(explanation) => <p className="whitespace-pre-wrap text-sm text-[var(--text-2)]">{explanation.explanation}</p>}
      </AiInsightCard>

      <ExcludedHoldingsPanel
        holdings={dashboard.holdings}
        instruments={instruments}
        canWrite={canWrite}
        onToggle={toggleInclude}
      />

      <p className="text-center text-xs text-[var(--text-faint)]">
        {categories.length} categories · as of {data.as_of}
      </p>

      {showAgeSheet && (
        <Sheet title="Suggest targets for my age" onClose={() => setShowAgeSheet(false)}>
          <AgeSuggestionSheet
            householdId={householdId}
            asOf={asOf}
            onApplied={async () => { setShowAgeSheet(false); await load() }}
            onClose={() => setShowAgeSheet(false)}
          />
        </Sheet>
      )}
    </div>
  )
}
