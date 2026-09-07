import { useEffect, useState } from 'react'
import { aiInsightsApi } from '../api/aiInsightsApi'
import { diversificationApi } from '../api/diversificationApi'
import { fundDataApi } from '../api/fundDataApi'
import { portfolioApi } from '../api/portfolioApi'
import { LinkFundSheet } from '../components/allocation/LinkFundSheet'
import { OverlapTable } from '../components/allocation/OverlapTable'
import { TopHoldingsTable } from '../components/allocation/TopHoldingsTable'
import { UploadHoldingsSheet } from '../components/allocation/UploadHoldingsSheet'
import { FundComparisonTable } from '../components/allocation/FundComparisonTable'
import { AiInsightCard } from '../components/common/AiInsightCard'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { Sheet } from '../components/ui/Sheet'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import type { DiversificationPayload, FundComparisonPayload, Instrument } from '../types/domain'

type Tab = 'overlap' | 'compare'
type SheetState = { type: 'none' } | { type: 'upload' } | { type: 'link' }

export function DiversificationPage() {
  const { canWrite } = useAuth()
  const { householdId, asOf } = useApp()

  const [tab, setTab] = useState<Tab>('overlap')
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [diversification, setDiversification] = useState<DiversificationPayload | null>(null)
  const [comparison, setComparison] = useState<FundComparisonPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' })
  const [compareInstrumentId, setCompareInstrumentId] = useState<number | ''>('')

  const load = async () => {
    if (!householdId) return
    setLoading(true)
    setError('')
    try {
      const [insts, div, comp] = await Promise.all([
        portfolioApi.listInstruments(householdId),
        diversificationApi.get(householdId, asOf),
        fundDataApi.getComparison(householdId, asOf),
      ])
      setInstruments(insts)
      setDiversification(div)
      setComparison(comp)
    } catch {
      setError('Failed to load diversification data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [householdId, asOf])

  const mfInstruments = instruments.filter((i) => i.instrument_type === 'mutual_fund' || i.instrument_type === 'sip' || i.instrument_type === 'equity')

  if (loading && !diversification) {
    return (
      <div className="flex justify-center py-16">
        <CoinSpinner size={48} />
      </div>
    )
  }

  if (error) {
    return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
  }

  const uncoveredCount = diversification?.uncovered_instrument_ids.length ?? 0

  return (
    <div className="grid gap-4">
      <div className="flex gap-1 rounded-xl bg-[var(--surface-2)] p-1">
        {(['overlap', 'compare'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'
            }`}
          >
            {t === 'overlap' ? 'Overlap & Diversification' : 'Compare My Funds'}
          </button>
        ))}
      </div>

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSheet({ type: 'upload' })}
            className="rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
          >
            Upload fund holdings
          </button>
          <button
            type="button"
            onClick={() => setSheet({ type: 'link' })}
            className="rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
          >
            Link fund to NAV data
          </button>
        </div>
      )}

      {uncoveredCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
          <span className="mt-0.5 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {uncoveredCount} fund{uncoveredCount > 1 ? 's' : ''} not included in overlap analysis
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Upload their monthly portfolio holdings to include them.
            </p>
          </div>
        </div>
      )}

      {tab === 'overlap' && diversification && (
        <>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-sm font-semibold text-[var(--text)]">Fund overlap</p>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              How much of each pair of funds is the same underlying stocks — high overlap means you're not as
              diversified as holding separate funds suggests.
            </p>
            <OverlapTable pairs={diversification.pairs} />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-sm font-semibold text-[var(--text)]">Top holdings across your portfolio</p>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Each stock's weight, scaled by how much of your portfolio is in the fund(s) holding it — shows real
              concentration risk that "3 different funds" can hide.
            </p>
            <TopHoldingsTable holdings={diversification.top_holdings} />
          </div>
        </>
      )}

      {tab === 'compare' && comparison && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-1 text-sm font-semibold text-[var(--text)]">Compare my funds</p>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Standard mutual fund metrics — click a column to sort. Std Dev / Beta / Alpha / Sharpe need a fund to be
            linked to NAV data and have enough history; Overlap is the highest overlap % with any other fund in your
            portfolio (from the Overlap tab). Benchmark is matched to each fund's own category (e.g. a mid-cap fund
            compares against Nifty Midcap 150, not a generic Nifty 50) — debt/liquid funds show "No matching
            benchmark" rather than an inaccurate equity comparison.
          </p>
          <FundComparisonTable rows={comparison.rows} />
          <p className="mt-3 text-xs text-[var(--text-faint)]">
            Risk-free rate: household setting, editable in Household &amp; Members.
          </p>
        </div>
      )}

      {tab === 'compare' && comparison && comparison.rows.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-3 text-sm font-semibold text-[var(--text)]">Compare returns with AI</p>
          <select
            value={compareInstrumentId}
            onChange={(e) => setCompareInstrumentId(e.target.value ? Number(e.target.value) : '')}
            className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">— Select a fund —</option>
            {comparison.rows.map((r) => <option key={r.instrument_id} value={r.instrument_id}>{r.instrument_name}</option>)}
          </select>
          {compareInstrumentId && (
            <AiInsightCard
              key={compareInstrumentId}
              title="Returns summary"
              canWrite={canWrite}
              emptyHint="Get a plain-English comparison of this fund's returns against similar funds you hold."
              fetchCached={() => aiInsightsApi.getReturnsComparison(Number(compareInstrumentId))}
              generate={() => aiInsightsApi.compareFundReturns(Number(compareInstrumentId), householdId, asOf)}
            >
              {(c) => <p className="whitespace-pre-wrap text-sm text-[var(--text-2)]">{c.summary}</p>}
            </AiInsightCard>
          )}
        </div>
      )}

      {sheet.type === 'upload' && (
        <Sheet title="Upload fund holdings" onClose={() => setSheet({ type: 'none' })}>
          <UploadHoldingsSheet
            instruments={mfInstruments}
            onSave={async () => { setSheet({ type: 'none' }); await load() }}
            onCancel={() => setSheet({ type: 'none' })}
          />
        </Sheet>
      )}

      {sheet.type === 'link' && (
        <Sheet title="Link fund to NAV data" onClose={() => setSheet({ type: 'none' })}>
          <LinkFundSheet
            instruments={mfInstruments}
            onSave={async () => { setSheet({ type: 'none' }); await load() }}
            onCancel={() => setSheet({ type: 'none' })}
          />
        </Sheet>
      )}
    </div>
  )
}
