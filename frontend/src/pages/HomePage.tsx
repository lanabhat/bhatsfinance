import { useEffect, useMemo, useState } from 'react'
import { CategoryBreakdownCard } from '../components/home/CategoryBreakdownCard'
import { MaturingFDsCard } from '../components/home/MaturingFDsCard'
import { MarkSipPaidSheet } from '../components/home/MarkSipPaidSheet'
import { MarkAllSipsPaidSheet } from '../components/home/MarkAllSipsPaidSheet'
import { MemberNetWorthRow } from '../components/home/MemberNetWorthRow'
import { NetWorthHero } from '../components/home/NetWorthHero'
import { RecentHoldings } from '../components/home/RecentHoldings'
import { NetWorthTrendChart } from '../components/charts/NetWorthTrendChart'
import { useMaskedFmt } from '../components/common/Money'
import { useApp } from '../context/AppContext'
import { fdDetailsApi } from '../api/fdDetailsApi'
import { getJson, toQueryString } from '../api/http'
import type { CategoryBreakdownItem, DashboardHolding, MaturingFD, MemberAccount, MissedSipAlert } from '../types/domain'

const TYPE_ICONS: Record<string, string> = {
  mutual_fund: '📊', equity: '📈', fd: '🏦', rd: '🏦', epf: '🛡',
  ppf: '🛡', nps: '🛡', gold: '🪙', real_estate: '🏠', sip: '🔄',
  insurance: '☂️', cash: '💵', other: '💼', vehicle: '🚗', liability: '⚠️',
}

const STORAGE_KEY = 'hw_excluded_types'

function loadExcluded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveExcluded(s: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]))
}

type Props = { onNavigate: (route: string) => void }

