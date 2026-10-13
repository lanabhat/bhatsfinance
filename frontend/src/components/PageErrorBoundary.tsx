import { Component, type ReactNode } from 'react'

const RELOADED_KEY = 'chunk-reload-at'

/**
 * Catches a page that failed to render. After a deploy, an open tab can ask for a chunk
 * whose hashed file no longer exists — reload once to pick up the new build. Anything
 * else shows a message instead of a blank page.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error) {
    const chunkMissing = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message)
    if (!chunkMissing) return
    let last = 0
    try { last = Number(sessionStorage.getItem(RELOADED_KEY) || 0) } catch { /* storage unavailable */ }
    if (Date.now() - last < 10_000) return  // already tried; show the message instead of looping
    try { sessionStorage.setItem(RELOADED_KEY, String(Date.now())) } catch { /* storage unavailable */ }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="panel" role="alert">
        <h2 className="text-base font-semibold text-[var(--text)]">This page couldn’t load</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{this.state.error.message}</p>
        <button type="button" className="mt-3 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
