import { useTheme } from '../../../context/ThemeContext'
import { usePrivacy } from '../../../context/PrivacyContext'
import { fmtINR, fmtINRCompact } from '../../../lib/fmt'

/** One holding × member row from GET /api/analytics/facts. */
export type Fact = {
  member_id: number | null
  member: string
  /** False for a member left out of household net worth — shown only when selected. */
  included: boolean
  type: string
  category: string
  asset_class: string
  market_cap: string
  classification: string
  provider: string
  holding: string
  value: number
  invested: number
}

export type FactsPayload = {
  as_of: string
  members: { id: number; name: string; included: boolean }[]
  rows: Fact[]
}

/** Every dimension the dashboard cross-filters on. */
export type Dim = 'member' | 'type' | 'asset_class' | 'market_cap' | 'category' | 'classification' | 'provider' | 'holding'

export const DIM_LABELS: Record<Dim, string> = {
  member: 'Member', type: 'Type', asset_class: 'Asset class', market_cap: 'Market cap', category: 'Category',
  classification: 'Classification', provider: 'Provider', holding: 'Holding',
}

export const DIMS = Object.keys(DIM_LABELS) as Dim[]

export type Filters = Partial<Record<Dim, string[]>>

export type Bucket = { key: string; value: number; invested: number; count: number }

/** Sum value/invested per value of `dim`, largest first. */
export function aggregate(rows: Fact[], dim: Dim): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const r of rows) {
    const key = r[dim] || '—'
    const b = map.get(key) ?? { key, value: 0, invested: 0, count: 0 }
    b.value += r.value
    b.invested += r.invested
    b.count += 1
    map.set(key, b)
  }
  return [...map.values()].sort((a, b) => b.value - a.value)
}

// Asset classes take categorical slots in this fixed order, so each keeps its colour
// whatever the filter (colour follows the entity, never its rank). Validated with
// the dataviz palette checker in both modes; light-mode yellow/aqua/magenta sit
// below 3:1, so every use pairs the colour with a visible label.
export const ASSET_CLASS_ORDER = ['Equity', 'Debt', 'Retirement', 'Real estate', 'Gold', 'Hybrid', 'Cash', 'Other']
const CATEGORICAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

/** Chart colours for the current theme: the single bar hue, its dimmed step, and asset-class slots. */
export function useDashboardColors() {
  const { isDark } = useTheme()
  const palette = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
  return {
    bar: isDark ? '#3987e5' : '#2a78d6',
    barDim: isDark ? '#184f95' : '#b7d3f6',
    assetClass: (name: string) => {
      const i = ASSET_CLASS_ORDER.indexOf(name)
      return palette[i >= 0 ? i : ASSET_CLASS_ORDER.length - 1]
    },
  }
}

/** Money formatters that respect privacy mode. */
export function useMoney() {
  const { hidden } = usePrivacy()
  return {
    full: (v: number) => (hidden ? '••••' : fmtINR(v)),
    compact: (v: number) => (hidden ? '••••' : fmtINRCompact(v)),
  }
}

export const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)
