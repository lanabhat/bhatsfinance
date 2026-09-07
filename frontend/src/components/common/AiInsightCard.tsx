import { useEffect, useState } from 'react'

type CachedInsight = { generated_at: string; model_used: string }

type Props<T extends CachedInsight> = {
  title: string
  canWrite: boolean
  /** Reads the cached row; should throw/reject on 404 (nothing generated yet) — treated as an empty state, not an error. */
  fetchCached: () => Promise<T>
  /** Calls the AI API and returns the freshly stored row. Only ever invoked from a click. */
  generate: () => Promise<T>
  /** Renders the cached content once loaded. */
  children: (data: T) => React.ReactNode
  emptyHint?: string
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Shared shape for every manually-triggered, cached AI insight in the app:
 * cached content (or an empty state) + a Generate/Refresh button. The button is
 * the ONLY thing that ever calls the AI API — nothing here fires on mount
 * beyond reading whatever's already cached. */
export function AiInsightCard<T extends CachedInsight>({ title, canWrite, fetchCached, generate, children, emptyHint }: Props<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetchCached()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      setData(await generate())
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'detail' in e ? String((e as { detail: unknown }).detail) : 'Failed to generate.'
      setError(msg)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
        {canWrite && (
          <button
            type="button"
            disabled={generating}
            onClick={onGenerate}
            className="rounded-lg border border-indigo-300 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
          >
            {generating ? 'Generating…' : data ? 'Refresh' : 'Generate'}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">Loading…</p>
      ) : error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : data ? (
        <div>
          {children(data)}
          <p className="mt-3 text-xs text-[var(--text-faint)]">
            Generated {timeAgo(data.generated_at)} · {data.model_used}
          </p>
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">{emptyHint ?? `Click ${canWrite ? '"Generate"' : 'above'} to generate this.`}</p>
      )}
    </div>
  )
}
