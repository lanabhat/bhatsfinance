import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { importApi } from '../../api/importApi'
import { CoinSpinner } from '../common/CoinSpinner'
import { useMaskedFmt } from '../common/Money'
import { apiErrorText } from '../../hooks/errorUtils'
import { ChangeSummary } from './ChangeSummary'
import type { ImportHistoryRow } from '../../api/importApi'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Past imports, newest first; each opens to show what it changed. */
export function ImportHistory({ householdId }: { householdId: number }) {
  const history = useQuery({
    queryKey: ['import-history', householdId],
    queryFn: () => importApi.importHistory(householdId),
  })
  const [open, setOpen] = useState<number | null>(null)

  if (history.isPending) return <div className="flex justify-center py-10"><CoinSpinner size={40} /></div>
  if (history.error) return <p className="text-sm text-[var(--negative)]">Couldn’t load import history: {apiErrorText(history.error, 'request failed')}</p>
  if (history.data.results.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No imports yet. Holdings, FD/RD and SBI statement imports will be listed here with what each one changed.</p>
  }

  return (
    <ul className="grid gap-2">
      {history.data.results.map((row) => (
        <HistoryRow key={row.id} row={row} householdId={householdId} open={open === row.id}
          onToggle={() => setOpen((cur) => (cur === row.id ? null : row.id))} />
      ))}
    </ul>
  )
}

function HistoryRow({ row, householdId, open, onToggle }: {
  row: ImportHistoryRow; householdId: number; open: boolean; onToggle: () => void
}) {
  const fmt = useMaskedFmt()
  const detail = useQuery({
    queryKey: ['import-history', householdId, row.id],
    queryFn: () => importApi.importHistoryDetail(householdId, row.id),
    enabled: open,
  })
  const net = row.net_change == null ? null : Number(row.net_change)

  return (
    <li className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-[var(--surface-2)]">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text)]">
            {row.kind_label}{row.member_name ? ` · ${row.member_name}` : ''}
          </p>
          <p className="break-all text-xs text-[var(--text-muted)]">{when(row.imported_at)}{row.filename ? ` · ${row.filename}` : ''}</p>
        </div>
        <div className="text-right text-sm tabular-nums">
          {net != null && (
            <p className={`font-semibold ${net > 0 ? 'text-[var(--positive)]' : net < 0 ? 'text-[var(--negative)]' : 'text-[var(--text-2)]'}`}>
              {net > 0 ? '+' : net < 0 ? '−' : ''}{fmt(Math.abs(net))}
            </p>
          )}
          <p className="text-xs text-[var(--text-muted)]">{row.changed_count} changed{row.unchanged_count ? ` · ${row.unchanged_count} unchanged` : ''}</p>
        </div>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          {detail.isPending ? <CoinSpinner size={24} />
            : detail.error ? <p className="text-sm text-[var(--negative)]">{apiErrorText(detail.error, 'Couldn’t load this import')}</p>
            : detail.data.change_summary && <ChangeSummary summary={detail.data.change_summary} />}
        </div>
      )}
    </li>
  )
}
