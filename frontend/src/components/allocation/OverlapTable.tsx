import { useState } from 'react'
import type { OverlapPair } from '../../types/domain'

type Props = { pairs: OverlapPair[] }

/** Sequential intensity for overlap % — higher overlap reads as a stronger amber
 * wash (concentration risk), not a categorical color (this isn't identity, it's
 * magnitude on a single dimension). */
function intensityStyle(percent: number) {
  if (percent >= 40) return { background: 'rgba(217, 119, 6, 0.22)', color: 'rgb(180, 83, 9)' }
  if (percent >= 20) return { background: 'rgba(217, 119, 6, 0.12)', color: 'rgb(180, 83, 9)' }
  if (percent >= 5) return { background: 'rgba(217, 119, 6, 0.05)' }
  return {}
}

function PairRow({ pair }: { pair: OverlapPair }) {
  const [open, setOpen] = useState(false)
  const percent = parseFloat(pair.overlap_percent)

  return (
    <>
      <tr className="border-b border-[var(--border)] last:border-0">
        <td className="py-2.5 pr-3">
          <button type="button" onClick={() => setOpen((p) => !p)} className="flex items-center gap-1.5 text-left text-[var(--text)] hover:text-indigo-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-90' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            {pair.instrument_a_name} <span className="text-[var(--text-faint)]">×</span> {pair.instrument_b_name}
          </button>
        </td>
        <td className="py-2.5 text-right">
          <span className="inline-block rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums" style={intensityStyle(percent)}>
            {pair.overlap_percent}%
          </span>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-[var(--border)] last:border-0">
          <td colSpan={2} className="bg-[var(--surface-2)] px-3 py-2">
            {pair.shared_holdings.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No shared holdings.</p>
            ) : (
              <div className="grid gap-1">
                {pair.shared_holdings.slice(0, 10).map((h) => (
                  <div key={h.isin} className="flex items-center justify-between text-xs">
                    <span className="truncate text-[var(--text-2)]">{h.name}</span>
                    <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{h.weight_a}% / {h.weight_b}%</span>
                  </div>
                ))}
                {pair.shared_holdings.length > 10 && (
                  <p className="text-xs text-[var(--text-faint)]">+{pair.shared_holdings.length - 10} more</p>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export function OverlapTable({ pairs }: Props) {
  if (pairs.length === 0) {
    return <p className="py-4 text-center text-xs text-[var(--text-muted)]">Upload holdings for at least 2 funds to see overlap.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <th className="py-2 pr-3">Fund pair</th>
            <th className="py-2 text-right">Overlap</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p) => (
            <PairRow key={`${p.instrument_a_id}-${p.instrument_b_id}`} pair={p} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
