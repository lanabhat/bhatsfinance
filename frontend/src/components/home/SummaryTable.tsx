import { useMemo, useState } from 'react'
import { Money, useMaskedFmt } from '../common/Money'
import type { CategoryBreakdownItem, DashboardAccount, DashboardHolding, MemberNetWorth } from '../../types/domain'

const TYPE_LABELS: Record<string, string> = {
  equity: 'Equity', mutual_fund: 'Mutual Fund', fd: 'FD', rd: 'RD',
  epf: 'EPF', ppf: 'PPF', nps: 'NPS', gold: 'Gold',
  real_estate: 'Real Estate', sip: 'SIP', insurance: 'Insurance',
  lending: 'Lending', cash: 'Cash', vehicle: 'Vehicle', liability: 'Liability', other: 'Other',
}

const ACCT_TYPE_LABELS: Record<string, string> = {
  savings: 'Savings', current: 'Current', salary: 'Salary',
  credit_card: 'Credit Card', fixed_deposit: 'Fixed Deposit', other: 'Other',
}

type Dimension = 'type' | 'member' | 'category'
type SortCol = 'name' | 'current' | 'invested' | 'gain' | 'gainPct' | 'alloc'

type Row = { key: string; label: string; current: number; invested: number }

type Props = {
  holdings: DashboardHolding[]
  accounts: DashboardAccount[]
  memberHoldings: Record<number, DashboardHolding[]>
  memberAccounts: Record<number, DashboardAccount[]>
  membersNetworth: MemberNetWorth[]
  categoryBreakdown: CategoryBreakdownItem[]
  onRequestMemberHoldings: (memberId: number) => void
}

function rowGain(r: Row) { return r.current - r.invested }
function rowGainPct(r: Row) { return r.invested > 0 ? (rowGain(r) / r.invested) * 100 : 0 }

function gainColor(g: number) {
  if (g > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (g < 0) return 'text-rose-600 dark:text-rose-400'
  return 'text-[var(--text-muted)]'
}

function sumHoldings(hs: DashboardHolding[]) {
  return hs.reduce(
    (acc, h) => ({ current: acc.current + parseFloat(h.market_value), invested: acc.invested + parseFloat(h.net_invested) }),
    { current: 0, invested: 0 },
  )
}

function sumAccounts(as_: DashboardAccount[]) {
  return as_.reduce((s, a) => s + parseFloat(a.balance), 0)
}

function matchesSearch(text: string, q: string) {
  return text.toLowerCase().includes(q.toLowerCase())
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`inline-block transition-transform duration-150 ${open ? 'rotate-90' : ''} mr-1 text-[var(--text-muted)] text-[10px]`}>▶</span>
  )
}

// hidden on mobile, shown sm+: Invested (col 3), Gain ₹ (col 4), Alloc % (col 6)
const HIDE_MOBILE = 'hidden sm:table-cell'

