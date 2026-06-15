import { useEffect, useState } from 'react'
import { useTheme } from '../../context/ThemeContext'

/**
 * Resolves chart colors from the app's CSS design tokens so Recharts is
 * theme-aware (light & dark) instead of using hardcoded hex values.
 */
export function useChartTheme() {
  const { theme } = useTheme()
  // Re-read CSS vars whenever theme changes (system toggles included)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setTick((t) => t + 1))
    return () => cancelAnimationFrame(id)
  }, [theme])

  const read = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
  }

  // tick is referenced so the memo recomputes on theme change
  void tick
  return {
    grid: read('--border', '#e4e4e7'),
    axis: read('--text-muted', '#71717a'),
    surface: read('--surface', '#ffffff'),
    text: read('--text', '#18181b'),
    border: read('--border', '#e4e4e7'),
  }
}

type TooltipEntry = { name?: unknown; value?: unknown; color?: string }
type TooltipProps = {
  active?: boolean
  payload?: readonly TooltipEntry[]
  label?: unknown
  fmt: (v: number) => string
}

/** Dark-mode-aware glass tooltip for all charts. */
export function ChartTooltip({ active, payload, label, fmt }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-modal)]">
      {label != null && label !== '' && (
        <p className="mb-1 text-xs font-semibold text-[var(--text)]">{String(label)}</p>
      )}
      <div className="flex flex-col gap-0.5">
        {payload.map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: e.color }} />
              {String(e.name ?? '')}
            </span>
            <span className="font-medium text-[var(--text)]">{fmt(Number(e.value))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
