import { fmtDate, fmtDateShort, fmtMonth } from '../../lib/fmt'

type Props = {
  /** ISO date (YYYY-MM-DD), datetime, or YYYY-MM for format="month". */
  value: string | null | undefined
  /** long: 18 Oct 2026 (default) · short: 18 Oct (year only when not this year) · month: Oct 2026 */
  format?: 'long' | 'short' | 'month'
  className?: string
}

/** The one date format. Never print raw ISO dates or build them inline. */
export function DateText({ value, format = 'long', className }: Props) {
  if (!value) return <span className={className}>—</span>
  const text = format === 'month' ? fmtMonth(value) : format === 'short' ? fmtDateShort(value) : fmtDate(value.slice(0, 10))
  return <time dateTime={value} className={className}>{text}</time>
}
