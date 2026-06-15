import { useMemo } from 'react'
import { useMaskedFmt } from '../common/Money'
import type { AssetCategory, DashboardHolding, MemberAccount } from '../../types/domain'

type Props = {
  memberName: string
  holdings: DashboardHolding[]
  accounts: MemberAccount[]
  memberTotal: number      // member's total net worth
  householdTotal: number   // full household net worth
  categories: AssetCategory[]
}

type Bucket = {
  key: string
  label: string
  color: string
  icon: string
  value: number            // absolute value in INR
  items: { name: string; value: number }[]
}

const TYPE_COLOR: Record<string, string> = {
  mutual_fund: '#6366f1', equity: '#0ea5e9', fd: '#f59e0b', rd: '#f97316',
  epf: '#10b981', ppf: '#14b8a6', nps: '#8b5cf6', gold: '#eab308',
  real_estate: '#ec4899', sip: '#6366f1', insurance: '#64748b',
  cash: '#22c55e', other: '#94a3b8', vehicle: '#84cc16', liability: '#ef4444',
  savings: '#22c55e',
}

const TYPE_ICON: Record<string, string> = {
  mutual_fund: '📊', equity: '📈', fd: '🏦', rd: '🏦', epf: '🛡️',
  ppf: '🛡️', nps: '🛡️', gold: '🪙', real_estate: '🏠', sip: '🔄',
  insurance: '☂️', cash: '💵', other: '💼', vehicle: '🚗', liability: '⚠️',
  savings: '🏦',
}

