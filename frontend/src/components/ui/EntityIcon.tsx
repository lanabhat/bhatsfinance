import { createElement } from 'react'
import { cn } from '../../lib/cn'
import { accountTypeIcon, assetTypeIcon, spendCategoryIcon } from '../../lib/icons'

type Props = {
  /** Which map the key belongs to (lib/icons.ts). */
  kind: 'asset' | 'account' | 'spend'
  type: string
  /** sm: bare 16px icon · md: 32px neutral disc (list rows) */
  size?: 'sm' | 'md'
  className?: string
}

const LOOKUP = { asset: assetTypeIcon, account: accountTypeIcon, spend: spendCategoryIcon }

/** The fixed line icon for an asset type, account type or spend category. */
export function EntityIcon({ kind, type, size = 'md', className }: Props) {
  const icon = createElement(LOOKUP[kind](type), { className: 'h-4 w-4', 'aria-hidden': true })
  if (size === 'sm') return <span className={cn('inline-flex shrink-0 text-ink-muted', className)}>{icon}</span>
  return (
    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted', className)} aria-hidden>
      {icon}
    </span>
  )
}
