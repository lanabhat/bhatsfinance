import { useMemo } from 'react'
import type { Investment } from '../../types/domain'

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

/** Search box + list of Investments (funds/folios) under one shell Instrument
 * — reused inline (Instruments page's expand panel, height-capped) and on
 * the full InstrumentDetailPage (uncapped). Clicking a row opens the caller's
 * edit flow (InvestmentForm). */
export function InvestmentsSubList({ investments, search, onSearchChange, onSelect, maxHeight = '16rem' }: {
  investments: Investment[]
  search: string
  onSearchChange: (value: string) => void
  onSelect: (investment: Investment) => void
  maxHeight?: string
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return investments
    return investments.filter((iv) => iv.name.toLowerCase().includes(q) || iv.folio_no.toLowerCase().includes(q))
  }, [investments, search])

  return (
    <div className="grid gap-2" onClick={(e) => e.stopPropagation()}>
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={`Find a fund (${investments.length})…`}
        className={INP}
      />
      <div className="overflow-y-auto rounded-lg border border-[var(--border)]" style={{ maxHeight }}>
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--text-muted)]">No matching funds.</p>
        ) : (
          filtered.map((iv) => (
            <button
              key={iv.id}
              type="button"
              onClick={() => onSelect(iv)}
              className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 text-left last:border-0 hover:bg-[var(--surface-2)]"
            >
              <span className="min-w-0 truncate text-sm text-[var(--text)]">{iv.name}</span>
              {iv.folio_no && <span className="shrink-0 text-xs text-[var(--text-muted)]">Folio {iv.folio_no}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
