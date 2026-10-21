export type ChartRange = '1M' | '3M' | '6M' | '1Y' | 'All'

export const CHART_RANGES: ChartRange[] = ['1M', '3M', '6M', '1Y', 'All']

const MONTHS: Record<Exclude<ChartRange, 'All'>, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }

/** Keep points on/after the range start (ISO date strings compare lexically). */
export function filterByRange<T>(points: T[], range: ChartRange, dateOf: (p: T) => string, today = new Date()): T[] {
  if (range === 'All') return points
  const start = new Date(today.getFullYear(), today.getMonth() - MONTHS[range], today.getDate())
  const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  return points.filter((p) => dateOf(p) >= iso)
}
