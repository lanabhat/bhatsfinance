import { useEffect, useState } from 'react'
import { fundDataApi } from '../../api/fundDataApi'
import { normalizeApiError } from '../../hooks/errorUtils'
import type { FundMatchSuggestion, FundRefreshResult, FundSchemeCandidate } from '../../types/domain'

type Props = {
  householdId: number
  onDone: () => void | Promise<void>
  onCancel: () => void
}

type Row = FundMatchSuggestion & { selected: boolean; chosen: FundSchemeCandidate | null }

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500'

/** Confirm which mfapi.in scheme each fund is, so its value updates daily from NAV.
 *  The app only suggests — nothing is linked until the user confirms. */
export function FundMatchSheet({ householdId, onDone, onCancel }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<FundRefreshResult | null>(null)
  const [linkedCount, setLinkedCount] = useState(0)
  const [searchFor, setSearchFor] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FundSchemeCandidate[]>([])

  useEffect(() => {
    let active = true
    fundDataApi.matchSuggestions(householdId)
      .then((s) => { if (active) setRows(s.map((r) => ({ ...r, selected: r.confidence === 'high', chosen: r.best }))) })
      .catch((e) => { if (active) setError(normalizeApiError(e)) })
    return () => { active = false }
  }, [householdId])

  const update = (id: number, patch: Partial<Row>) =>
    setRows((prev) => prev && prev.map((r) => (r.investment_id === id ? { ...r, ...patch } : r)))

  const runSearch = async () => {
    if (!query.trim()) return
    try {
      const res = await fundDataApi.search(query.trim())
      setSearchResults(res.map((r) => ({ scheme_code: String(r.schemeCode), scheme_name: r.schemeName, score: 0 })))
    } catch (e) { setError(normalizeApiError(e)) }
  }

  const selected = rows?.filter((r) => r.selected && r.chosen) ?? []

  const linkAndValue = async () => {
    setSaving(true)
    setError('')
    try {
      await fundDataApi.linkBulk(householdId, selected.map((r) => ({
        investment: r.investment_id, scheme_code: r.chosen!.scheme_code, scheme_name: r.chosen!.scheme_name,
      })))
      // Linked funds leave the list; the rest stay so they can be linked next.
      const linkedIds = new Set(selected.map((r) => r.investment_id))
      setRows((prev) => prev && prev.filter((r) => !linkedIds.has(r.investment_id)))
      setLinkedCount((n) => n + linkedIds.size)
      setResult(await fundDataApi.refresh(householdId))
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const close = () => void (linkedCount > 0 ? onDone() : onCancel())

  const banner = linkedCount > 0 && (
    <div className="grid gap-2">
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-900/15 dark:text-emerald-300">
        Linked {linkedCount} fund{linkedCount === 1 ? '' : 's'}.
        {result ? ` ${result.written} now valued at the latest NAV.` : ''}
      </p>
      {result && (
        <>
        {result.units_out_of_date.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/15 dark:text-amber-300">
            <p className="font-medium">
              {result.units_out_of_date.length} fund{result.units_out_of_date.length === 1 ? '' : 's'} kept {result.units_out_of_date.length === 1 ? 'its' : 'their'} uploaded value:
            </p>
            <p className="mt-0.5">
              The units on record don't match your latest statement (likely SIP purchases since the import weren't recorded),
              so the NAV value would be too low. They'll switch to daily NAV once their units are brought up to date.
            </p>
            <ul className="mt-1 list-disc pl-4">{result.units_out_of_date.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        )}
        {(result.skipped_no_units > 0 || result.failed > 0) && (
          <p className="text-xs text-[var(--text-muted)]">
            {result.skipped_no_units > 0 && `${result.skipped_no_units} skipped because the holding has no units recorded. `}
            {result.failed > 0 && `${result.failed} scheme${result.failed === 1 ? '' : 's'} couldn't be fetched — they'll retry in the daily refresh.`}
          </p>
        )}
        </>
      )}
    </div>
  )

  return (
    <div className="grid gap-3">
      {banner}
      {(rows === null || rows.length > 0) && (
        <p className="text-xs text-[var(--text-muted)]">
          {linkedCount > 0
            ? 'These funds are still not linked. Confirm their schemes to keep them updated from the daily NAV too.'
            : `Confirm which scheme each fund is, and its value will update automatically from the daily NAV — no more
               re-uploading statements. Exact matches are pre-ticked; check the rest, since a wrong scheme means a wrong value.`}
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {rows === null && !error && (
        <p className="py-6 text-center text-xs text-[var(--text-muted)]">Finding matching schemes… this can take up to a minute.</p>
      )}
      {rows !== null && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          {linkedCount > 0 ? 'All funds are now linked.' : 'All funds are already linked.'}
        </p>
      )}
      {rows !== null && rows.length > 0 && (
        <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
          {rows.map((r) => (
            <div key={r.investment_id} className="rounded-lg border border-[var(--border)] p-2.5">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={r.selected}
                  disabled={!r.chosen}
                  onChange={(e) => update(r.investment_id, { selected: e.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border)] text-primary-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--text)]">{r.name}</span>
                  <span className="block text-[11px] text-[var(--text-muted)]">
                    {r.member_name ?? 'Unassigned'}{r.folio_no ? ` · Folio ${r.folio_no}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  r.confidence === 'high'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                }`}>
                  {r.confidence === 'high' ? 'Exact match' : r.confidence === 'low' ? 'Check' : 'Not found'}
                </span>
              </label>
              <div className="mt-2 pl-6">
                {r.candidates.length > 0 && (
                  <select
                    className={INP}
                    value={r.chosen?.scheme_code ?? ''}
                    onChange={(e) => {
                      const c = [...r.candidates, ...searchResults].find((x) => x.scheme_code === e.target.value) ?? null
                      update(r.investment_id, { chosen: c, selected: c !== null })
                    }}
                  >
                    {r.candidates.map((c) => <option key={c.scheme_code} value={c.scheme_code}>{c.scheme_name}</option>)}
                  </select>
                )}
                {searchFor === r.investment_id ? (
                  <div className="mt-1.5 grid gap-1.5">
                    <div className="flex gap-1.5">
                      <input className={INP} value={query} onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void runSearch() }} placeholder="Search scheme name" />
                      <button type="button" onClick={() => void runSearch()} className="shrink-0 rounded-lg bg-primary-600 px-2.5 text-xs text-white">Search</button>
                    </div>
                    {searchResults.slice(0, 8).map((c) => (
                      <button key={c.scheme_code} type="button"
                        onClick={() => { update(r.investment_id, { chosen: c, selected: true, candidates: [c, ...r.candidates] }); setSearchFor(null) }}
                        className="rounded px-1.5 py-1 text-left text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]">
                        {c.scheme_name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button type="button"
                    onClick={() => { setSearchFor(r.investment_id); setQuery(r.name); setSearchResults([]) }}
                    className="mt-1 text-[11px] text-primary-600 hover:underline dark:text-primary-300">
                    {r.candidates.length > 0 ? 'Not right? Search instead' : 'Search for the scheme'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={close} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">
          {linkedCount > 0 ? 'Done' : 'Cancel'}
        </button>
        {rows !== null && rows.length > 0 && (
          <button type="button" disabled={saving || selected.length === 0} onClick={() => void linkAndValue()}
            className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Linking & fetching NAVs…' : `Link ${selected.length} & update values`}
          </button>
        )}
      </div>
    </div>
  )
}
