import { useEffect, useMemo, useRef, useState } from 'react'

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

/**
 * Text-input-driven filtered picker for choosing one item out of a large
 * (hundreds+) list — a plain <select> becomes unusable at that scale (no
 * search, unsorted scroll). Filters client-side as you type, optionally
 * grouped by getGroup, with keyboard nav (Up/Down/Enter/Escape) and
 * click-outside-to-close.
 */
export function SearchableSelect<T>({
  items, getKey, getLabel, getGroup, getIcon, renderExtra, value, onChange, placeholder, emptyMessage,
}: {
  items: T[]
  getKey: (item: T) => string | number
  getLabel: (item: T) => string
  getGroup?: (item: T) => string
  getIcon?: (item: T) => string
  renderExtra?: (item: T) => string
  value: T | null
  onChange: (item: T) => void
  placeholder?: string
  emptyMessage?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = !q ? items : items.filter((item) => {
      const label = getLabel(item).toLowerCase()
      const extra = renderExtra?.(item).toLowerCase() ?? ''
      return label.includes(q) || extra.includes(q)
    })
    if (!getGroup) return [{ group: '', rows: matches }]
    const groups = new Map<string, T[]>()
    for (const item of matches) {
      const g = getGroup(item)
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(item)
    }
    return [...groups.entries()].map(([group, rows]) => ({ group, rows }))
  }, [items, query, getLabel, getGroup, renderExtra])

  const flatFiltered = useMemo(() => filtered.flatMap((g) => g.rows), [filtered])
  const clampedHighlight = Math.min(highlight, Math.max(flatFiltered.length - 1, 0))

  const select = (item: T) => {
    onChange(item)
    setQuery('')
    setOpen(false)
    setHighlight(0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); setHighlight(0); return }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, flatFiltered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const item = flatFiltered[clampedHighlight]; if (item) select(item) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  let rowIndex = -1

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={INP}
        placeholder={placeholder ?? 'Search…'}
        value={open ? query : (value ? getLabel(value) : '')}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0) }}
        onFocus={(e) => { setOpen(true); e.target.select() }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          {flatFiltered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--text-muted)]">{emptyMessage ?? 'No matches.'}</p>
          ) : (
            filtered.map(({ group, rows }) => rows.length === 0 ? null : (
              <div key={group || '_'}>
                {group && (
                  <p className="sticky top-0 bg-[var(--surface-2)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{group}</p>
                )}
                {rows.map((item) => {
                  rowIndex += 1
                  const isHighlighted = rowIndex === clampedHighlight
                  const extra = renderExtra?.(item)
                  return (
                    <button
                      key={getKey(item)}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select(item)}
                      onMouseEnter={() => setHighlight(rowIndex)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${isHighlighted ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                    >
                      {getIcon && <span className="shrink-0 text-sm">{getIcon(item)}</span>}
                      <span className="min-w-0 flex-1 truncate text-[var(--text)]">{getLabel(item)}</span>
                      {extra && <span className="shrink-0 text-xs text-[var(--text-muted)]">{extra}</span>}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
