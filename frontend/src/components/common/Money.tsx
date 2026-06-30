import { useState } from 'react'
import { fmtINR, fmtINRCompact } from '../../lib/fmt'
import { usePrivacy } from '../../context/PrivacyContext'

type Props = {
  value: number | string | null | undefined
  /** Replacement when privacy mode is on. Default: '••••' */
  mask?: string
  className?: string
  /** Show compact (8.3 L / 1.2 Cr) by default, with hover tooltip + click-to-toggle exact amount. Default: true */
  compact?: boolean
}

export function Money({ value, mask = '••••', className, compact = true }: Props) {
  const { hidden } = usePrivacy()
  const [expanded, setExpanded] = useState(false)
  if (hidden) return <span className={className} aria-label="hidden">{mask}</span>

  const exact = fmtINR(value ?? 0)
  if (!compact) return <span className={className}>{exact}</span>

  const display = expanded ? exact : fmtINRCompact(value ?? 0)
  return (
    <span
      className={`${className ?? ''} ${expanded ? '' : 'cursor-pointer'}`.trim()}
      title={exact}
      onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p) }}
    >
      {display}
    </span>
  )
}

/** For places that build strings inline (chart tooltips, table cells, template literals). Always exact — compact toggling needs a stateful element. */
export function useMaskedFmt() {
  const { hidden } = usePrivacy()
  return (value: number | string | null | undefined, mask = '••••') => {
    if (hidden) return mask
    return fmtINR(value ?? 0)
  }
}
