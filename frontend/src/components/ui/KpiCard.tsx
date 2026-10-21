import { Delta } from './Delta'
import { StatCard } from './StatCard'
import { Skeleton } from './Skeleton'

type Props = {
  label: string
  value: string
  delta?: number | null
  deltaLabel?: string
  /** Ignored — StatCards carry no decorative icons. */
  icon?: string
  /** Ignored — no tinted cards. */
  accent?: 'primary' | 'positive' | 'negative' | 'accent'
  loading?: boolean
  onClick?: () => void
}

/** Older name for <StatCard> with a percentage <Delta>. */
export function KpiCard({ label, value, delta, deltaLabel, loading, onClick }: Props) {
  return (
    <StatCard
      label={label}
      value={value}
      loading={loading}
      onClick={onClick}
      delta={delta !== null && delta !== undefined ? <Delta value={delta} label={deltaLabel} /> : undefined}
    />
  )
}

export function KpiCardSkeleton() {
  return <Skeleton variant="stat" />
}
