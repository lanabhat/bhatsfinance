import { fmtINR } from '../../lib/fmt'
import { usePrivacy } from '../../context/PrivacyContext'

type Props = {
  value: number | string | null | undefined
  /** Replacement when privacy mode is on. Default: '••••' */
  mask?: string
  className?: string
}

export function Money({ value, mask = '••••', className }: Props) {
  const { hidden } = usePrivacy()
  if (hidden) return <span className={className} aria-label="hidden">{mask}</span>
  return <span className={className}>{fmtINR(value ?? 0)}</span>
}

/** For places that build strings inline (chart tooltips, table cells, template literals). */
export function useMaskedFmt() {
  const { hidden } = usePrivacy()
  return (value: number | string | null | undefined, mask = '••••') => {
    if (hidden) return mask
    return fmtINR(value ?? 0)
  }
}
