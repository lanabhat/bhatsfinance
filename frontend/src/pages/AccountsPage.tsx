import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, CreditCard, Landmark, RefreshCw, SearchX, Users } from 'lucide-react'
import { ledgerApi } from '../api/ledgerApi'
import { portfolioApi } from '../api/portfolioApi'
import { AccountDetailDrawer } from '../components/accounts/AccountDetailDrawer'
import { UpdateBalanceForm } from '../components/assets/UpdateBalanceForm'
import { Amount } from '../components/ui/Amount'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DataTable, DensityToggle } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityCard } from '../components/ui/EntityCard'
import { EntityIcon } from '../components/ui/EntityIcon'
import { FilterBar } from '../components/ui/FilterBar'
import { Field, Input, Select, ToolbarSelect } from '../components/ui/Input'
import { MemberAvatar } from '../components/ui/MemberAvatar'
import type { RowAction } from '../components/ui/Menu'
import { Notice } from '../components/ui/Notice'
import { PageLayout } from '../components/ui/PageLayout'
import { SectionHeader } from '../components/ui/SectionHeader'
import { Sheet } from '../components/ui/Sheet'
import { StatCard } from '../components/ui/StatCard'
import { useToast, useUndoable } from '../components/ui/Toast'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useMemberScope } from '../context/MemberScopeContext'
import { applyFilters, filterFieldsFrom, useFilterState } from '../hooks/useFilters'
import type { FilterAccessor } from '../hooks/useFilters'
import { normalizeApiError } from '../hooks/errorUtils'
import { isLiability } from '../lib/accounts'
import { clearDeepLink, readDeepLink } from '../lib/deepLinks'
import { fmtCount } from '../lib/fmt'
import { ACCOUNT_TYPE_LABELS } from '../lib/labels'
import type { Account, AccountOwnership } from '../types/domain'

