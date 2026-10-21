import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { usePrivacy } from '../../context/PrivacyContext'
import { cn } from '../../lib/cn'
import { formatAmount } from '../../lib/fmt'

type Props = {
  value: number | null | undefined
  /** percent: +12.3% · amount: +₹1.2 L (masked in privacy mode) · pp: +1.5 pp */
  kind?: 'percent' | 'amount' | 'pp'
  /** For spend, a rise is bad: colours flip, the arrow still follows the sign. */
  invert?: boolean
  /** Trailing muted text, e.g. "vs last month". */
  label?: string
  digits?: number
  className?: string
}

/** A change: sign + arrow + colour, so the meaning never rests on colour alone. */
export function Delta({ value, kind = 'percent', invert, label, digits = 1, className }: Props) {
  const { hidden } = usePrivacy()
  if (value === null || value === undefined || !isFinite(value)) {
    return <span className={cn('text-sm text-ink-muted', className)}>—{label ? ` ${label}` : ''}</span>
  }
  const up = value > 0
  const flat = Math.abs(value) < 1e-9
  const good = flat ? null : invert ? !up : up
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  const sign = flat ? '' : up ? '+' : '−'
  const abs = Math.abs(value)
  const text = kind === 'amount'
    ? (hidden ? '••••' : formatAmount(abs, 'compact'))
    : kind === 'pp' ? `${abs.toFixed(digits)} pp` : `${abs.toFixed(digits)}%`
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-sm', className)}>
      <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', good === null ? 'text-ink-muted' : good ? 'text-success' : 'text-danger')}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span>{sign}{text}</span>
      </span>
      {label && <span className="text-ink-muted">{label}</span>}
    </span>
  )
}
