import { usePrivacy } from '../../context/PrivacyContext'
import { cn } from '../../lib/cn'
import { formatAmount, fmtINRWhole } from '../../lib/fmt'
import type { AmountFormat } from '../../lib/fmt'

export type AmountTone = 'default' | 'gain' | 'debit' | 'credit' | 'muted'

type Props = {
  value: number | string | null | undefined
  /** full: ₹12,34,567 (tables) · compact: ₹1.2 Cr (summaries) · precise: ₹12,34,567.50 */
  format?: AmountFormat
  /** Prefix + for positive values (gains, credits). Negative always shows −. */
  signed?: boolean
  /** gain: green/red by sign · debit: red (money out) · credit: green (money in) */
  tone?: AmountTone
  className?: string
}

/** Width of the privacy bar per format — fixed, so masked columns keep their alignment. */
const MASK_WIDTH: Record<AmountFormat, string> = { full: 'w-[5.5em]', compact: 'w-[3.75em]', precise: 'w-[6.5em]' }


/**
 * Every rupee figure in the app goes through here: Indian grouping, tabular numerals,
 * a sign and colour for gains, and a fixed-width privacy bar instead of "••••".
 */
export function Amount({ value, format = 'full', signed, tone = 'default', className }: Props) {
  const { hidden } = usePrivacy()
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? NaN)

  if (hidden) {
    return (
      <span
        role="img"
        aria-label="Amount hidden"
        className={cn('inline-block h-[0.8em] translate-y-[0.1em] rounded-[var(--radius-sm)] bg-surface-3 align-baseline', MASK_WIDTH[format], className)}
      />
    )
  }
  if (!isFinite(n)) return <span className={cn('tabular-nums text-ink-muted', className)}>—</span>

  const text = formatAmount(Math.abs(n), format)
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : ''
  const toneClass =
    tone === 'gain' ? (n > 0 ? 'text-success' : n < 0 ? 'text-danger' : 'text-ink-muted')
      : tone === 'debit' ? 'text-danger'
        : tone === 'credit' ? 'text-success'
          : tone === 'muted' ? 'text-ink-muted' : ''
  return (
    <span className={cn('whitespace-nowrap tabular-nums', toneClass, className)} title={format === 'compact' ? fmtINRWhole(n) : undefined}>
      {sign}{text}
    </span>
  )
}
