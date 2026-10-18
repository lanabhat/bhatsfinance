import { useState } from 'react'
import { useMaskedFmt } from '../common/Money'
import { TYPE_LABELS } from '../../lib/instrumentTypes'
import { ACCOUNT_TYPE_LABELS } from '../../lib/labels'
import type { ChangeItem, ChangeSummary as Summary } from '../../api/importApi'

const STATUS: Record<ChangeItem['status'], { label: string; cls: string } | null> = {
  changed: null,
  new: { label: 'New', cls: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' },
  sold_out: { label: 'Sold out', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-900/25 dark:text-amber-300' },
  closed: { label: 'Closed', cls: 'bg-[var(--surface-3)] text-[var(--text-2)]' },
  removed: { label: 'Removed', cls: 'bg-[var(--surface-3)] text-[var(--text-2)]' },
}

const INITIAL_ROWS = 30

const num = (v: string | null | undefined) => (v == null ? null : Number(v))

function fmtUnits(v: number) {
  return v.toLocaleString('en-IN', { maximumFractionDigits: 4 })
}

function signed(fmt: (v: number) => string, v: number) {
  return v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(Math.abs(v))}` : fmt(0)
}

/**
 * What an import changes (or changed): one row per holding/account whose value or units
 * moved, biggest change first, with before → after and the difference.
 */
export function ChangeSummary({ summary, fileDate, emptyText = 'No holding or account values change.' }: {
  summary: Summary
  /** The statement's date — rows last valued after it are flagged (the file won't move their value). */
  fileDate?: string
  emptyText?: string
}) {
  const fmt = useMaskedFmt()
  const [showAll, setShowAll] = useState(false)
  const items = showAll ? summary.items : summary.items.slice(0, INITIAL_ROWS)
  const net = Number(summary.net_change)

  return (
    <div className="grid gap-2">
      {summary.items.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{emptyText}</p>
      ) : (
        <p className="text-sm text-[var(--text)]">
          Net change{' '}
          <span className={`font-semibold tabular-nums ${net > 0 ? 'text-[var(--positive)]' : net < 0 ? 'text-[var(--negative)]' : ''}`}>
            {signed((v) => fmt(v), net)}
          </span>{' '}
          across {summary.items.length} {summary.items.length === 1 ? 'item' : 'items'}
          <span className="text-[var(--text-muted)]"> ({fmt(Number(summary.total_before))} → {fmt(Number(summary.total_after))})</span>
        </p>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {items.map((item) => <ChangeRow key={item.key} item={item} fmt={fmt} fileDate={fileDate} />)}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
        {summary.items.length > INITIAL_ROWS && (
          <button type="button" className="font-medium text-[var(--primary)] hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all ${summary.items.length}`}
          </button>
        )}
        {summary.unchanged_count > 0 && (
          <span>{summary.unchanged_count} other {summary.unchanged_count === 1 ? 'holding or account' : 'holdings and accounts'} unchanged</span>
        )}
      </div>
    </div>
  )
}

function ChangeRow({ item, fmt, fileDate }: { item: ChangeItem; fmt: (v: number) => string; fileDate?: string }) {
  const before = Number(item.value_before)
  const after = Number(item.value_after)
  const change = Number(item.change)
  const ub = num(item.units_before)
  const ua = num(item.units_after)
  const unitsMoved = ub != null && ua != null && Math.abs(ua - ub) >= 0.000001
  const badge = STATUS[item.status]
  const typeLabel = item.kind === 'account' ? (ACCOUNT_TYPE_LABELS[item.type] ?? item.type) : (TYPE_LABELS[item.type] ?? item.type)
  const olderFile = fileDate && item.last_valued_before && item.last_valued_before > fileDate

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-[var(--text)]">
          <span className="min-w-0 break-words">{item.name}</span>
          {badge && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {[typeLabel, item.member].filter(Boolean).join(' · ')}
          {unitsMoved && <> · units {fmtUnits(ub!)} → {fmtUnits(ua!)}</>}
          {item.status === 'new' && ua != null && ua > 0 && <> · {fmtUnits(ua)} units</>}
        </p>
        {olderFile && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Already valued on {item.last_valued_before}, after this file’s date — the newer value still counts.
          </p>
        )}
      </div>
      <div className="text-right text-sm tabular-nums">
        <p className="text-[var(--text-2)]">
          {item.status === 'new' ? fmt(after) : <>{fmt(before)} → {fmt(after)}</>}
        </p>
        <p className={`text-xs font-semibold ${change > 0 ? 'text-[var(--positive)]' : change < 0 ? 'text-[var(--negative)]' : 'text-[var(--text-muted)]'}`}>
          {signed(fmt, change)}
        </p>
      </div>
    </li>
  )
}
