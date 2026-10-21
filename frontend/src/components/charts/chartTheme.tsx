import { useEffect, useState } from 'react'
import { useTheme } from '../../context/ThemeContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { fmtINRAxis, MASKED_TEXT } from '../../lib/fmt'

/**
 * Resolves chart colours from the CSS design tokens so Recharts follows light & dark,
 * plus the shared axis props every chart uses (12px ticks, no tick/axis lines, a
 * recessive grid, compact ₹ on value axes — masked in privacy mode).
 */
export function useChartTheme() {
  const { theme } = useTheme()
  const { hidden } = usePrivacy()
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

  void tick
  const grid = read('--border', '#e4e4e7')
  const axis = read('--text-muted', '#71717a')
  return {
    grid,
    axis,
    surface: read('--surface', '#ffffff'),
    text: read('--text', '#18181b'),
    border: read('--border', '#e4e4e7'),
    primary: read('--primary', '#2563eb'),
    /** Spread onto <XAxis>. */
    xAxis: { tick: { fontSize: 12, fill: axis }, tickLine: false, axisLine: { stroke: grid }, minTickGap: 24 },
    /** Spread onto a value <YAxis>: compact ₹ ticks, masked when amounts are hidden. */
    yAxisINR: {
      tick: { fontSize: 12, fill: axis }, tickLine: false, axisLine: false, width: 56,
      tickFormatter: (v: number) => (hidden ? '•••' : fmtINRAxis(v)),
    },
    /** Spread onto <CartesianGrid>: horizontal guides only. */
    gridProps: { stroke: grid, strokeDasharray: '3 3', vertical: false },
  }
}

type TooltipEntry = { name?: unknown; value?: unknown; color?: string; payload?: Record<string, unknown> }
type TooltipProps = {
  active?: boolean
  payload?: readonly TooltipEntry[]
  label?: unknown
  /** Formats each value; masked automatically when amounts are hidden. */
  fmt: (v: number) => string
  /** Formats the header (e.g. dates). */
  labelFmt?: (label: string) => string
}

/** The one chart tooltip. */
export function ChartTooltip({ active, payload, label, fmt, labelFmt }: TooltipProps) {
  const { hidden } = usePrivacy()
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 shadow-[var(--shadow-modal)]">
      {label != null && label !== '' && (
        <p className="mb-1 text-xs font-semibold text-ink">{labelFmt ? labelFmt(String(label)) : String(label)}</p>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-2 text-ink-muted">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: e.color }} />
              {String(e.name ?? '')}
            </span>
            <span className="font-medium text-ink tabular-nums">{hidden ? MASKED_TEXT : fmt(Number(e.value))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