export function HomePage({ onNavigate }: Props) {
  const fmtINR = useMaskedFmt()
  const { householdId, dashboard, dashboardLoading, asOf, setAsOf, refreshDashboard, accounts } = useApp()
  const [excluded, setExcluded] = useState<Set<string>>(loadExcluded)
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null)
  const [memberHoldings, setMemberHoldings] = useState<DashboardHolding[]>([])
  const [memberAccounts, setMemberAccounts] = useState<MemberAccount[]>([])
  const [memberHoldingsLoading, setMemberHoldingsLoading] = useState(false)
  const [maturingFDs, setMaturingFDs] = useState<MaturingFD[]>([])
  const MATURING_WINDOW_DAYS = 180
  const [paidSheetTarget, setPaidSheetTarget] = useState<MissedSipAlert | null>(null)
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false)

  useEffect(() => {
    let active = true
    fdDetailsApi.listMaturing(householdId, MATURING_WINDOW_DAYS)
      .then((rows) => { if (active) setMaturingFDs(rows) })
      .catch(() => { if (active) setMaturingFDs([]) })
    return () => { active = false }
  }, [householdId])

  useEffect(() => {
    if (expandedMemberId === null) { setMemberHoldings([]); setMemberAccounts([]); return }
    let active = true
    setMemberHoldingsLoading(true)
    const q = toQueryString({ household_id: householdId, as_of: asOf, member_id: expandedMemberId })
    getJson<{ holdings: DashboardHolding[]; accounts: MemberAccount[] }>(`/api/holdings?${q}`)
      .then((d) => { if (active) { setMemberHoldings(d.holdings ?? []); setMemberAccounts(d.accounts ?? []) } })
      .catch(() => { if (active) { setMemberHoldings([]); setMemberAccounts([]) } })
      .finally(() => { if (active) setMemberHoldingsLoading(false) })
    return () => { active = false }
  }, [expandedMemberId, householdId, asOf])

  // All instrument types present in holdings
  const presentTypes = useMemo(() => {
    const seen = new Set<string>()
    for (const h of dashboard.holdings) seen.add(h.instrument_type)
    return [...seen].sort()
  }, [dashboard.holdings])

  const toggleType = (type: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      saveExcluded(next)
      return next
    })
  }

  const activeHoldings = useMemo(
    () => dashboard.holdings.filter((h) => !excluded.has(h.instrument_type)),
    [dashboard.holdings, excluded],
  )

  const filteredNetworth = useMemo(() => {
    if (excluded.size === 0) return null // show full networth from dashboard
    const holdingsTotal = activeHoldings.reduce((s, h) => s + parseFloat(h.market_value), 0)
    // accounts are not filtered — only instrument holdings are excluded
    const fullHoldingsTotal = dashboard.holdings.reduce((s, h) => s + parseFloat(h.market_value), 0)
    const accountsTotal = parseFloat(dashboard.networth) - fullHoldingsTotal
    return String(holdingsTotal + accountsTotal)
  }, [excluded, activeHoldings, dashboard])

  const filteredBreakdown = useMemo((): CategoryBreakdownItem[] => {
    if (excluded.size === 0) return dashboard.categoryBreakdown
    // Recompute breakdown from active holdings only
    const byCategory = new Map<number | null, { name: string; color: string; icon: string; total: number }>()
    for (const h of activeHoldings) {
      const key = h.asset_category
      if (!byCategory.has(key)) {
        const cat = dashboard.categoryBreakdown.find((c) => c.category_id === key)
        byCategory.set(key, {
          name: cat?.category_name ?? 'Uncategorised',
          color: cat?.color ?? '#94a3b8',
          icon: cat?.icon_name ?? '',
          total: 0,
        })
      }
      byCategory.get(key)!.total += parseFloat(h.market_value)
    }
    const total = [...byCategory.values()].reduce((s, v) => s + v.total, 0)
    return [...byCategory.entries()]
      .map(([id, v]) => ({
        category_id: id,
        category_name: v.name,
        color: v.color,
        icon_name: v.icon,
        market_value: String(v.total.toFixed(2)),
        allocation_percent: total > 0 ? String(((v.total / total) * 100).toFixed(2)) : '0',
      }))
      .sort((a, b) => parseFloat(b.market_value) - parseFloat(a.market_value))
  }, [excluded, activeHoldings, dashboard])

  const displayNetworth = filteredNetworth ?? dashboard.networth
  const isFiltered = excluded.size > 0

  return (
    <div className="grid gap-5">
      <NetWorthHero
        networth={displayNetworth}
        xirr={isFiltered ? null : dashboard.xirr}
        asOf={asOf}
        onDateChange={setAsOf}
        onRefresh={refreshDashboard}
        loading={dashboardLoading}
      />

      {/* Asset type filter pills */}
      {presentTypes.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Filter by Type</h2>
            {isFiltered && (
              <button type="button" onClick={() => { setExcluded(new Set()); saveExcluded(new Set()) }}
                className="text-xs text-indigo-600 hover:text-indigo-700">
                Reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presentTypes.map((type) => {
              const active = !excluded.has(type)
              const holding = dashboard.holdings.filter((h) => h.instrument_type === type)
              const value = holding.reduce((s, h) => s + parseFloat(h.market_value), 0)
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-400 line-through'
                  }`}
                >
                  <span>{TYPE_ICONS[type] ?? '💼'}</span>
                  <span>{type.replace(/_/g, ' ')}</span>
                  {active && <span className="opacity-70">{fmtINR(value)}</span>}
                </button>
              )
            })}
          </div>
          {isFiltered && (
            <p className="mt-2 text-xs text-slate-400">
              Showing {fmtINR(parseFloat(displayNetworth))} of {fmtINR(parseFloat(dashboard.networth))} total net worth
            </p>
          )}
        </div>
      )}

      {dashboard.networthHistory.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Net Worth Trend</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <NetWorthTrendChart data={dashboard.networthHistory} />
          </div>
        </div>
      )}

      {dashboard.membersNetworth.length > 1 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">By Member</h2>
            <span className="text-[10px] text-slate-400">Tap a row to see breakdown</span>
          </div>
          <div className="grid gap-2">
            {dashboard.membersNetworth.map((m) => {
              const isExpanded = expandedMemberId === m.member_id
              return (
                <div key={m.member_id}>
                  <button
                    type="button"
                    onClick={() => setExpandedMemberId(isExpanded ? null : m.member_id)}
                    className={`block w-full text-left transition-shadow ${isExpanded ? 'ring-2 ring-primary-400 ring-offset-1 rounded-xl' : 'hover:opacity-90'}`}
                  >
                    <MemberNetWorthRow member={m} householdTotal={parseFloat(dashboard.networth)} />
                  </button>
                  {isExpanded && (
                    <div className="mt-2 ml-3 border-l-2 border-primary-200 pl-3 grid gap-3">
                      {memberHoldingsLoading ? (
                        <p className="py-2 text-xs text-slate-400">Loading {m.member_name}'s breakdown…</p>
                      ) : (
                        <>
                          {memberAccounts.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Savings &amp; Accounts</p>
                              <div className="grid gap-1">
                                {memberAccounts.map((a) => (
                                  <div key={a.account_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                                    <div>
                                      <p className="text-xs font-medium text-slate-700">{a.account_name}</p>
                                      <p className="text-[10px] capitalize text-slate-400">{a.account_type.replace(/_/g, ' ')}</p>
                                    </div>
                                    <p className={`text-sm font-semibold tabular-nums ${parseFloat(a.balance) < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                                      {fmtINR(a.balance)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {memberHoldings.length > 0 ? (
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Investments</p>
                              <RecentHoldings holdings={memberHoldings} onViewAll={() => onNavigate('holdings')} />
                            </div>
                          ) : memberAccounts.length === 0 ? (
                            <p className="py-2 text-xs text-slate-400">No holdings or accounts recorded for {m.member_name}.</p>
                          ) : null}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {filteredBreakdown.length > 0 && (
        <CategoryBreakdownCard items={filteredBreakdown} />
      )}

      {activeHoldings.length > 0 && (
        <RecentHoldings holdings={activeHoldings} onViewAll={() => onNavigate('holdings')} />
      )}

      {maturingFDs.length > 0 && (
        <MaturingFDsCard items={maturingFDs} windowDays={MATURING_WINDOW_DAYS} />
      )}

      {dashboard.missedSip.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Missed SIPs</h2>
            {dashboard.missedSip.length > 1 && (
              <button
                type="button"
                onClick={() => setBulkSheetOpen(true)}
                className="text-xs font-medium text-amber-700 hover:text-amber-800"
              >
                Mark all paid →
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-amber-100 bg-amber-50">
            {dashboard.missedSip.map((sip) => (
              <div key={`${sip.mandate_id}-${sip.due_date}`} className="flex items-center gap-3 border-b border-amber-100 px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{sip.instrument}</p>
                  <p className="text-xs text-slate-500">Due {sip.due_date} · {sip.account}</p>
                </div>
                <p className="shrink-0 text-sm font-bold text-amber-700">{fmtINR(sip.expected_amount)}</p>
                <button
                  type="button"
                  onClick={() => setPaidSheetTarget(sip)}
                  className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                >
                  Mark paid
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {paidSheetTarget && (
        <MarkSipPaidSheet
          alert={paidSheetTarget}
          accountOptions={accounts}
          onClose={() => setPaidSheetTarget(null)}
          onPaid={refreshDashboard}
        />
      )}

      {bulkSheetOpen && (
        <MarkAllSipsPaidSheet
          alerts={dashboard.missedSip}
          accountOptions={accounts}
          onClose={() => setBulkSheetOpen(false)}
          onPaid={refreshDashboard}
        />
      )}

      {!dashboardLoading && dashboard.holdings.length === 0 && dashboard.categoryBreakdown.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="text-3xl">💼</p>
          <p className="mt-2 text-sm font-medium text-slate-700">No assets yet</p>
          <p className="mt-1 text-xs text-slate-400">Go to Holdings to add instruments, or import data from Settings.</p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            onClick={() => onNavigate('holdings')}
          >
            Add Assets
          </button>
        </div>
      )}
    </div>
  )
}
