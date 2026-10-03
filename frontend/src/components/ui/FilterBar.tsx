import { useEffect, useMemo, useRef, useState } from 'react'
import type { FilterField, FilterState } from '../../hooks/useFilters'

type Props = {
  fields: FilterField[]
  value: FilterState
  onChange: (next: FilterState) => void
  /** e.g. "Showing 12 of 40 holdings" — shown after the dropdowns. */
  resultLabel?: string
}

/** One always-visible dropdown per field; each opens a searchable tick-list (several values allowed). */
export function FilterBar({ fields, value, onChange, resultLabel }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openKey) return
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenKey(null) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openKey])

  const anyActive = fields.some((f) => (value[f.key]?.length ?? 0) > 0)

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-1.5">
      {fields.map((f) => (
        <FieldDropdown
          key={f.key}
          field={f}
          selected={value[f.key] ?? []}
          open={openKey === f.key}
          onToggleOpen={() => setOpenKey(openKey === f.key ? null : f.key)}
          onClose={() => setOpenKey(null)}
          onChange={(vals) => onChange({ ...value, [f.key]: vals })}
        />
      ))}
      {anyActive && (
        <button type="button" onClick={() => onChange({})} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:underline">
          Clear all
        </button>
      )}
      {resultLabel && <span className="text-xs text-[var(--text-muted)]">{resultLabel}</span>}
    </div>
  )
}

function FieldDropdown({ field, selected, open, onToggleOpen, onClose, onChange }: {
  field: FilterField
  selected: string[]
  open: boolean
  onToggleOpen: () => void
  onClose: () => void
  onChange: (values: string[]) => void
}) {
  const labels = selected.map((v) => field.options.find((o) => o.value === v)?.label ?? v)
  const summary = labels.length === 0 ? '' : labels.length <= 2 ? labels.join(', ') : `${labels.length} selected`
  const active = selected.length > 0

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className={`flex max-w-[16rem] items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
          active
            ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
            : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)]'
        }`}
      >
        <span className="truncate">{active ? `${field.label}: ${summary}` : field.label}</span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && <FieldPopover field={field} selected={selected} onClose={onClose} onChange={onChange} />}
    </div>
  )
}

/** Mounted only while open, so its search and cursor start fresh each time. */
function FieldPopover({ field, selected, onClose, onChange }: {
  field: FilterField
  selected: string[]
  onClose: () => void
  onChange: (values: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  const q = query.trim().toLowerCase()
  const items = useMemo(() => field.options.filter((o) => o.label.toLowerCase().includes(q)), [field.options, q])

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[cursor]) toggle(items[cursor].value) }
  }

  return (
    <div
      role="dialog"
      aria-label={`Filter by ${field.label}`}
      onKeyDown={onKeyDown}
      className="fixed inset-x-4 top-auto z-30 mt-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-modal)] sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:w-72"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <input
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
          placeholder={`Search ${field.label.toLowerCase()}…`}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="shrink-0 text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:underline">
            Clear
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {items.map((o, i) => (
          <button
            key={o.value}
            type="button"
            onMouseEnter={() => setCursor(i)}
            onClick={() => toggle(o.value)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${i === cursor ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]'}`}
          >
            <input type="checkbox" readOnly checked={selected.includes(o.value)} tabIndex={-1} className="h-3.5 w-3.5 rounded border-[var(--border)] text-primary-600" />
            <span className="min-w-0 flex-1 truncate text-[var(--text)]">{o.label}</span>
            {o.count !== undefined && <span className="text-[11px] tabular-nums text-[var(--text-faint)]">{o.count}</span>}
          </button>
        ))}
        {items.length === 0 && <p className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">No matches</p>}
      </div>
    </div>
  )
}
