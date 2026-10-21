import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import type { FilterField, FilterState } from '../../hooks/useFilters'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { Chip } from './Chip'
import { controlClass } from './controls'
import { SearchInput } from './Input'
import { Sheet } from './Sheet'

export type ExtraChip = { key: string; label: string; onRemove: () => void }

type Props = {
  /** Always first (leftmost). */
  search?: { value: string; onChange: (v: string) => void; placeholder?: string }
  /** Multi-select dropdown filters (values OR'd within a field, AND'd across fields). */
  fields?: FilterField[]
  value?: FilterState
  onChange?: (next: FilterState) => void
  /** Filters that aren't tick-lists (DateRangePicker, AmountRangeInput), after the fields. */
  extra?: ReactNode
  /** Active-chip tokens for `extra` filters, so they show and clear like the rest. */
  extraChips?: ExtraChip[]
  /** Right end: ToolbarSelects for Group by / View / Sort, in that order. */
  controls?: ReactNode
  /** e.g. "Showing 12 of 40 holdings". */
  resultLabel?: string
  /** Clears search + extras too; the bar always clears its own field state. */
  onClearAll?: () => void
  className?: string
}

/**
 * The one toolbar: search → filters → (spacer) → Group by / View / Sort, with active
 * filters as removable chips and "Clear all" underneath. On phones everything except
 * search moves into a bottom sheet behind a "Filters" button.
 */
export function FilterBar({ search, fields = [], value = {}, onChange, extra, extraChips = [], controls, resultLabel, onClearAll, className }: Props) {
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)

  const activeChips: ExtraChip[] = useMemo(() => [
    ...fields.flatMap((f) => (value[f.key] ?? []).map((v) => ({
      key: `${f.key}:${v}`,
      label: `${f.label}: ${f.options.find((o) => o.value === v)?.label ?? v}`,
      onRemove: () => onChange?.({ ...value, [f.key]: (value[f.key] ?? []).filter((x) => x !== v) }),
    }))),
    ...extraChips,
  ], [fields, value, onChange, extraChips])

  const clearAll = () => { onChange?.({}); onClearAll?.() }
  const activeCount = activeChips.length

  return (
    <div className={cn('grid min-w-0 gap-2', className)}>
      {isMobile ? (
        <div className="flex min-w-0 items-center gap-2">
          {search && <SearchInput {...search} className="flex-1" />}
          {(fields.length > 0 || extra || controls) && (
            <Button variant="secondary" onClick={() => setSheetOpen(true)} icon={<SlidersHorizontal />} className={cn(!search && 'flex-1')}>
              Filters{activeCount > 0 && <span className="tabular-nums text-accent">{activeCount}</span>}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {search && <SearchInput {...search} className="w-64" />}
          {fields.length > 0 && <FieldDropdowns fields={fields} value={value} onChange={(v) => onChange?.(v)} />}
          {extra}
          {controls && <div className="ml-auto flex flex-wrap items-center gap-2">{controls}</div>}
        </div>
      )}

      {(activeCount > 0 || resultLabel) && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {activeChips.map((c) => <Chip key={c.key} size="sm" onRemove={c.onRemove}>{c.label}</Chip>)}
          {activeCount > 0 && (
            <button type="button" onClick={clearAll} className="h-7 px-1 text-sm font-medium text-accent hover:underline">Clear all</button>
          )}
          {resultLabel && <span className="text-sm text-ink-muted">{resultLabel}</span>}
        </div>
      )}

      {sheetOpen && (
        <Sheet
          title="Filters"
          onClose={() => setSheetOpen(false)}
          footer={(
            <>
              <Button variant="ghost" className="flex-1" onClick={clearAll} disabled={activeCount === 0}>Clear all</Button>
              <Button variant="primary" className="flex-1" onClick={() => setSheetOpen(false)}>Done</Button>
            </>
          )}
        >
          <div className="grid gap-6">
            {controls && <div className="grid gap-2 [&>*]:w-full [&_select]:w-full">{controls}</div>}
            {extra && <div className="flex flex-wrap gap-2">{extra}</div>}
            {fields.map((f) => (
              <fieldset key={f.key} className="grid gap-2">
                <legend className="mb-2 text-sm font-semibold text-ink">{f.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {f.options.map((o) => {
                    const sel = (value[f.key] ?? []).includes(o.value)
                    return (
                      <Chip key={o.value} selected={sel} count={o.count}
                        onClick={() => onChange?.({ ...value, [f.key]: sel ? (value[f.key] ?? []).filter((x) => x !== o.value) : [...(value[f.key] ?? []), o.value] })}>
                        {o.label}
                      </Chip>
                    )
                  })}
                  {f.options.length === 0 && <p className="text-sm text-ink-muted">Nothing to filter by.</p>}
                </div>
              </fieldset>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}

function FieldDropdowns({ fields, value, onChange }: { fields: FilterField[]; value: FilterState; onChange: (v: FilterState) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openKey) return
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenKey(null) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openKey])

  return (
    <div ref={rootRef} className="contents">
      {fields.map((f) => {
        const selected = value[f.key] ?? []
        const active = selected.length > 0
        const open = openKey === f.key
        return (
          <div key={f.key} className="relative">
            <button
              type="button"
              onClick={() => setOpenKey(open ? null : f.key)}
              aria-expanded={open}
              className={cn(controlClass, 'inline-flex w-auto max-w-[16rem] items-center gap-1 font-medium', active ? 'border-accent text-accent' : 'text-ink-2')}
            >
              <span className="truncate">{f.label}</span>
              {active && <span className="tabular-nums">· {selected.length}</span>}
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
            {open && (
              <FieldPopover field={f} selected={selected} onClose={() => setOpenKey(null)}
                onChange={(vals) => onChange({ ...value, [f.key]: vals })} />
            )}
          </div>
        )
      })}
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
      className="absolute left-0 top-full z-30 mt-1 w-72 rounded-[var(--radius-lg)] border border-line bg-surface p-2 shadow-[var(--shadow-modal)]"
    >
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
          placeholder={`Search ${field.label.toLowerCase()}…`}
          className={cn(controlClass, 'h-[var(--control-h-sm)]')}
        />
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="shrink-0 text-sm text-ink-muted hover:text-ink hover:underline">Clear</button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {items.map((o, i) => (
          <button
            key={o.value}
            type="button"
            onMouseEnter={() => setCursor(i)}
            onClick={() => toggle(o.value)}
            className={cn('flex min-h-9 w-full items-center gap-2 rounded-[var(--radius-md)] px-2 text-left text-sm', i === cursor ? 'bg-surface-2' : 'hover:bg-surface-2')}
          >
            <input type="checkbox" readOnly checked={selected.includes(o.value)} tabIndex={-1} className="h-4 w-4 accent-[var(--primary)]" />
            <span className="min-w-0 flex-1 truncate text-ink">{o.label}</span>
            {o.count !== undefined && <span className="text-xs tabular-nums text-ink-muted">{o.count}</span>}
          </button>
        ))}
        {items.length === 0 && <p className="px-2 py-3 text-center text-sm text-ink-muted">No matches</p>}
      </div>
    </div>
  )
}
