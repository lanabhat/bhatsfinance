import { useState } from 'react'
import { fmtINR, MASKED_TEXT } from '../../lib/fmt'
import { usePrivacy } from '../../context/PrivacyContext'
import { Amount } from '../ui/Amount'

type Props = {
  value: number | string | null | undefined
  /** Ignored — masking is the fixed-width bar from <Amount>. */
  mask?: string
  className?: string
  /** Compact (₹8.3 L) with click-to-toggle exact amount. Default: true */
  compact?: boolean
}

/**
 * Older wrapper over <Amount>, kept so existing screens pick up the shared formatting and
 * privacy bar. New code uses <Amount> directly.
 */
export function Money({ value, className, compact = true }: Props) {
  const [expanded, setExpanded] = useState(false)
  if (!compact) return <Amount value={value} format="precise" className={className} />
  return (
    <span
      className={expanded ? undefined : 'cursor-pointer'}
      onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p) }}
    >
      <Amount value={value} format={expanded ? 'full' : 'compact'} className={className} />
    </span>
  )
}

/** For text-only contexts (chart tooltips, template strings): exact amount, or the shared mask. */
export function useMaskedFmt() {
  const { hidden } = usePrivacy()
  return (value: number | string | null | undefined) => {
    if (hidden) return MASKED_TEXT
    return fmtINR(value ?? 0)
  }
}
