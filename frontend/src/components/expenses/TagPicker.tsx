import { useMemo, useRef, useState } from 'react'
import { tagApi } from '../../api/tagApi'
import type { Tag } from '../../types/domain'

type Props = {
  householdId: number
  tags: Tag[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  onTagCreated?: (tag: Tag) => void
  placeholder?: string
}

/** Multi-select tag chips with an inline "type to create" input that suggests
 * matching existing tags as you type — mirrors the category picker's
 * directness but supports many-per-transaction selection. */
export function TagPicker({ householdId, tags, selectedIds, onChange, onTagCreated, placeholder = 'Add a tag…' }: Props) {
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase()
    if (!q) return []
    return tags
      .filter(t => !selectedIds.includes(t.id) && t.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [draft, tags, selectedIds])

  const exactMatch = suggestions.some(t => t.name.toLowerCase() === draft.trim().toLowerCase())

  const selectSuggestion = (tag: Tag) => {
    if (!selectedIds.includes(tag.id)) onChange([...selectedIds, tag.id])
    setDraft('')
    setShowSuggestions(false)
  }

  const createFromDraft = async () => {
    const name = draft.trim()
    if (!name) return
    setCreating(true)
    setError('')
    try {
      const tag = await tagApi.findOrCreate(householdId, name, tags)
      onTagCreated?.(tag)
      if (!selectedIds.includes(tag.id)) onChange([...selectedIds, tag.id])
      setDraft('')
      setShowSuggestions(false)
    } catch {
      setError('Could not create tag.')
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(p => Math.min(p + 1, suggestions.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(p => Math.max(p - 1, 0)); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        selectSuggestion(suggestions[highlighted])
        return
      }
      if (e.key === 'Escape') { setShowSuggestions(false); return }
    }
    if (e.key === 'Enter') { e.preventDefault(); void createFromDraft() }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.filter(t => selectedIds.includes(t.id)).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className="rounded-full border border-primary-500 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
          >
            ✓ {t.name}
          </button>
        ))}
      </div>
      <div className="relative mt-2 flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-faint)]">#</span>
          <input
            type="text"
            value={draft}
            onChange={e => { setDraft(e.target.value.replace(/^#+/, '')); setError(''); setShowSuggestions(true); setHighlighted(0) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => { blurTimeout.current = setTimeout(() => setShowSuggestions(false), 150) }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-6 pr-3 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <button
          type="button"
          disabled={!draft.trim() || creating}
          onClick={() => void createFromDraft()}
          className="shrink-0 rounded-lg border border-dashed border-primary-400 px-3 py-1.5 text-xs text-primary-600 hover:bg-primary-50 disabled:opacity-40 dark:bg-primary-900/15"
        >
          {creating ? '…' : '+ New tag'}
        </button>

        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute left-0 top-full z-10 mt-1 w-full max-w-[calc(100%-5.5rem)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
            {suggestions.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current); selectSuggestion(t) }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`block w-full px-3 py-1.5 text-left text-xs ${
                    i === highlighted ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' : 'text-[var(--text-2)]'
                  }`}
                >
                  #{t.name}
                </button>
              </li>
            ))}
            {!exactMatch && draft.trim() && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); if (blurTimeout.current) clearTimeout(blurTimeout.current); void createFromDraft() }}
                  className="block w-full border-t border-[var(--border)] px-3 py-1.5 text-left text-xs text-primary-600 dark:text-primary-400"
                >
                  + Create "{draft.trim()}"
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  )
}
