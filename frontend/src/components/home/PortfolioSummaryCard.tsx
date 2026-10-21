import { useCallback, useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { NONE } from '../../hooks/useFilters'
import { accountsLink, holdingsLink } from '../../lib/deepLinks'
import { Amount } from '../ui/Amount'
import { Card } from '../ui/Card'
import { DataTable } from '../ui/DataTable'
import type { DataTableColumn } from '../ui/DataTable'
import { Delta } from '../ui/Delta'
import { SearchInput } from '../ui/Input'
import { Tabs } from '../ui/Tabs'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { ACCOUNT_TYPE_LABELS } from '../../lib/labels'
import { TYPE_LABELS } from '../../lib/instrumentTypes'
import { assetTypeColor } from '../../lib/palette'
import type { CategoryBreakdownItem, DashboardAccount, DashboardHolding, MemberNetWorth } from '../../types/domain'

type Dimension = 'type' | 'member' | 'category'

type Props = {
  holdings: DashboardHolding[]
  accounts: DashboardAccount[]
  memberHoldings: Record<number, DashboardHolding[]>
  memberAccounts: Record<number, DashboardAccount[]>
  membersNetworth: MemberNetWorth[]
  categoryBreakdown: CategoryBreakdownItem[]
}

/** A row of the summary tree: a group (type / member / category) or a leaf (holding / account). */
type Node = {
  key: string
  label: string
  /** Muted second line (search results: where the leaf sits). */
  caption?: string
  current: number
  invested: number
  /** Accounts have a balance, not a gain. */
  noGain?: boolean
  color?: string
  children?: Node[]
  /** Investments / Accounts, filtered to this row (lib/deepLinks.ts). */
  link?: string
  linkLabel?: string
}

const ACCOUNTS_LABEL = 'Savings & accounts'
const num = (s: string) => parseFloat(s) || 0
const byCurrent = (a: Node, b: Node) => b.current - a.current

function leafHolding(h: DashboardHolding, prefix: string): Node {
  const label = h.display_name || h.instrument_name
  return {
    key: `${prefix}:h:${h.investment_id ?? h.instrument_id}`, label, current: num(h.market_value), invested: num(h.net_invested),
    // Same key format as the Investments page's rows (inv:<id> / inst:<id>) — opens its drawer.
    link: holdingsLink({}, h.investment_id ? `inv:${h.investment_id}` : `inst:${h.instrument_id}`),
    linkLabel: `Open ${label} in Investments`,
  }
}
function leafAccount(a: DashboardAccount, prefix: string): Node {
  return {
    key: `${prefix}:a:${a.account_id}`, label: a.account_name, caption: ACCOUNT_TYPE_LABELS[a.account_type] ?? a.account_type,
    current: num(a.balance), invested: 0, noGain: true,
    link: accountsLink({}, a.account_id), linkLabel: `Open ${a.account_name} in Accounts`,
  }
}

const toHoldings = (filters: Parameters<typeof holdingsLink>[0], what: string): Partial<Node> =>
  ({ link: holdingsLink(filters), linkLabel: `View ${what} in Investments` })
const toAccounts = (filters: Parameters<typeof accountsLink>[0], what: string): Partial<Node> =>
  ({ link: accountsLink(filters), linkLabel: `View ${what} in Accounts` })
function group(key: string, label: string, children: Node[], extra: Partial<Node> = {}): Node {
  const sorted = [...children].sort(byCurrent)
  return {
    key, label, children: sorted,
    current: sorted.reduce((s, c) => s + c.current, 0),
    invested: sorted.reduce((s, c) => s + c.invested, 0),
    noGain: sorted.every((c) => c.noGain),
    ...extra,
  }
}
function byKey<T>(xs: T[], keyOf: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of xs) { const k = keyOf(x); m.set(k, [...(m.get(k) ?? []), x]) }
  return m
}