export function MemberWealthBreakdown({ memberName, holdings, accounts, memberTotal, householdTotal, categories }: Props) {
  const fmt = useMaskedFmt()

  const categoryMap = useMemo(() => {
    const m = new Map<number, AssetCategory>()
    categories.forEach((c) => m.set(c.id, c))
    return m
  }, [categories])

  // Build buckets: one per asset category (for holdings) + one per account type
  const buckets = useMemo(() => {
    const map = new Map<string, Bucket>()

    const getOrCreate = (key: string, label: string, color: string, icon: string): Bucket => {
      if (!map.has(key)) map.set(key, { key, label, color, icon, value: 0, items: [] })
      return map.get(key)!
    }

    // Holdings → grouped by asset category, falling back to instrument_type
    for (const h of holdings) {
      const mv = parseFloat(h.market_value)
      if (!mv) continue
      let key: string, label: string, color: string, icon: string
      if (h.asset_category && categoryMap.has(h.asset_category)) {
        const cat = categoryMap.get(h.asset_category)!
        key = `cat_${cat.id}`
        label = cat.name
        color = cat.color
        icon = cat.icon_name || TYPE_ICON[h.instrument_type] || '💼'
      } else {
        key = `type_${h.instrument_type}`
        label = h.instrument_type.replace(/_/g, ' ')
        color = TYPE_COLOR[h.instrument_type] || '#94a3b8'
        icon = TYPE_ICON[h.instrument_type] || '💼'
      }
      const bucket = getOrCreate(key, label, color, icon)
      bucket.value += mv
      bucket.items.push({ name: h.instrument_name, value: mv })
    }

    // Accounts → group all positive balances under 'Savings & Cash'
    const positiveAccounts = accounts.filter((a) => parseFloat(a.balance) > 0)
    const negativeAccounts = accounts.filter((a) => parseFloat(a.balance) < 0)

    if (positiveAccounts.length > 0) {
      const bucket = getOrCreate('savings', 'Savings & Cash', '#22c55e', '🏦')
      for (const a of positiveAccounts) {
        const bal = parseFloat(a.balance)
        bucket.value += bal
        bucket.items.push({ name: a.account_name, value: bal })
      }
    }
    if (negativeAccounts.length > 0) {
      const bucket = getOrCreate('liability_cc', 'Credit Card', '#ef4444', '💳')
      for (const a of negativeAccounts) {
        const bal = parseFloat(a.balance) // negative
        bucket.value += bal
        bucket.items.push({ name: a.account_name, value: bal })
      }
    }

    return Array.from(map.values()).sort((a, b) => b.value - a.value)
  }, [holdings, accounts, categoryMap])

  const positiveTotal = useMemo(() => buckets.reduce((s, b) => s + Math.max(b.value, 0), 0), [buckets])

  if (buckets.length === 0) return null

  return (
    <div className="grid gap-3">
      {/* Stacked bar */}
      <div className="overflow-hidden rounded-lg h-3 flex gap-px bg-[var(--surface-2)]">
        {buckets.filter((b) => b.value > 0).map((b) => {
          const pct = positiveTotal > 0 ? (b.value / positiveTotal) * 100 : 0
          return (
            <div
              key={b.key}
              title={`${b.label}: ${pct.toFixed(1)}%`}
              style={{ width: `${pct}%`, backgroundColor: b.color }}
              className="first:rounded-l-lg last:rounded-r-lg transition-all"
            />
          )
        })}
      </div>

      {/* Bucket rows */}
      <div className="grid gap-1">
        {buckets.map((b) => {
          const pctOfMember = memberTotal > 0 ? (b.value / memberTotal) * 100 : 0
          const pctOfHousehold = householdTotal > 0 ? (b.value / householdTotal) * 100 : 0
          const isNeg = b.value < 0
          return (
            <details key={b.key} className="group rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-[var(--surface-2)] list-none">
                {/* colour dot */}
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: b.color }} />
                <span className="flex-1 text-xs font-medium text-[var(--text-2)] capitalize">{b.label}</span>
                {/* % of member */}
                <span className="text-[11px] tabular-nums text-[var(--text-muted)] w-10 text-right">{Math.abs(pctOfMember).toFixed(1)}%</span>
                {/* mini bar of member share */}
                <div className="w-16 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(Math.abs(pctOfMember), 100)}%`, backgroundColor: b.color }}
                  />
                </div>
                {/* % of household */}
                <span className="text-[11px] tabular-nums text-[var(--text-muted)] w-12 text-right hidden sm:block">
                  {Math.abs(pctOfHousehold).toFixed(1)}% HH
                </span>
                {/* value */}
                <span className={`text-xs font-semibold tabular-nums w-24 text-right ${isNeg ? 'text-red-600' : 'text-[var(--text)]'}`}>
                  {fmt(b.value)}
                </span>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 shrink-0 text-[var(--text-faint)] group-open:rotate-90 transition-transform">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
                </svg>
              </summary>
              {/* Individual items */}
              <div className="border-t border-[var(--border)]">
                {b.items.map((item, i) => {
                  const pctOfCat = b.value !== 0 ? (item.value / Math.abs(b.value)) * 100 : 0
                  const pctOfHH = householdTotal > 0 ? (item.value / householdTotal) * 100 : 0
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] last:border-0 bg-[var(--surface-2)]/50">
                      <span className="w-2.5 shrink-0" />
                      <span className="flex-1 text-[11px] text-[var(--text-2)] truncate">{item.name}</span>
                      <span className="text-[10px] tabular-nums text-[var(--text-muted)] w-10 text-right">{pctOfCat.toFixed(1)}%</span>
                      <div className="w-16 h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
                        <div
                          className="h-full rounded-full opacity-60"
                          style={{ width: `${Math.min(Math.abs(pctOfCat), 100)}%`, backgroundColor: b.color }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-[var(--text-muted)] w-12 text-right hidden sm:block">
                        {Math.abs(pctOfHH).toFixed(1)}% HH
                      </span>
                      <span className="text-[11px] tabular-nums text-[var(--text-2)] w-24 text-right">{fmt(item.value)}</span>
                      <span className="w-3 shrink-0" />
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
      </div>

      {/* Legend line */}
      <p className="text-[10px] text-[var(--text-muted)]">% = share of {memberName}'s wealth · HH% = share of household total</p>
    </div>
  )
}