type ColHeaderProps = { label: string; col: SortCol; sortCol: SortCol; sortDir: 'asc' | 'desc'; onSort: (c: SortCol) => void; className?: string }
function ColHeader({ label, col, sortCol, sortDir, onSort, className }: ColHeaderProps) {
  const active = sortCol === col
  return (
    <th
      className={`cursor-pointer select-none whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] hover:text-[var(--text)] ${className ?? ''}`}
      onClick={() => onSort(col)}
    >
      {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

// Leaf rows for instruments
function InstrumentLeafRows({ instruments, totalCurrent, q }: { instruments: DashboardHolding[]; totalCurrent: number; q: string }) {
  const filtered = q
    ? instruments.filter(h => matchesSearch(h.instrument_name, q) || matchesSearch(TYPE_LABELS[h.instrument_type] ?? h.instrument_type, q))
    : instruments
  if (filtered.length === 0) return null
  return (
    <>
      {filtered.map(h => {
        const cur = parseFloat(h.market_value)
        const inv = parseFloat(h.net_invested)
        const g = cur - inv
        return (
          <tr key={h.instrument_id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]/50 transition-colors">
            <td className="pl-12 pr-2 py-1.5 text-xs text-[var(--text-2)]">{h.instrument_name}</td>
            <td className="px-2 py-1.5 text-right text-xs tabular-nums"><Money value={cur} /></td>
            <td className={`px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text-muted)] ${HIDE_MOBILE}`}><Money value={inv} /></td>
            <td className={`px-2 py-1.5 text-right text-xs tabular-nums ${gainColor(g)} ${HIDE_MOBILE}`}>{g >= 0 ? '+' : ''}<Money value={g} /></td>
            <td className={`px-2 py-1.5 text-right text-xs tabular-nums ${gainColor(g)}`}>
              {inv > 0 ? `${g >= 0 ? '+' : ''}${((g / inv) * 100).toFixed(1)}%` : '—'}
            </td>
            <td className={`px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text-muted)] ${HIDE_MOBILE}`}>
              {totalCurrent > 0 ? `${((cur / totalCurrent) * 100).toFixed(1)}%` : '—'}
            </td>
          </tr>
        )
      })}
    </>
  )
}

// Leaf rows for accounts (no gain columns)
function AccountLeafRows({ accounts, totalCurrent, q }: { accounts: DashboardAccount[]; totalCurrent: number; q: string }) {
  const filtered = q
    ? accounts.filter(a => matchesSearch(a.account_name, q) || matchesSearch(ACCT_TYPE_LABELS[a.account_type] ?? a.account_type, q))
    : accounts
  if (filtered.length === 0) return null
  return (
    <>
      {filtered.map(a => {
        const bal = parseFloat(a.balance)
        return (
          <tr key={a.account_id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]/50 transition-colors">
            <td className="pl-12 pr-2 py-1.5 text-xs text-[var(--text-2)]">{a.account_name}</td>
            <td className="px-2 py-1.5 text-right text-xs tabular-nums"><Money value={bal} /></td>
            <td className={`px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text-muted)] ${HIDE_MOBILE}`}>—</td>
            <td className={`px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text-muted)] ${HIDE_MOBILE}`}>—</td>
            <td className="px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text-muted)]">—</td>
            <td className={`px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text-muted)] ${HIDE_MOBILE}`}>
              {totalCurrent > 0 ? `${((bal / totalCurrent) * 100).toFixed(1)}%` : '—'}
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ── By Type ─────────────────────────────────────────────────────────────────

function ByTypeView({
  holdings, accounts, memberHoldings, memberAccounts, membersNetworth, sortCol, sortDir, q, onRequestMemberHoldings,
}: {
  holdings: DashboardHolding[]
  accounts: DashboardAccount[]
  memberHoldings: Record<number, DashboardHolding[]>
  memberAccounts: Record<number, DashboardAccount[]>
  membersNetworth: MemberNetWorth[]
  sortCol: SortCol
  sortDir: 'asc' | 'desc'
  q: string
  onRequestMemberHoldings: (id: number) => void
}) {
  const fmtINR = useMaskedFmt()
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())
  const [expandedSub, setExpandedSub] = useState<Set<string>>(new Set())

  const totalCurrent = useMemo(() => {
    const hTotal = holdings.reduce((s, h) => s + parseFloat(h.market_value), 0)
    const aTotal = sumAccounts(accounts)
    return hTotal + aTotal
  }, [holdings, accounts])

  const byType = useMemo(() => {
    const map = new Map<string, DashboardHolding[]>()
    for (const h of holdings) {
      const arr = map.get(h.instrument_type) ?? []
      arr.push(h)
      map.set(h.instrument_type, arr)
    }
    return map
  }, [holdings])

  const typeRows: Row[] = useMemo(() => {
    return [...byType.entries()].map(([type, hs]) => {
      const { current, invested } = sumHoldings(hs)
      return { key: `type:${type}`, label: TYPE_LABELS[type] ?? type, current, invested }
    })
  }, [byType])

  const accountsTotal = useMemo(() => sumAccounts(accounts), [accounts])
  const accountsRow: Row | null = accounts.length > 0
    ? { key: 'type:__accounts__', label: 'Savings & Accounts', current: accountsTotal, invested: 0 }
    : null

  const allRows = useMemo(() => {
    const rows = [...typeRows, ...(accountsRow ? [accountsRow] : [])]
    return rows.sort((a, b) => {
      let va: number | string, vb: number | string
      if (sortCol === 'name') { va = a.label; vb = b.label }
      else if (sortCol === 'current') { va = a.current; vb = b.current }
      else if (sortCol === 'invested') { va = a.invested; vb = b.invested }
      else if (sortCol === 'gain') { va = rowGain(a); vb = rowGain(b) }
      else if (sortCol === 'gainPct') { va = rowGainPct(a); vb = rowGainPct(b) }
      else { va = a.current; vb = b.current }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return sortDir === 'asc' ? va - (vb as number) : (vb as number) - va
    })
  }, [typeRows, accountsRow, sortCol, sortDir])

  const filtered = useMemo(() => {
    if (!q) return allRows
    return allRows.filter(r => {
      if (r.key === 'type:__accounts__') return accounts.some(a => matchesSearch(a.account_name, q) || matchesSearch(ACCT_TYPE_LABELS[a.account_type] ?? a.account_type, q))
      const type = r.key.replace('type:', '')
      return matchesSearch(r.label, q) || (byType.get(type) ?? []).some(h => matchesSearch(h.instrument_name, q))
    })
  }, [allRows, q, byType, accounts])

  const toggle = (key: string) => setExpandedTypes(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const toggleSub = (key: string) => setExpandedSub(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const allMembersLoaded = membersNetworth.every(m => memberHoldings[m.member_id] !== undefined && memberAccounts[m.member_id] !== undefined)

  return (
    <>
      {filtered.map(row => {
        const isOpen = expandedTypes.has(row.key)
        const g = rowGain(row)
        const isAccounts = row.key === 'type:__accounts__'
        const type = row.key.replace('type:', '')
        const typeHoldings = isAccounts ? [] : (byType.get(type) ?? [])

        const memberRows = isOpen && !isAccounts
          ? membersNetworth.map(m => {
              const mh = memberHoldings[m.member_id]
              if (!mh) return null
              const hs = mh.filter(h => h.instrument_type === type)
              if (hs.length === 0) return null
              return { memberId: m.member_id, name: m.member_name, hs, accts: [] as DashboardAccount[] }
            }).filter(Boolean) as { memberId: number; name: string; hs: DashboardHolding[]; accts: DashboardAccount[] }[]
          : isOpen && isAccounts
          ? membersNetworth.map(m => {
              const ma = memberAccounts[m.member_id]
              if (!ma) return null
              if (ma.length === 0) return null
              return { memberId: m.member_id, name: m.member_name, hs: [] as DashboardHolding[], accts: ma }
            }).filter(Boolean) as { memberId: number; name: string; hs: DashboardHolding[]; accts: DashboardAccount[] }[]
          : []

        return (
          <ExpandableGroup key={row.key} isOpen={isOpen} g={g} row={row} totalCurrent={totalCurrent} fmtINR={fmtINR}
            onClick={() => {
              toggle(row.key)
              if (!allMembersLoaded) membersNetworth.forEach(m => onRequestMemberHoldings(m.member_id))
            }}
          >
            {isOpen && !allMembersLoaded && <LoadingRow key={`${row.key}-load`} />}
            {isOpen && allMembersLoaded && memberRows.length === 0 && !isAccounts && (
              <InstrumentLeafRows key={`${row.key}-instr`} instruments={typeHoldings} totalCurrent={row.current} q={q} />
            )}
            {isOpen && allMembersLoaded && isAccounts && memberRows.length === 0 && (
              <AccountLeafRows key={`${row.key}-accts`} accounts={accounts} totalCurrent={row.current} q={q} />
            )}
            {isOpen && allMembersLoaded && memberRows.map(mr => {
              const { current: mc, invested: mi } = mr.hs.length > 0 ? sumHoldings(mr.hs) : { current: sumAccounts(mr.accts), invested: 0 }
              const mg = mc - mi
              const subKey = `${row.key}:${mr.memberId}`
              const subOpen = expandedSub.has(subKey)
              return (
                <SubExpandableGroup key={subKey} subKey={subKey} label={mr.name} current={mc} invested={mi} g={mg}
                  parentCurrent={row.current} subOpen={subOpen} fmtINR={fmtINR}
                  onClick={e => { e.stopPropagation(); toggleSub(subKey) }}
                >
                  {subOpen && mr.hs.length > 0 && <InstrumentLeafRows key={`${subKey}-instr`} instruments={mr.hs} totalCurrent={mc} q={q} />}
                  {subOpen && mr.accts.length > 0 && <AccountLeafRows key={`${subKey}-accts`} accounts={mr.accts} totalCurrent={mc} q={q} />}
                </SubExpandableGroup>
              )
            })}
          </ExpandableGroup>
        )
      })}
    </>
  )
}

// ── By Member ────────────────────────────────────────────────────────────────

function ByMemberView({
  memberHoldings, memberAccounts, membersNetworth, sortCol, sortDir, q, onRequestMemberHoldings,
}: {
  memberHoldings: Record<number, DashboardHolding[]>
  memberAccounts: Record<number, DashboardAccount[]>
  membersNetworth: MemberNetWorth[]
  sortCol: SortCol
  sortDir: 'asc' | 'desc'
  q: string
  onRequestMemberHoldings: (id: number) => void
}) {
  const fmtINR = useMaskedFmt()
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(new Set())
  const [expandedSub, setExpandedSub] = useState<Set<string>>(new Set())

  const totalCurrent = useMemo(() => {
    return membersNetworth.reduce((s, m) => {
      const hs = memberHoldings[m.member_id] ?? []
      const as_ = memberAccounts[m.member_id] ?? []
      return s + sumHoldings(hs).current + sumAccounts(as_)
    }, 0)
  }, [memberHoldings, memberAccounts, membersNetworth])

  const memberRows: Row[] = useMemo(() => {
    return membersNetworth.map(m => {
      const hs = memberHoldings[m.member_id] ?? []
      const as_ = memberAccounts[m.member_id] ?? []
      const { current: hc, invested } = sumHoldings(hs)
      const current = hc + sumAccounts(as_)
      return { key: String(m.member_id), label: m.member_name, current, invested }
    })
  }, [membersNetworth, memberHoldings, memberAccounts])

  const sorted = useMemo(() => {
    return [...memberRows].sort((a, b) => {
      let va: number | string, vb: number | string
      if (sortCol === 'name') { va = a.label; vb = b.label }
      else if (sortCol === 'current') { va = a.current; vb = b.current }
      else if (sortCol === 'invested') { va = a.invested; vb = b.invested }
      else if (sortCol === 'gain') { va = rowGain(a); vb = rowGain(b) }
      else if (sortCol === 'gainPct') { va = rowGainPct(a); vb = rowGainPct(b) }
      else { va = a.current; vb = b.current }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return sortDir === 'asc' ? va - (vb as number) : (vb as number) - va
    })
  }, [memberRows, sortCol, sortDir])

  const filtered = useMemo(() => {
    if (!q) return sorted
    return sorted.filter(r => {
      const memberId = parseInt(r.key)
      const hs = memberHoldings[memberId] ?? []
      const as_ = memberAccounts[memberId] ?? []
      return (
        matchesSearch(r.label, q) ||
        hs.some(h => matchesSearch(h.instrument_name, q) || matchesSearch(TYPE_LABELS[h.instrument_type] ?? h.instrument_type, q)) ||
        as_.some(a => matchesSearch(a.account_name, q))
      )
    })
  }, [sorted, q, memberHoldings, memberAccounts])

  const toggle = (id: number) => {
    setExpandedMembers(prev => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id) } else { n.add(id); onRequestMemberHoldings(id) }
      return n
    })
  }
  const toggleSub = (key: string) => setExpandedSub(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  return (
    <>
      {filtered.map(row => {
        const memberId = parseInt(row.key)
        const isOpen = expandedMembers.has(memberId)
        const g = rowGain(row)
        const hs = memberHoldings[memberId]
        const as_ = memberAccounts[memberId]
        const isLoading = isOpen && (hs === undefined || as_ === undefined)

        const byType = new Map<string, DashboardHolding[]>()
        if (hs) for (const h of hs) { const arr = byType.get(h.instrument_type) ?? []; arr.push(h); byType.set(h.instrument_type, arr) }

        return (
          <ExpandableGroup key={row.key} isOpen={isOpen} g={g} row={row} totalCurrent={totalCurrent} fmtINR={fmtINR}
            onClick={() => toggle(memberId)}
          >
            {isOpen && isLoading && <LoadingRow key={`${row.key}-load`} />}
            {isOpen && !isLoading && (
              <>
                {[...byType.entries()].map(([type, typeHs]) => {
                  const { current: tc, invested: ti } = sumHoldings(typeHs)
                  const tg = tc - ti
                  const subKey = `${row.key}:${type}`
                  const subOpen = expandedSub.has(subKey)
                  return (
                    <SubExpandableGroup key={subKey} subKey={subKey} label={TYPE_LABELS[type] ?? type}
                      current={tc} invested={ti} g={tg} parentCurrent={row.current} subOpen={subOpen} fmtINR={fmtINR}
                      onClick={e => { e.stopPropagation(); toggleSub(subKey) }}
                    >
                      {subOpen && <InstrumentLeafRows key={`${subKey}-instr`} instruments={typeHs} totalCurrent={tc} q={q} />}
                    </SubExpandableGroup>
                  )
                })}
                {(as_ ?? []).length > 0 && (() => {
                  const acTotal = sumAccounts(as_!)
                  const subKey = `${row.key}:__accounts__`
                  const subOpen = expandedSub.has(subKey)
                  return (
                    <SubExpandableGroup key={subKey} subKey={subKey} label="Savings & Accounts"
                      current={acTotal} invested={0} g={0} parentCurrent={row.current} subOpen={subOpen} fmtINR={fmtINR}
                      noGain
                      onClick={e => { e.stopPropagation(); toggleSub(subKey) }}
                    >
                      {subOpen && <AccountLeafRows key={`${subKey}-accts`} accounts={as_!} totalCurrent={acTotal} q={q} />}
                    </SubExpandableGroup>
                  )
                })()}
              </>
            )}
          </ExpandableGroup>
        )
      })}
    </>
  )
}

// ── By Category ──────────────────────────────────────────────────────────────

function ByCategoryView({
  holdings, accounts, categoryBreakdown, sortCol, sortDir, q,
}: {
  holdings: DashboardHolding[]
  accounts: DashboardAccount[]
  categoryBreakdown: CategoryBreakdownItem[]
  sortCol: SortCol
  sortDir: 'asc' | 'desc'
  q: string
}) {
  const fmtINR = useMaskedFmt()
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [expandedSub, setExpandedSub] = useState<Set<string>>(new Set())

  const totalCurrent = useMemo(() => {
    return holdings.reduce((s, h) => s + parseFloat(h.market_value), 0) + sumAccounts(accounts)
  }, [holdings, accounts])

  const byCategory = useMemo(() => {
    const map = new Map<string, { label: string; color: string; hs: DashboardHolding[] }>()
    for (const h of holdings) {
      const key = String(h.asset_category ?? 'null')
      if (!map.has(key)) {
        const cat = categoryBreakdown.find(c => c.category_id === h.asset_category)
        map.set(key, { label: cat?.category_name ?? 'Uncategorised', color: cat?.color ?? '#94a3b8', hs: [] })
      }
      map.get(key)!.hs.push(h)
    }
    return map
  }, [holdings, categoryBreakdown])

  const catRows: (Row & { color: string })[] = useMemo(() => {
    const rows = [...byCategory.entries()].map(([key, { label, color, hs }]) => {
      const { current, invested } = sumHoldings(hs)
      return { key: `cat:${key}`, label, color, current, invested }
    })
    if (accounts.length > 0) {
      rows.push({ key: 'cat:__accounts__', label: 'Savings & Accounts', color: '#64748b', current: sumAccounts(accounts), invested: 0 })
    }
    return rows
  }, [byCategory, accounts])

  const sorted = useMemo(() => {
    return [...catRows].sort((a, b) => {
      let va: number | string, vb: number | string
      if (sortCol === 'name') { va = a.label; vb = b.label }
      else if (sortCol === 'current') { va = a.current; vb = b.current }
      else if (sortCol === 'invested') { va = a.invested; vb = b.invested }
      else if (sortCol === 'gain') { va = rowGain(a); vb = rowGain(b) }
      else if (sortCol === 'gainPct') { va = rowGainPct(a); vb = rowGainPct(b) }
      else { va = a.current; vb = b.current }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return sortDir === 'asc' ? va - (vb as number) : (vb as number) - va
    })
  }, [catRows, sortCol, sortDir])

  const filtered = useMemo(() => {
    if (!q) return sorted
    return sorted.filter(r => {
      if (r.key === 'cat:__accounts__') return accounts.some(a => matchesSearch(a.account_name, q))
      const catKey = r.key.replace('cat:', '')
      const hs = byCategory.get(catKey)?.hs ?? []
      return matchesSearch(r.label, q) || hs.some(h => matchesSearch(h.instrument_name, q) || matchesSearch(TYPE_LABELS[h.instrument_type] ?? h.instrument_type, q))
    })
  }, [sorted, q, byCategory, accounts])

  const toggle = (key: string) => setExpandedCats(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const toggleSub = (key: string) => setExpandedSub(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  return (
    <>
      {filtered.map(row => {
        const isOpen = expandedCats.has(row.key)
        const g = rowGain(row)
        const isAccounts = row.key === 'cat:__accounts__'
        const catKey = row.key.replace('cat:', '')
        const catHoldings = isAccounts ? [] : (byCategory.get(catKey)?.hs ?? [])

        const byType = new Map<string, DashboardHolding[]>()
        if (!isAccounts) for (const h of catHoldings) { const arr = byType.get(h.instrument_type) ?? []; arr.push(h); byType.set(h.instrument_type, arr) }

        return (
          <ExpandableGroup key={row.key} isOpen={isOpen} g={g} row={row} totalCurrent={totalCurrent} fmtINR={fmtINR}
            colorDot={row.color} noGain={isAccounts}
            onClick={() => toggle(row.key)}
          >
            {isOpen && isAccounts && <AccountLeafRows key={`${row.key}-accts`} accounts={accounts} totalCurrent={row.current} q={q} />}
            {isOpen && !isAccounts && [...byType.entries()].map(([type, typeHs]) => {
              const { current: tc, invested: ti } = sumHoldings(typeHs)
              const tg = tc - ti
              const subKey = `${row.key}:${type}`
              const subOpen = expandedSub.has(subKey)
              return (
                <SubExpandableGroup key={subKey} subKey={subKey} label={TYPE_LABELS[type] ?? type}
                  current={tc} invested={ti} g={tg} parentCurrent={row.current} subOpen={subOpen} fmtINR={fmtINR}
                  onClick={e => { e.stopPropagation(); toggleSub(subKey) }}
                >
                  {subOpen && <InstrumentLeafRows key={`${subKey}-instr`} instruments={typeHs} totalCurrent={tc} q={q} />}
                </SubExpandableGroup>
              )
            })}
          </ExpandableGroup>
        )
      })}
    </>
  )
}

// ── Shared row primitives ─────────────────────────────────────────────────────

function LoadingRow() {
  return (
    <tr><td colSpan={6} className="py-2 pl-8 text-xs text-[var(--text-muted)]">Loading…</td></tr>
  )
}

function ExpandableGroup({ row, isOpen, g, totalCurrent, fmtINR, colorDot, noGain, onClick, children }: {
  row: Row; isOpen: boolean; g: number; totalCurrent: number; fmtINR: (v: number) => string
  colorDot?: string; noGain?: boolean; onClick: () => void; children?: React.ReactNode
}) {
  return (
    <>
      <tr className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors" onClick={onClick}>
        <td className="py-2.5 pl-3 pr-2 text-sm font-semibold text-[var(--text)]">
          <Chevron open={isOpen} />
          {colorDot && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorDot }} />}
          {row.label}
        </td>
        <td className="px-2 py-2.5 text-right text-sm font-semibold tabular-nums"><Money value={row.current} /></td>
        <td className={`px-2 py-2.5 text-right text-sm tabular-nums text-[var(--text-muted)] ${HIDE_MOBILE}`}>{noGain ? '—' : <Money value={row.invested} />}</td>
        <td className={`px-2 py-2.5 text-right text-sm tabular-nums ${noGain ? 'text-[var(--text-muted)]' : gainColor(g)} ${HIDE_MOBILE}`}>
          {noGain ? '—' : `${g >= 0 ? '+' : ''}${fmtINR(g)}`}
        </td>
        <td className={`px-2 py-2.5 text-right text-sm tabular-nums ${noGain ? 'text-[var(--text-muted)]' : gainColor(g)}`}>
          {noGain || row.invested === 0 ? '—' : `${g >= 0 ? '+' : ''}${rowGainPct(row).toFixed(1)}%`}
        </td>
        <td className={`px-2 py-2.5 text-right text-sm tabular-nums text-[var(--text-muted)] ${HIDE_MOBILE}`}>
          {totalCurrent > 0 ? `${((row.current / totalCurrent) * 100).toFixed(1)}%` : '—'}
        </td>
      </tr>
      {children}
    </>
  )
}

function SubExpandableGroup({ subKey, label, current, invested, g, parentCurrent, subOpen, fmtINR, noGain, onClick, children }: {
  subKey: string; label: string; current: number; invested: number; g: number
  parentCurrent: number; subOpen: boolean; fmtINR: (v: number) => string
  noGain?: boolean; onClick: (e: React.MouseEvent) => void; children?: React.ReactNode
}) {
  return (
    <>
      <tr key={subKey} className="cursor-pointer border-t border-[var(--border)] bg-[var(--surface-2)] hover:opacity-80 transition-opacity" onClick={onClick}>
        <td className="py-1.5 pl-7 pr-2 text-xs font-medium text-[var(--text-2)]"><Chevron open={subOpen} />{label}</td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums"><Money value={current} /></td>
        <td className={`px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text-muted)] ${HIDE_MOBILE}`}>{noGain ? '—' : <Money value={invested} />}</td>
        <td className={`px-2 py-1.5 text-right text-xs tabular-nums ${noGain ? 'text-[var(--text-muted)]' : gainColor(g)} ${HIDE_MOBILE}`}>
          {noGain ? '—' : `${g >= 0 ? '+' : ''}${fmtINR(g)}`}
        </td>
        <td className={`px-2 py-1.5 text-right text-xs tabular-nums ${noGain ? 'text-[var(--text-muted)]' : gainColor(g)}`}>
          {noGain || invested === 0 ? '—' : `${g >= 0 ? '+' : ''}${((g / invested) * 100).toFixed(1)}%`}
        </td>
        <td className={`px-2 py-1.5 text-right text-xs tabular-nums text-[var(--text-muted)] ${HIDE_MOBILE}`}>
          {parentCurrent > 0 ? `${((current / parentCurrent) * 100).toFixed(1)}%` : '—'}
        </td>
      </tr>
      {children}
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SummaryTable({
  holdings, accounts, memberHoldings, memberAccounts, membersNetworth, categoryBreakdown, onRequestMemberHoldings,
}: Props) {
  const [dimension, setDimension] = useState<Dimension>('type')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('current')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (col: SortCol) => {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const dimPill = (d: Dimension, label: string) => (
    <button
      type="button"
      onClick={() => setDimension(d)}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        dimension === d ? 'bg-indigo-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]'
      }`}
    >
      {label}
    </button>
  )

  const sharedColProps = { sortCol, sortDir, onSort: handleSort }

  return (
    <div>
      {/* Controls: stacked on mobile, side-by-side on sm+ */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Portfolio Summary</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1">
            {dimPill('type', 'By Type')}
            {dimPill('member', 'By Member')}
            {dimPill('category', 'By Category')}
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-7 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-32"
          />
        </div>
      </div>

      {/* Table: 3 cols on mobile (Name, Current, Gain %), 6 cols on sm+ */}
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[280px] border-collapse text-sm">
          <thead className="bg-[var(--surface-2)]">
            <tr>
              <ColHeader label="Name" col="name" {...sharedColProps} className="text-left pl-3" />
              <ColHeader label="Current" col="current" {...sharedColProps} />
              <ColHeader label="Invested" col="invested" {...sharedColProps} className={HIDE_MOBILE} />
              <ColHeader label="Gain ₹" col="gain" {...sharedColProps} className={HIDE_MOBILE} />
              <ColHeader label="Gain %" col="gainPct" {...sharedColProps} />
              <th className={`whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] ${HIDE_MOBILE}`}>Alloc %</th>
            </tr>
          </thead>
          <tbody>
            {dimension === 'type' && (
              <ByTypeView
                holdings={holdings} accounts={accounts}
                memberHoldings={memberHoldings} memberAccounts={memberAccounts}
                membersNetworth={membersNetworth}
                sortCol={sortCol} sortDir={sortDir} q={search}
                onRequestMemberHoldings={onRequestMemberHoldings}
              />
            )}
            {dimension === 'member' && (
              <ByMemberView
                memberHoldings={memberHoldings} memberAccounts={memberAccounts}
                membersNetworth={membersNetworth}
                sortCol={sortCol} sortDir={sortDir} q={search}
                onRequestMemberHoldings={onRequestMemberHoldings}
              />
            )}
            {dimension === 'category' && (
              <ByCategoryView
                holdings={holdings} accounts={accounts}
                categoryBreakdown={categoryBreakdown}
                sortCol={sortCol} sortDir={sortDir} q={search}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