function buildTree(dim: Dimension, p: Props, ownerOf: (memberId: number, fallback: string) => string): Node[] {
  const multi = p.membersNetworth.length > 1
  const membersLoaded = p.membersNetworth.every((m) => p.memberHoldings[m.member_id] !== undefined)

  if (dim === 'member') {
    return p.membersNetworth.map((m) => {
      const hs = p.memberHoldings[m.member_id] ?? []
      const as = p.memberAccounts[m.member_id] ?? []
      const owner = ownerOf(m.member_id, m.member_name)
      const types = [...byKey(hs, (h) => h.instrument_type)].map(([t, list]) =>
        group(`m${m.member_id}:t:${t}`, TYPE_LABELS[t] ?? t, list.map((h) => leafHolding(h, `m${m.member_id}`)),
          { color: assetTypeColor(t), ...toHoldings({ owner: [owner], type: [TYPE_LABELS[t] ?? t] }, `${owner}’s ${TYPE_LABELS[t] ?? t}`) }))
      const acc = as.length ? [group(`m${m.member_id}:acc`, ACCOUNTS_LABEL, as.map((a) => leafAccount(a, `m${m.member_id}`)),
        { color: assetTypeColor('cash'), ...toAccounts({ owner: [owner] }, `${owner}’s accounts`) })] : []
      return group(`m:${m.member_id}`, m.member_name, [...types, ...acc], toHoldings({ owner: [owner] }, `${owner}’s holdings`))
    })
  }

  if (dim === 'category') {
    const cats = byKey(p.holdings, (h) => String(h.asset_category ?? 'none'))
    const nodes = [...cats].map(([id, list]) => {
      const cat = p.categoryBreakdown.find((c) => String(c.category_id ?? 'none') === id)
      const name = cat?.category_name ?? 'Uncategorised'
      return group(`c:${id}`, name, list.map((h) => leafHolding(h, `c${id}`)),
        { color: cat?.color ?? 'var(--series-other)', ...toHoldings({ category: [id === 'none' || !cat ? NONE : cat.category_name] }, name) })
    })
    if (p.accounts.length) nodes.push(group('c:acc', ACCOUNTS_LABEL, p.accounts.map((a) => leafAccount(a, 'cacc')), { color: assetTypeColor('cash'), ...toAccounts({}, 'all accounts') }))
    return nodes
  }

  // By type → (member →) holding
  const nodes = [...byKey(p.holdings, (h) => h.instrument_type)].map(([t, list]) => {
    const children = multi && membersLoaded
      ? p.membersNetworth
        .map((m) => {
          const hs = (p.memberHoldings[m.member_id] ?? []).filter((h) => h.instrument_type === t)
          const owner = ownerOf(m.member_id, m.member_name)
          return hs.length ? group(`t:${t}:m${m.member_id}`, m.member_name, hs.map((h) => leafHolding(h, `t${t}m${m.member_id}`)),
            toHoldings({ type: [TYPE_LABELS[t] ?? t], owner: [owner] }, `${owner}’s ${TYPE_LABELS[t] ?? t}`)) : null
        })
        .filter((n): n is Node => n !== null)
      : list.map((h) => leafHolding(h, `t${t}`))
    const g = group(`t:${t}`, TYPE_LABELS[t] ?? t, children, { color: assetTypeColor(t), ...toHoldings({ type: [TYPE_LABELS[t] ?? t] }, TYPE_LABELS[t] ?? t) })
    // Member shares are proportional splits; keep the household figures on the type row.
    const totals = list.reduce((s, h) => ({ current: s.current + num(h.market_value), invested: s.invested + num(h.net_invested) }), { current: 0, invested: 0 })
    return { ...g, ...totals }
  })
  if (p.accounts.length) {
    const children = multi && membersLoaded
      ? p.membersNetworth
        .map((m) => {
          const as = p.memberAccounts[m.member_id] ?? []
          const owner = ownerOf(m.member_id, m.member_name)
          return as.length ? group(`t:acc:m${m.member_id}`, m.member_name, as.map((a) => leafAccount(a, `taccm${m.member_id}`)),
            toAccounts({ owner: [owner] }, `${owner}’s accounts`)) : null
        })
        .filter((n): n is Node => n !== null)
      : p.accounts.map((a) => leafAccount(a, 'tacc'))
    const g = group('t:acc', ACCOUNTS_LABEL, children, { color: assetTypeColor('cash'), ...toAccounts({}, 'all accounts') })
    nodes.push({ ...g, current: p.accounts.reduce((s, a) => s + num(a.balance), 0), invested: 0, noGain: true })
  }
  return nodes
}

function leaves(nodes: Node[], path: string[] = []): Node[] {
  return nodes.flatMap((n) => n.children?.length
    ? leaves(n.children, [...path, n.label])
    : [{ ...n, caption: [...path, n.caption].filter(Boolean).join(' · ') }])
}