// ── forms ─────────────────────────────────────────────────────────────────────
function OwnershipRow({ name, subtitle, currentMemberId, memberOptions, onSave }: {
  name: string
  subtitle: string
  currentMemberId: number | null
  memberOptions: { id: number; label: string }[]
  onSave: (memberId: number | null) => Promise<void>
}) {
  const [memberId, setMemberId] = useState<string>(String(currentMemberId ?? ''))
  const [saving, setSaving] = useState(false)
  const isDirty = String(currentMemberId ?? '') !== memberId

  const save = async () => {
    setSaving(true)
    try { await onSave(memberId === '' ? null : Number(memberId)) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{name}</p>
        <p className="text-xs text-ink-muted">{subtitle}</p>
      </div>
      <Select value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label={`Owner of ${name}`} className="w-40">
        <option value="">Unassigned</option>
        {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </Select>
      {isDirty && <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>Save</Button>}
    </div>
  )
}

const ACCOUNT_TYPES = ['bank', 'broker', 'pf', 'loan', 'credit_card', 'insurance', 'cash', 'other'] as const
const typeLabel = (t: string) => ACCOUNT_TYPE_LABELS[t] ?? t.replace(/_/g, ' ')

function AccountForm({ householdId, account, onSave, onCancel, onDelete }: {
  householdId: number; account?: Account
  onSave: () => void; onCancel: () => void; onDelete?: () => void
}) {
  const { members } = useApp()
  const [form, setForm] = useState<Omit<Account, 'id'>>({
    household: householdId,
    name: account?.name ?? '',
    account_type: account?.account_type ?? 'bank',
    institution_name: account?.institution_name ?? '',
    sms_identifiers: account?.sms_identifiers ?? '',
    primary_member: account?.primary_member ?? null,
    opening_balance: account?.opening_balance ?? '0',
    credit_limit: account?.credit_limit ?? null,
    statement_due_day: account?.statement_due_day ?? null,
    is_active: account?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      if (account) {
        await portfolioApi.updateAccount(account.id, form)
        // Keep ownership in step with the primary owner.
        if (form.primary_member !== account.primary_member) {
          const existing = await portfolioApi.listAccountOwnerships(account.id)
          for (const o of existing) await portfolioApi.deleteAccountOwnership(o.id)
          if (form.primary_member) {
            await portfolioApi.createAccountOwnership({ account: account.id, member: form.primary_member, allocation_percent: '100.00' })
          }
        }
      } else {
        const created = await portfolioApi.createAccount(form)
        if (form.primary_member) {
          await portfolioApi.createAccountOwnership({ account: created.id, member: form.primary_member, allocation_percent: '100.00' })
        }
      }
      onSave()
    } catch { setError('Failed to save account') } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <Field label="Name"><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></Field>
      <Field label="Type">
        <Select value={form.account_type} onChange={(e) => setForm((p) => ({ ...p, account_type: e.target.value as Account['account_type'] }))}>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </Select>
      </Field>
      <Field label="Primary owner">
        <Select value={form.primary_member ?? ''} onChange={(e) => setForm((p) => ({ ...p, primary_member: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">None</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </Select>
      </Field>
      <Field label="Institution"><Input value={form.institution_name} onChange={(e) => setForm((p) => ({ ...p, institution_name: e.target.value }))} /></Field>
      <Field label="SMS identifiers"
        hint="Last digits of this account and its cards as bank SMS show them. Matching SMS are linked to this account and the balance they report is recorded. Learned automatically when you approve an SMS.">
        <Input value={form.sms_identifiers ?? ''} placeholder="e.g. 7799, 2133" onChange={(e) => setForm((p) => ({ ...p, sms_identifiers: e.target.value }))} />
      </Field>
      {form.account_type !== 'credit_card' ? (
        <Field label="Opening balance (₹)">
          <Input type="number" inputMode="decimal" value={form.opening_balance} onChange={(e) => setForm((p) => ({ ...p, opening_balance: e.target.value }))} />
        </Field>
      ) : (
        <>
          <Field label="Credit limit (₹)">
            <Input type="number" inputMode="decimal" value={form.credit_limit ?? ''} onChange={(e) => setForm((p) => ({ ...p, credit_limit: e.target.value || null }))} />
          </Field>
          <Field label="Statement due day">
            <Input type="number" min={1} max={31} placeholder="e.g. 5 (5th of each month)"
              value={form.statement_due_day ?? ''} onChange={(e) => setForm((p) => ({ ...p, statement_due_day: e.target.value ? Number(e.target.value) : null }))} />
          </Field>
        </>
      )}
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
        <span className="text-sm text-ink-2">Active</span>
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" className="flex-1" loading={saving}>{account ? 'Save changes' : 'Add account'}</Button>
      </div>
      {account && onDelete && (
        <div className="border-t border-line pt-4">
          <Button variant="ghost" className="w-full text-danger" onClick={onDelete}>Delete account…</Button>
        </div>
      )}
    </form>
  )
}

function CCSpendForm({ account, householdId, onSave, onCancel, mode }: {
  account: Account; householdId: number
  onSave: () => void; onCancel: () => void
  mode: 'spend' | 'payment'
}) {
  const { members } = useApp()
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({ date: today, amount: '', description: '', member: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await ledgerApi.createTransaction({
        household: householdId,
        account: account.id,
        instrument: null,
        member: form.member ? Number(form.member) : null,
        tx_date: form.date,
        amount: form.amount,
        direction: mode === 'spend' ? 'outflow' : 'inflow',
        transaction_type: mode === 'spend' ? 'other' : 'deposit',
        quantity: null,
        price_per_unit: null,
        fees: '0',
        taxes: '0',
        currency: 'INR',
        external_reference: form.description,
        idempotency_key: '',
        metadata: {},
      })
      onSave()
    } catch { setError('Failed to save') } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} required /></Field>
      <Field label="Amount (₹)">
        <Input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required />
      </Field>
      {mode === 'spend' && (
        <Field label="Spent by">
          <Select value={form.member} onChange={(e) => setForm((p) => ({ ...p, member: e.target.value }))}>
            <option value="">Anyone</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Description">
        <Input placeholder={mode === 'spend' ? 'e.g. Groceries, Amazon…' : 'e.g. Bill payment'} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
      </Field>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" className="flex-1" loading={saving}>{mode === 'spend' ? 'Record spend' : 'Record payment'}</Button>
      </div>
    </form>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────
type GroupBy = 'none' | 'owner' | 'type'
type SheetState =
  | { type: 'none' }
  | { type: 'account'; item?: Account }
  | { type: 'cc_spend'; item: Account; mode: 'spend' | 'payment' }
  | { type: 'update_balance'; item: Account }
  | { type: 'ownership' }
  | { type: 'confirm_delete'; item: Account }

type ViewMode = 'table' | 'card'
const VIEW_MODE_KEY = 'accounts:viewMode'

function loadViewMode(): ViewMode {
  try { return localStorage.getItem(VIEW_MODE_KEY) === 'card' ? 'card' : 'table' } catch { return 'table' }
}

export function AccountsPage() {
  const { canWrite } = useAuth()
  const { householdId, members, dashboard } = useApp()
  const { memberName } = useMemberScope()
  const toast = useToast()
  const undoable = useUndoable()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [ownerships, setOwnerships] = useState<AccountOwnership[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('type')
  const [search, setSearch] = useState('')
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' })
  const [detailId, setDetailId] = useState<number | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem(VIEW_MODE_KEY, mode) } catch { /* ignore */ }
  }

  // Signed: credit cards come back negative (outstanding), loans as recorded.
  const balanceMap = useMemo(() => {
    const m = new Map<number, number>()
    for (const a of dashboard.accounts) m.set(a.account_id, parseFloat(a.balance))
    return m
  }, [dashboard.accounts])

  const load = async () => {
    setLoading(true); setLoadError('')
    try {
      const [a, o] = await Promise.all([portfolioApi.listAccounts(householdId), portfolioApi.listAccountOwnerships(undefined, householdId)])
      setAccounts(a); setOwnerships(o)
    } catch (e) {
      setLoadError(normalizeApiError(e))
    } finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [householdId])

  const ownerMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const a of accounts) {
      const owners = ownerships.filter((o) => o.account === a.id)
      if (owners.length) m.set(a.id, owners.map((o) => members.find((mb) => mb.id === o.member)?.label ?? `#${o.member}`).join(', '))
      else if (a.primary_member) m.set(a.id, members.find((mb) => mb.id === a.primary_member)?.label ?? `#${a.primary_member}`)
      else m.set(a.id, 'Unassigned')
    }
    return m
  }, [accounts, ownerships, members])
  const ownerOf = (a: Account) => ownerMap.get(a.id) ?? 'Unassigned'

  // The header's member scope: accounts that member owns (alone or jointly).
  const scoped = useMemo(() => {
    const visible = accounts.filter((a) => !hiddenIds.has(a.id))
    if (!memberName) return visible
    return visible.filter((a) => ownerOf(a).split(', ').includes(memberName))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, hiddenIds, memberName, ownerMap])

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((a) => `${a.name} ${a.institution_name}`.toLowerCase().includes(q))
  }, [scoped, search])

  const accountFilterAccessors = useMemo<FilterAccessor<Account>[]>(() => [
    { key: 'type', label: 'Type', get: (a) => typeLabel(a.account_type) },
    { key: 'owner', label: 'Owner', get: (a) => (ownerMap.get(a.id) ?? 'Unassigned').split(', ') },
    { key: 'institution', label: 'Institution', get: (a) => a.institution_name },
    { key: 'status', label: 'Status', get: (a) => (a.is_active ? 'Active' : 'Inactive') },
  ], [ownerMap])

  const [accountFilters, setAccountFilters] = useFilterState('accounts')

  // Deep links from Home (Portfolio summary, member drawer): the link's filters replace the
  // remembered ones and `open` opens one account; the query is then dropped.
  useEffect(() => {
    const link = readDeepLink(['type', 'owner', 'institution', 'status'])
    if (!link) return
    setAccountFilters(link.filters)
    setSearch('')
    if (link.open && /^\d+$/.test(link.open)) setDetailId(Number(link.open))
    clearDeepLink('accounts')
  }, [setAccountFilters])
  const filteredAccounts = useMemo(() => applyFilters(searched, accountFilters, accountFilterAccessors), [searched, accountFilters, accountFilterAccessors])
  const accountFilterFields = useMemo(() => filterFieldsFrom(searched, accountFilters, accountFilterAccessors), [searched, accountFilters, accountFilterAccessors])

  const totals = useMemo(() => {
    let assets = 0, liabilities = 0, active = 0
    for (const a of filteredAccounts) {
      const b = balanceMap.get(a.id) ?? 0
      if (isLiability(a.account_type)) liabilities += b < 0 ? b : -b
      else assets += b
      if (a.is_active) active += 1
    }
    return { assets, liabilities, active, net: assets + liabilities }
  }, [filteredAccounts, balanceMap])

  const unownedAccounts = useMemo(() => accounts.filter((a) => ownerMap.get(a.id) === 'Unassigned'), [accounts, ownerMap])

  const close = () => setSheet({ type: 'none' })
  const afterSave = async () => { close(); await load() }

  const deleteAccount = (a: Account) => {
    close(); setDetailId(null)
    undoable({
      message: `Deleted ${a.name}`,
      apply: () => setHiddenIds((s) => new Set(s).add(a.id)),
      revert: () => setHiddenIds((s) => { const n = new Set(s); n.delete(a.id); return n }),
      commit: async () => { await portfolioApi.deleteAccount(a.id); await load() },
    })
  }

  // View → Edit → domain actions → Delete.
  const actionsFor = (a: Account): RowAction[] => [
    { kind: 'view', label: 'View details', onSelect: () => setDetailId(a.id) },
    ...(canWrite ? [
      { kind: 'edit' as const, label: 'Edit', onSelect: () => setSheet({ type: 'account', item: a }) },
      ...(a.account_type === 'credit_card' ? [
        { kind: 'action' as const, label: 'Record spend', icon: <CreditCard />, onSelect: () => setSheet({ type: 'cc_spend', item: a, mode: 'spend' }) },
        { kind: 'action' as const, label: 'Pay bill', icon: <ArrowDownToLine />, onSelect: () => setSheet({ type: 'cc_spend', item: a, mode: 'payment' }) },
      ] : []),
      { kind: 'action' as const, label: 'Update balance', icon: <RefreshCw />, onSelect: () => setSheet({ type: 'update_balance', item: a }) },
      {
        kind: 'delete' as const, label: 'Delete', onSelect: () => deleteAccount(a),
        confirm: { title: `Delete ${a.name}?`, message: 'The account and all its transaction history are deleted. You’ll have a few seconds to undo.', confirmLabel: 'Delete' },
      },
    ] : []),
  ]

  const balanceCell = (a: Account) => {
    const b = balanceMap.get(a.id)
    if (b === undefined) return <span className="text-ink-muted">—</span>
    return <Amount value={b} className="font-semibold" tone={b < 0 ? 'debit' : 'default'} />
  }

  const nameCell = (a: Account) => (
    <span className="flex min-w-0 items-center gap-3">
      <EntityIcon kind="account" type={a.account_type} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-ink">{a.name}</span>
          {isLiability(a.account_type) && <Badge tone="danger">Liability</Badge>}
          {!a.is_active && <Badge>Inactive</Badge>}
        </span>
        {a.institution_name && <span className="block truncate text-xs text-ink-muted md:hidden">{a.institution_name}</span>}
      </span>
    </span>
  )

  const columns: DataTableColumn<Account>[] = [
    { key: 'name', label: 'Name', sortable: true, sortValue: (a) => a.name, mobile: 'title', render: nameCell },
    { key: 'type', label: 'Type', sortable: true, sortValue: (a) => typeLabel(a.account_type), hideWhenGroupedBy: 'type', mobile: 'subtitle',
      render: (a) => <span className="text-ink-2">{typeLabel(a.account_type)}</span> },
    { key: 'institution', label: 'Institution', sortable: true, sortValue: (a) => a.institution_name || '', mobile: 'hide',
      render: (a) => (a.institution_name ? <span className="text-ink-2">{a.institution_name}</span> : <span className="text-ink-muted">—</span>) },
    { key: 'owner', label: 'Owner', hideWhenGroupedBy: 'owner', mobile: 'subtitle', render: (a) => <MemberAvatar name={ownerOf(a)} /> },
    { key: 'balance', label: 'Balance', align: 'right', sortable: true, mobile: 'value', sortValue: (a) => balanceMap.get(a.id) ?? null, render: balanceCell },
  ]

  const groupOf = (a: Account, by: string) => by === 'owner'
    ? { key: ownerOf(a), label: ownerOf(a) }
    : { key: a.account_type, label: typeLabel(a.account_type) }

  const cardGroups = useMemo(() => {
    const sorted = [...filteredAccounts].sort((x, y) => x.name.localeCompare(y.name))
    if (groupBy === 'none') return [{ key: 'all', label: '', items: sorted }]
    const g = new Map<string, { key: string; label: string; items: Account[] }>()
    for (const a of sorted) {
      const k = groupOf(a, groupBy)
      if (!g.has(k.key)) g.set(k.key, { ...k, items: [] })
      g.get(k.key)!.items.push(a)
    }
    return [...g.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredAccounts, groupBy, ownerMap])

  const filtersActive = Object.keys(accountFilters).length > 0 || !!search.trim()
  const detail = detailId !== null ? accounts.find((a) => a.id === detailId) ?? null : null
  const sumBalances = (rows: Account[]) => rows.reduce((s, a) => s + (balanceMap.get(a.id) ?? 0), 0)

  return (
    <PageLayout
      title="Accounts"
      description={memberName ? `Accounts ${memberName} owns` : undefined}
      primaryAction={{ label: 'Add account', onClick: () => setSheet({ type: 'account' }), disabled: !canWrite }}
      moreActions={members.length > 1 && canWrite ? [{ label: 'Manage ownership', icon: <Users />, onSelect: () => setSheet({ type: 'ownership' }), hint: 'Who owns each account' }] : []}
      summary={(
        <>
          <StatCard label="Total balance" loading={loading && accounts.length === 0} value={<Amount value={totals.assets} format="compact" />}
            subtitle={totals.liabilities !== 0 ? <>Net <Amount value={totals.net} format="compact" /></> : undefined} />
          <StatCard label="Active accounts" loading={loading && accounts.length === 0} value={fmtCount(totals.active)}
            subtitle={`of ${fmtCount(filteredAccounts.length)}`} />
          <StatCard label="Liabilities" loading={loading && accounts.length === 0}
            value={<Amount value={totals.liabilities} format="compact" tone={totals.liabilities < 0 ? 'debit' : 'default'} />}
            subtitle="Cards and loans" />
        </>
      )}
      notices={!loading && unownedAccounts.length > 0 ? (
        <Notice tone="warning" title={`${unownedAccounts.length} account${unownedAccounts.length > 1 ? 's have' : ' has'} no owner`}
          action={members.length > 1 && canWrite ? <Button variant="secondary" size="sm" onClick={() => setSheet({ type: 'ownership' })}>Assign</Button> : undefined}>
          {unownedAccounts.map((a) => a.name).join(', ')} — not counted in anyone’s net worth on Home.
        </Notice>
      ) : undefined}
      toolbar={(
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Search accounts…' }}
          fields={accountFilterFields}
          value={accountFilters}
          onChange={setAccountFilters}
          onClearAll={() => setSearch('')}
          resultLabel={filtersActive ? `Showing ${filteredAccounts.length} of ${scoped.length} accounts` : undefined}
          controls={(
            <>
              <ToolbarSelect label="Group by" value={groupBy}
                options={[{ value: 'type', label: 'Type' }, { value: 'owner', label: 'Owner' }, { value: 'none', label: 'None' }]}
                onChange={(v) => setGroupBy(v as GroupBy)} />
              <ToolbarSelect label="View" value={viewMode} options={[{ value: 'table', label: 'Table' }, { value: 'card', label: 'Cards' }]}
                onChange={(v) => changeViewMode(v as ViewMode)} />
              {viewMode === 'table' && <DensityToggle />}
            </>
          )}
        />
      )}
    >
      {!loading && !loadError && accounts.length === 0 ? (
        <Card><EmptyState size="page" icon={<Landmark />} title="No accounts yet" description="Add your bank accounts, cards and loans to track balances." /></Card>
      ) : viewMode === 'table' || loadError ? (
        <DataTable
          ariaLabel="Accounts"
          columns={columns}
          rows={filteredAccounts}
          rowKey={(a) => a.id}
          defaultSortCol="name"
          defaultSortDir="asc"
          loading={loading}
          error={loadError ? { message: loadError, onRetry: () => void load() } : null}
          emptyState={<EmptyState icon={<SearchX />} title="No accounts match" description="Try a different search or clear the filters." />}
          groupBy={{
            options: [{ value: 'type', label: 'Type' }, { value: 'owner', label: 'Owner' }],
            value: groupBy,
            getGroup: groupOf,
            sortGroups: (a, b) => Math.abs(sumBalances(b.rows)) - Math.abs(sumBalances(a.rows)),
            aggregate: (rows) => ({ balance: <Amount value={sumBalances(rows)} tone={sumBalances(rows) < 0 ? 'debit' : 'default'} /> }),
          }}
          isRowMuted={(a) => !a.is_active}
          onRowClick={(a) => setDetailId(a.id)}
          rowActions={actionsFor}
          footer={<span className="flex justify-between gap-4"><span>{fmtCount(filteredAccounts.length)} accounts</span><span>Net <Amount value={totals.net} className="font-semibold text-ink" /></span></span>}
        />
      ) : (
        <div className="grid gap-6">
          {cardGroups.map((g) => (
            <section key={g.key} className="grid gap-3" aria-label={g.label || 'Accounts'}>
              {g.label && <SectionHeader title={g.label} subtitle={<>{g.items.length} · <Amount value={sumBalances(g.items)} format="compact" /></>} />}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((a) => (
                  <EntityCard
                    key={a.id}
                    icon={<EntityIcon kind="account" type={a.account_type} className="h-9 w-9" />}
                    title={a.name}
                    subtitle={[typeLabel(a.account_type), a.institution_name, ownerOf(a)].filter(Boolean).join(' · ')}
                    badges={<>{isLiability(a.account_type) && <Badge tone="danger">Liability</Badge>}{!a.is_active && <Badge>Inactive</Badge>}</>}
                    value={balanceCell(a)}
                    actions={actionsFor(a)}
                    onOpen={() => setDetailId(a.id)}
                    muted={!a.is_active}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {detail && (
        <AccountDetailDrawer
          open
          onClose={() => setDetailId(null)}
          account={detail}
          householdId={householdId}
          owner={ownerOf(detail)}
          balance={balanceMap.get(detail.id) ?? null}
          onEdit={() => setSheet({ type: 'account', item: detail })}
          onUpdateBalance={() => setSheet({ type: 'update_balance', item: detail })}
          onRecordSpend={() => setSheet({ type: 'cc_spend', item: detail, mode: 'spend' })}
          onRecordPayment={() => setSheet({ type: 'cc_spend', item: detail, mode: 'payment' })}
        />
      )}

      {sheet.type === 'account' && (
        <Sheet title={sheet.item ? 'Edit account' : 'Add account'} onClose={close}>
          <AccountForm householdId={householdId} account={sheet.item} onSave={afterSave} onCancel={close}
            onDelete={sheet.item ? () => setSheet({ type: 'confirm_delete', item: sheet.item! }) : undefined} />
        </Sheet>
      )}
      {sheet.type === 'confirm_delete' && (
        <Sheet title={`Delete ${sheet.item.name}?`} onClose={close}
          footer={(
            <>
              <Button variant="secondary" className="flex-1" onClick={close}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => deleteAccount(sheet.item)}>Delete</Button>
            </>
          )}>
          <p className="text-sm text-ink-muted">The account and all its transaction history are deleted. You’ll have a few seconds to undo.</p>
        </Sheet>
      )}
      {sheet.type === 'cc_spend' && (
        <Sheet title={sheet.mode === 'spend' ? 'Record spend' : 'Record payment'} subtitle={sheet.item.name} onClose={close}>
          <CCSpendForm account={sheet.item} householdId={householdId} mode={sheet.mode} onSave={afterSave} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'update_balance' && (
        <Sheet title="Update balance" subtitle={sheet.item.name} onClose={close}>
          <UpdateBalanceForm account={sheet.item} householdId={householdId} onSave={afterSave} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'ownership' && (
        <Sheet title="Account ownership" subtitle="Assign each account to the member who owns it — drives per-member net worth on Home." onClose={close} wide>
          {accounts.map((acct) => {
            const existing = ownerships.filter((o) => o.account === acct.id)
            const currentMemberId = existing[0]?.member ?? acct.primary_member ?? null
            return (
              <OwnershipRow
                key={`${acct.id}-${currentMemberId}`}
                name={acct.name}
                subtitle={typeLabel(acct.account_type)}
                currentMemberId={currentMemberId}
                memberOptions={members}
                onSave={async (memberId) => {
                  try {
                    const fresh = await portfolioApi.listAccountOwnerships(acct.id)
                    if (memberId === null) await Promise.all(fresh.map((o) => portfolioApi.deleteAccountOwnership(o.id)))
                    else if (fresh.length === 0) await portfolioApi.createAccountOwnership({ account: acct.id, member: memberId, allocation_percent: '100.00' })
                    else await Promise.all(fresh.map((o) => portfolioApi.updateAccountOwnership(o.id, { member: memberId })))
                    await load()
                  } catch (e) { toast.error(normalizeApiError(e)) }
                }}
              />
            )
          })}
        </Sheet>
      )}
    </PageLayout>
  )
}
