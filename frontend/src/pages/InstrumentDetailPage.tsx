import { useEffect, useState } from 'react'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { investmentApi } from '../api/investmentApi'
import { portfolioApi } from '../api/portfolioApi'
import { InvestmentForm } from '../components/assets/InvestmentForm'
import { InvestmentsSubList } from '../components/assets/InvestmentsSubList'
import { Sheet } from '../components/ui/Sheet'
import { useApp } from '../context/AppContext'
import { TYPE_ICONS, TYPE_LABELS } from '../lib/instrumentTypes'
import type { Instrument, Investment } from '../types/domain'

/**
 * Drill-down page for one instrument's Investments — reached from the
 * Instruments page ("View all" / clicking an instrument name with 1+
 * investments) via #/instruments/<id>. Gives the full investments list
 * (search + click-to-edit) the whole page instead of the height-capped
 * inline panel on InstrumentsPage.tsx, which stays available for a quick
 * in-place peek.
 */
export function InstrumentDetailPage({ instrumentId, onDone }: { instrumentId: number; onDone: () => void }) {
  const { householdId, categories, accounts } = useApp()
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [investments, setInvestments] = useState<Investment[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Investment | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [instruments, iv] = await Promise.all([
        portfolioApi.listInstruments(householdId),
        investmentApi.listInvestments({ instrument: instrumentId }),
      ])
      setInstrument(instruments.find((i) => i.id === instrumentId) ?? null)
      setInvestments(iv)
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [householdId, instrumentId])

  if (loading) return <div className="flex justify-center py-8"><CoinSpinner size={48} /></div>
  if (!instrument) return <p className="text-sm text-[var(--text-muted)]">Instrument not found.</p>

  const cat = categories.find((c) => c.id === instrument.asset_category)
  const account = accounts.find((a) => a.id === instrument.default_account)

  return (
    <div className="grid gap-4">
      <button type="button" onClick={onDone} className="w-fit text-xs text-primary-600 hover:text-primary-700 dark:text-primary-300">← Back to Instruments</button>
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xl">
          {TYPE_ICONS[instrument.instrument_type] ?? '💼'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[var(--text)]">{instrument.name}</p>
          <p className="truncate text-xs text-[var(--text-muted)]">
            {TYPE_LABELS[instrument.instrument_type] ?? instrument.instrument_type}
            {cat && <> · {cat.name}</>}
            {account && <> · {account.label}</>}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]">
          {investments.length} investment{investments.length === 1 ? '' : 's'}
        </span>
      </div>

      <InvestmentsSubList
        investments={investments}
        search={search}
        onSearchChange={setSearch}
        onSelect={setEditing}
        maxHeight="none"
      />

      {editing && (
        <Sheet title="Edit Fund" onClose={() => setEditing(null)}>
          <InvestmentForm investment={editing} onSave={async () => { setEditing(null); await load() }} onCancel={() => setEditing(null)} />
        </Sheet>
      )}
    </div>
  )
}
