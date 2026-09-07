import { useState } from 'react'
import { Money } from '../common/Money'
import { ExpandableGridCard } from '../common/ExpandableGridCard'
import { useExpandable } from '../../hooks/useExpandable'
import { MarkBondCouponReceivedSheet } from './MarkBondCouponReceivedSheet'
import { bondDetailsApi } from '../../api/bondDetailsApi'
import type { BondCouponDue, OptionItem } from '../../types/domain'

type Props = {
  items: BondCouponDue[]
  accountOptions: OptionItem[]
  onReceived: () => void | Promise<void>
}

type BondGroup = {
  bond_id: number
  instrument_name: string
  issuer_name: string
  dues: BondCouponDue[]
  total: number
}

function groupByBond(items: BondCouponDue[]): BondGroup[] {
  const map = new Map<number, BondGroup>()
  for (const item of items) {
    if (!map.has(item.bond_id)) {
      map.set(item.bond_id, {
        bond_id: item.bond_id,
        instrument_name: item.instrument_name,
        issuer_name: item.issuer_name,
        dues: [],
        total: 0,
      })
    }
    const g = map.get(item.bond_id)!
    g.dues.push(item)
    g.total += parseFloat(item.coupon_amount || '0')
  }
  return [...map.values()]
}

export function BondCouponsCard({ items, accountOptions, onReceived }: Props) {
  const [sheetTarget, setSheetTarget] = useState<BondCouponDue | null>(null)
  const [ignoringId, setIgnoringId] = useState<string | null>(null)
  const [ignoringBondId, setIgnoringBondId] = useState<number | null>(null)
  const groupExpand = useExpandable<number>()

  if (items.length === 0) return null

  const groups = groupByBond(items)

  const ignoreOne = async (item: BondCouponDue) => {
    const key = `${item.bond_id}-${item.due_date}`
    setIgnoringId(key)
    try {
      await bondDetailsApi.markCouponReceived(item.bond_id, {
        due_date: item.due_date,
        deduct: false,
        note: 'Ignored from dashboard',
      })
      await onReceived()
    } catch { /* silent — onReceived refresh will re-show if failed */ }
    setIgnoringId(null)
  }

  const ignoreGroup = async (group: BondGroup) => {
    setIgnoringBondId(group.bond_id)
    try {
      await Promise.all(
        group.dues.map((item) =>
          bondDetailsApi.markCouponReceived(item.bond_id, {
            due_date: item.due_date,
            deduct: false,
            note: 'Ignored from dashboard',
          })
        )
      )
      await onReceived()
    } catch { /* silent */ }
    setIgnoringBondId(null)
  }

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Bond Coupons Due
      </h2>
      <div className="card-grid grid gap-3">
        {groups.map((group) => {
          const isIgnoringGroup = ignoringBondId === group.bond_id
          const isExpanded = groupExpand.isExpanded(group.bond_id)
          return (
            <ExpandableGridCard
              key={group.bond_id}
              expanded={isExpanded}
              onToggle={() => groupExpand.toggle(group.bond_id)}
              className={isExpanded ? 'ring-2 ring-emerald-400 ring-offset-1 rounded-xl' : ''}
              collapsed={
                <div className="tap min-w-0 rounded-xl border border-emerald-100 bg-emerald-50 dark:border-emerald-900/30 dark:bg-emerald-900/10 px-4 py-3">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{group.instrument_name}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {group.dues.length} due{group.dues.length === 1 ? '' : 's'}
                    {group.issuer_name ? ` · ${group.issuer_name}` : ''}
                  </p>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                      {group.total > 0 ? <Money value={group.total} /> : '—'}
                    </span>
                    <p className="text-xs text-[var(--text-faint)]">total due</p>
                  </div>
                </div>
              }
            >
              <div className="overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50 dark:border-emerald-900/30 dark:bg-emerald-900/10">
                {group.dues.length > 1 && (
                  <div className="flex items-center justify-end gap-3 border-b border-emerald-100/60 dark:border-emerald-900/20 px-4 py-1.5">
                    <button
                      type="button"
                      disabled={isIgnoringGroup}
                      onClick={() => ignoreGroup(group)}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-2)] disabled:opacity-40"
                    >
                      {isIgnoringGroup ? 'Ignoring…' : 'Ignore all'}
                    </button>
                  </div>
                )}

                {group.dues.map((item) => {
                  const key = `${item.bond_id}-${item.due_date}`
                  const isIgnoring = ignoringId === key
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 border-b border-emerald-100/60 dark:border-emerald-900/20 px-4 py-2.5 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[var(--text-muted)]">Due {item.due_date}</p>
                        {item.grace_end && item.grace_end !== item.due_date && (
                          <p className="text-[10px] text-[var(--text-muted)]">Grace until {item.grace_end}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        {parseFloat(item.coupon_amount) > 0 ? <Money value={item.coupon_amount} /> : '—'}
                      </p>
                      <button
                        type="button"
                        disabled={isIgnoring}
                        onClick={() => ignoreOne(item)}
                        className="shrink-0 rounded-md border border-emerald-200 dark:border-emerald-800 px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-40"
                      >
                        {isIgnoring ? '…' : 'Ignore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetTarget(item)}
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        Received
                      </button>
                    </div>
                  )
                })}
              </div>
            </ExpandableGridCard>
          )
        })}
      </div>

      {sheetTarget && (
        <MarkBondCouponReceivedSheet
          alert={sheetTarget}
          accountOptions={accountOptions}
          onClose={() => setSheetTarget(null)}
          onReceived={onReceived}
        />
      )}
    </div>
  )
}
