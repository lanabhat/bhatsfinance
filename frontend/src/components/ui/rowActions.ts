import type { ReactNode } from 'react'

export type MenuItem = {
  label: string
  icon?: ReactNode
  onSelect?: () => void
  /** Plain link (e.g. a CSV download) instead of onSelect. */
  href?: string
  download?: string
  disabled?: boolean
  /** Red, and always last; asks first when `confirm` is set. */
  destructive?: boolean
  confirm?: { title: string; message: string; confirmLabel?: string }
  /** Muted helper line under the label. */
  hint?: string
}

export type RowAction = MenuItem & {
  /** Fixes the order on every entity: view → edit → domain actions (buy/sell/update) → delete. */
  kind?: 'view' | 'edit' | 'action' | 'delete'
}

const KIND_ORDER = { view: 0, edit: 1, action: 2, delete: 3 } as const

/** Same action order on every entity; delete is destructive and last. Stable within a kind. */
export function sortRowActions(actions: RowAction[]): RowAction[] {
  return actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => KIND_ORDER[x.a.kind ?? 'action'] - KIND_ORDER[y.a.kind ?? 'action'] || x.i - y.i)
    .map(({ a }) => ({ ...a, destructive: a.destructive ?? a.kind === 'delete' }))
}
