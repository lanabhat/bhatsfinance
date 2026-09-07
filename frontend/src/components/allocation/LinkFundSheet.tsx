import { useState } from 'react'
import { fundDataApi } from '../../api/fundDataApi'
import type { Instrument, MfApiSearchResult } from '../../types/domain'

type Props = {
  instruments: Instrument[]
  onSave: () => void
  onCancel: () => void
}

export function LinkFundSheet({ instruments, onSave, onCancel }: Props) {
  const [instrumentId, setInstrumentId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MfApiSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inp = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError('')
    try {
      setResults(await fundDataApi.search(query.trim()))
    } catch {
      setError('Search failed.')
    } finally {
      setSearching(false)
    }
  }

  const link = async (result: MfApiSearchResult) => {
    if (!instrumentId) { setError('Select a fund first.'); return }
    setSaving(true)
    setError('')
    try {
      await fundDataApi.link({
        instrument: Number(instrumentId),
        mfapi_scheme_code: String(result.schemeCode),
        scheme_name: result.schemeName,
        fund_house: '',
      })
      onSave()
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'detail' in e ? String((e as { detail: unknown }).detail) : 'Failed to link.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs text-[var(--text-muted)]">
        Links this fund to its NAV history on mfapi.in (free, no-auth) so Sharpe ratio, alpha, and beta can be
        computed from real daily returns. Pick the matching scheme carefully — a wrong match will skew every
        downstream number.
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Fund in your portfolio</label>
        <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} className={inp}>
          <option value="">— Select —</option>
          {instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Search mfapi.in</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. Axis Midcap Fund"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void search() }}
            className={`flex-1 ${inp}`}
          />
          <button type="button" onClick={search} disabled={searching} className="shrink-0 rounded-lg bg-indigo-600 px-3 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
            {searching ? '…' : 'Search'}
          </button>
        </div>
      </div>
      {results.length > 0 && (
        <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-[var(--border)] p-1">
          {results.map((r) => (
            <button
              key={r.schemeCode}
              type="button"
              disabled={saving}
              onClick={() => link(r)}
              className="rounded-lg px-2 py-1.5 text-left text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              {r.schemeName}
              <span className="ml-1 text-xs text-[var(--text-faint)]">#{r.schemeCode}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">
          Close
        </button>
      </div>
    </div>
  )
}
