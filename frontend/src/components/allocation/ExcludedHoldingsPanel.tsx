import { useMemo, useState } from 'react'
import { Money } from '../common/Money'
import type { DashboardHolding, Instrument } from '../../types/domain'

type Props = {
  holdings: DashboardHolding[]
  instruments: Instrument[]
  canWrite: boolean
  onToggle: (instrumentId: number, includeInRebalancing: boolean) => Promise<void>
}

export function ExcludedHoldingsPanel({ holdings, instruments, canWrite, onToggle }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const instrumentById = useMemo(() => new Map(instruments.map((i) => [i.id, i])), [instruments])

  const rows = useMemo(() => {
    return holdings
      .map((h) => ({ holding: h, instrument: instrumentById.get(h.instrument_id) }))
      .filter((r): r is { holding: DashboardHolding; instrument: Instrument } => !!r.instrument)
      .filter((r) => !search || r.instrument.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => Number(a.instrument.include_in_rebalancing) - Number(b.instrument.include_in_rebalancing))
  }, [holdings, instrumentById, search])

  const excludedCount = instruments.filter((i) => !i.include_in_rebalancing).length

  const toggle = async (instrumentId: number, next: boolean) => {
    setBusyId(instrumentId)
    try {
      await onToggle(instrumentId, next)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-[var(--text)]">
          Choose holdings to rebalance
          {excludedCount > 0 && (
            <span className="ml-2 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
              {excludedCount} excluded
            </span>
          )}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Uncheck a holding to leave it out of allocation targets and rebalancing suggestions —
            it still shows up everywhere else in the app.
          </p>
          <input
            type="text"
            placeholder="Search holdings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="grid max-h-64 gap-1 overflow-y-auto">
            {rows.map(({ holding, instrument }) => (
              <label key={instrument.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]">
                <span className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={instrument.include_in_rebalancing}
                    disabled={!canWrite || busyId === instrument.id}
                    onChange={(e) => toggle(instrument.id, e.target.checked)}
                    className="h-4 w-4 shrink-0 rounded border-[var(--border)] text-primary-600 focus:ring-primary-500"
                  />
                  <span className="truncate text-sm text-[var(--text-2)]">{instrument.name}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]"><Money value={holding.market_value} /></span>
              </label>
            ))}
            {rows.length === 0 && <p className="py-3 text-center text-xs text-[var(--text-muted)]">No holdings found.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