/** Portfolio summary: one table, three ways to slice it, rows expand down to each holding. */
export function PortfolioSummaryCard(props: Props) {
  const [dim, setDim] = useState<Dimension>('type')
  const [q, setQ] = useState('')
  const { members } = useApp()
  const isMobile = useIsMobile()
  // The Owner filter matches the app's member labels — use those for links.
  const ownerOf = useCallback((id: number, fallback: string) => members.find((m) => m.id === id)?.label ?? fallback, [members])
  const tree = useMemo(() => buildTree(dim, props, ownerOf), [dim, props, ownerOf])
  const total = useMemo(() => tree.reduce((s, n) => s + n.current, 0), [tree])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return tree
    return leaves(tree).filter((n) => `${n.label} ${n.caption ?? ''}`.toLowerCase().includes(needle))
  }, [tree, q])

  const columns: DataTableColumn<Node>[] = [
    {
      key: 'name', label: 'Name', sortable: true, sortValue: (n) => n.label, mobile: 'title',
      render: (n) => (
        <span className="flex min-w-0 items-center gap-2">
          {n.color && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: n.color }} aria-hidden />}
          <span className="min-w-0">
            <span className={n.children ? 'block truncate font-medium text-ink' : 'block truncate text-ink-2'}>{n.label}</span>
            {n.caption && <span className="block truncate text-xs text-ink-muted">{n.caption}</span>}
          </span>
        </span>
      ),
    },
    { key: 'current', label: 'Current', align: 'right', sortable: true, sortValue: (n) => n.current, mobile: 'value',
      render: (n) => <Amount value={n.current} /> },
    { key: 'invested', label: 'Invested', align: 'right', sortable: true, sortValue: (n) => n.invested, mobile: 'hide',
      render: (n) => (n.noGain ? <span className="text-ink-muted">—</span> : <Amount value={n.invested} tone="muted" />) },
    { key: 'gain', label: 'Gain', align: 'right', sortable: true, sortValue: (n) => (n.noGain ? null : n.current - n.invested), mobile: 'hide',
      render: (n) => (n.noGain || n.invested <= 0 ? <span className="text-ink-muted">—</span> : <Amount value={n.current - n.invested} signed tone="gain" />) },
    { key: 'gainPct', label: 'Gain %', align: 'right', sortable: true, mobile: 'meta',
      sortValue: (n) => (n.noGain || n.invested <= 0 ? null : ((n.current - n.invested) / n.invested) * 100),
      render: (n) => (n.noGain || n.invested <= 0 ? <span className="text-ink-muted">—</span> : <Delta value={((n.current - n.invested) / n.invested) * 100} />) },
    { key: 'alloc', label: 'Share', align: 'right', sortable: true, sortValue: (n) => n.current, mobile: 'hide',
      render: (n) => <span className="text-ink-muted">{total > 0 ? `${((n.current / total) * 100).toFixed(1)}%` : '—'}</span> },
    {
      key: 'open', label: '', width: '3rem', mobile: 'hide',
      render: (n) => n.link ? (
        <a href={n.link} onClick={(e) => e.stopPropagation()} aria-label={n.linkLabel} title={n.linkLabel}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-ink-muted hover:bg-surface-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
      ) : null,
    },
  ]

  return (
    <Card
      title="Portfolio summary"
      flush
      actions={(
        <Tabs label="Slice portfolio by" active={dim} onChange={setDim}
          tabs={[{ key: 'type', label: 'By type' }, { key: 'member', label: 'By member' }, { key: 'category', label: 'By category' }]} />
      )}
    >
      <div className="grid gap-3 px-4 pb-4 md:px-6 md:pb-6">
        <SearchInput value={q} onChange={setQ} placeholder="Search holdings and accounts…" className="sm:max-w-xs" />
        <DataTable
          ariaLabel="Portfolio summary"
          columns={columns}
          rows={rows}
          rowKey={(n) => n.key}
          subRows={(n) => n.children}
          rowActions={isMobile ? (n) => (n.link ? [{ kind: 'view', label: n.linkLabel ?? 'View details', href: n.link }] : []) : undefined}
          defaultSortCol="current"
          defaultSortDir="desc"
          maxHeight="none"
          emptyState={q ? 'No holdings or accounts match' : 'Nothing to summarise yet'}
        />
      </div>
    </Card>
  )
}
