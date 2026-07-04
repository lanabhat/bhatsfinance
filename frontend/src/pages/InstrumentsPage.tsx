import { useEffect, useMemo, useState } from 'react'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { getJson, toQueryString, unwrapList, deleteJson } from '../api/http'
import { Money } from '../components/common/Money'
import { portfolioApi } from '../api/portfolioApi'
import { AssetCategoryForm } from '../components/assets/AssetCategoryForm'
import { InstrumentForm } from '../components/assets/InstrumentForm'
import { InstrumentRow } from '../components/assets/InstrumentRow'
import { ExpandableGridCard } from '../components/common/ExpandableGridCard'
import { useExpandable } from '../hooks/useExpandable'
import { Sheet } from '../components/ui/Sheet'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import type { ApiListResponse, AssetCategory, Instrument, InstrumentOwnership, Transaction, ValuationSnapshot } from '../types/domain'

// ── shared ownership row ──────────────────────────────────────────────────────
function OwnershipRow({ name, subtitle, currentMemberId, memberOptions, onSave }: {
  name: string
  subtitle: string
  currentMemberId: number | null
  memberOptions: { id: number; label: string }[]
  onSave: (memberId: number | null) => Promise<void>
}) {
  const [memberId, setMemberId] = useState<string>(String(currentMemberId ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isDirty = String(currentMemberId ?? '') !== memberId

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(memberId === '' ? null : Number(memberId))
      console.log('[OwnershipRow] save succeeded')
    } catch (e) {
      console.error('[OwnershipRow] save threw', e)
      const msg = e && typeof e === 'object' && 'non_field_errors' in e
        ? (e as { non_field_errors: string[] }).non_field_errors[0]
        : 'Save failed'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-b border-[var(--border)] py-2.5 last:border-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text)]">{name}</p>
          <p className="text-xs text-[var(--text-muted)] capitalize">{subtitle}</p>
        </div>
        <select
          value={memberId}
          onChange={(e) => { setMemberId(e.target.value); setError('') }}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-2)] focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">— Unassigned —</option>
          {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        {isDirty && (
          <button type="button" disabled={saving} onClick={save}
            className="shrink-0 rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {saving ? '…' : 'Save'}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ── instrument delete cascade sheet ──────────────────────────────────────────
function InstrumentDeleteSheet({ householdId, instrument, onDeleted, onCancel }: {
  householdId: number; instrument: Instrument; onDeleted: () => void; onCancel: () => void
}) {
  const { members } = useApp()
  const [txs, setTxs] = useState<Transaction[]>([])
  const [valuations, setValuations] = useState<ValuationSnapshot[]>([])
  const [ownerships, setOwnerships] = useState<InstrumentOwnership[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [t, v, o] = await Promise.all([
        getJson<ApiListResponse<Transaction>>(`/api/transactions/?${toQueryString({ household: householdId, instrument: instrument.id })}`).then(unwrapList),
        getJson<ApiListResponse<ValuationSnapshot>>(`/api/valuations/?${toQueryString({ household: householdId, instrument: instrument.id })}`).then(unwrapList),
        portfolioApi.listInstrumentOwnerships(instrument.id),
      ])
      setTxs(t); setValuations(v); setOwnerships(o)
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const allClear = txs.length === 0 && valuations.length === 0 && ownerships.length === 0

  const deleteAll = async (what: 'txs' | 'valuations' | 'ownerships') => {
    setDeleting(true); setError('')
    try {
      if (what === 'txs') await Promise.all(txs.map((t) => deleteJson(`/api/transactions/${t.id}/`)))
      if (what === 'valuations') await Promise.all(valuations.map((v) => deleteJson(`/api/valuations/${v.id}/`)))
      if (what === 'ownerships') await Promise.all(ownerships.map((o) => portfolioApi.deleteInstrumentOwnership(o.id)))
      await load()
    } catch { setError('Some items failed to delete.') } finally { setDeleting(false) }
  }

  const deleteInstrument = async () => {
    setDeleting(true); setError('')
    try { await portfolioApi.deleteInstrument(instrument.id); onDeleted() }
    catch { setError('Failed to delete instrument.'); setDeleting(false) }
  }

  return (
    <div className="grid gap-4 px-5 py-4">
      <div className="rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-200 p-3 text-center">
        <p className="text-sm font-semibold text-red-700 dark:text-red-300">Deleting: {instrument.name}</p>
        <p className="mt-0.5 text-xs text-red-500">Remove all connected data below before deleting the instrument.</p>
      </div>

      {loading ? <p className="py-4 text-center text-xs text-[var(--text-muted)]">Loading connected data…</p> : (
        <>
          {/* Transactions */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
              <p className="text-xs font-semibold text-[var(--text-2)]">Transactions ({txs.length})</p>
              {txs.length > 0 && (
                <button type="button" disabled={deleting} onClick={() => deleteAll('txs')}
                  className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 dark:bg-red-900/15 disabled:opacity-50">
                  Delete all
                </button>
              )}
            </div>
            {txs.length === 0 ? (
              <p className="px-4 py-2.5 text-xs text-emerald-600">✓ Clear</p>
            ) : (
              txs.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2 last:border-0">
                  <p className="text-xs text-[var(--text-2)]">{t.tx_date} · {t.transaction_type}</p>
                  <Money value={t.amount} className="text-xs font-medium text-[var(--text-2)]" />
                </div>
              ))
            )}
            {txs.length > 5 && <p className="px-4 py-2 text-xs text-[var(--text-muted)]">…and {txs.length - 5} more</p>}
          </div>

          {/* Valuations */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
              <p className="text-xs font-semibold text-[var(--text-2)]">Valuations ({valuations.length})</p>
              {valuations.length > 0 && (
                <button type="button" disabled={deleting} onClick={() => deleteAll('valuations')}
                  className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 dark:bg-red-900/15 disabled:opacity-50">
                  Delete all
                </button>
              )}
            </div>
            {valuations.length === 0 ? (
              <p className="px-4 py-2.5 text-xs text-emerald-600">✓ Clear</p>
            ) : (
              valuations.slice(0, 5).map((v) => (
                <div key={v.id} className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2 last:border-0">
                  <p className="text-xs text-[var(--text-2)]">{v.valuation_date}</p>
                  <p className="text-xs font-medium text-[var(--text-2)]">{v.market_value ? <Money value={v.market_value} /> : v.unit_price ? `@ ${v.unit_price}` : '—'}</p>
                </div>
              ))
            )}
            {valuations.length > 5 && <p className="px-4 py-2 text-xs text-[var(--text-muted)]">…and {valuations.length - 5} more</p>}
          </div>

          {/* Ownerships */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
              <p className="text-xs font-semibold text-[var(--text-2)]">Ownerships ({ownerships.length})</p>
              {ownerships.length > 0 && (
                <button type="button" disabled={deleting} onClick={() => deleteAll('ownerships')}
                  className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 dark:bg-red-900/15 disabled:opacity-50">
                  Delete all
                </button>
              )}
            </div>
            {ownerships.length === 0 ? (
              <p className="px-4 py-2.5 text-xs text-emerald-600">✓ Clear</p>
            ) : (
              ownerships.map((o) => (
                <div key={o.id} className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2 last:border-0">
                  <p className="text-xs text-[var(--text-2)]">{members.find((m) => m.id === o.member)?.label ?? `Member #${o.member}`}</p>
                  <p className="text-xs text-[var(--text-muted)]">{o.allocation_percent}%</p>
                </div>
              ))
            )}
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <div className="flex gap-2 pb-2">
            <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
            <button type="button" disabled={!allClear || deleting} onClick={deleteInstrument}
              className="flex-1 rounded-xl py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 bg-red-500 hover:bg-red-600">
              {allClear ? 'Delete Instrument' : 'Clear all first'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
type GroupBy = 'none' | 'category' | 'type' | 'owner'
type SortBy = 'name' | 'type' | 'category'
type SheetState =
  | { type: 'none' }
  | { type: 'instrument'; item?: Instrument }
  | { type: 'delete'; instrument: Instrument }
  | { type: 'category'; item?: AssetCategory }

type ViewMode = 'table' | 'card'
const VIEW_MODE_KEY = 'instruments:viewMode'

function loadViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY)
    return raw === 'card' ? 'card' : 'table'
  } catch { return 'table' }
}

export function InstrumentsPage() {
  const { canWrite } = useAuth()
  const { householdId, categories, refreshCategories, members, accounts } = useApp()
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [ownerships, setOwnerships] = useState<InstrumentOwnership[]>([])
  const [loading, setLoading] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>('type')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' })
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  const cardExpand = useExpandable<number>()

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem(VIEW_MODE_KEY, mode) } catch { /* ignore */ }
  }

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const load = async () => {
    setLoading(true)
    try {
      const [i, o] = await Promise.all([portfolioApi.listInstruments(householdId), portfolioApi.listInstrumentOwnerships(undefined, 200)])
      console.log('[load] instruments', i.length, 'ownerships', o.length, o)
      setInstruments(i); setOwnerships(o)
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [householdId])

  const ownerMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const i of instruments) {
      const owners = ownerships.filter((o) => o.instrument === i.id)
      m.set(i.id, owners.length ? owners.map((o) => members.find((mb) => mb.id === o.member)?.label ?? `#${o.member}`).join(', ') : 'Unassigned')
    }
    return m
  }, [instruments, ownerships, members])

  const ownershipGroups = useMemo(() => {
    const g = new Map<string, Instrument[]>()
    for (const inst of instruments) {
      const label = ownerMap.get(inst.id) ?? 'Unassigned'
      if (!g.has(label)) g.set(label, [])
      g.get(label)!.push(inst)
    }
    // Stable order: named owners alphabetically, "Unassigned" last.
    return new Map(
      Array.from(g.entries()).sort(([a], [b]) => {
        if (a === 'Unassigned') return 1
        if (b === 'Unassigned') return -1
        return a.localeCompare(b)
      }),
    )
  }, [instruments, ownerMap])

  const sortedInstruments = useMemo(() => {
    return [...instruments].sort((a, b) => {
      if (sortBy === 'type') return a.instrument_type.localeCompare(b.instrument_type)
      if (sortBy === 'category') {
        const ca = categories.find(c => c.id === a.asset_category)?.name ?? 'z'
        const cb = categories.find(c => c.id === b.asset_category)?.name ?? 'z'
        return ca.localeCompare(cb)
      }
      return a.name.localeCompare(b.name)
    })
  }, [instruments, sortBy, categories])

  const grouped = useMemo(() => {
    const g = new Map<string, { items: Instrument[]; color?: string }>()
    for (const inst of sortedInstruments) {
      let key = '__flat__'; let color: string | undefined
      if (groupBy === 'category') { const cat = categories.find((c) => c.id === inst.asset_category); key = cat?.name ?? 'Uncategorised'; color = cat?.color }
      else if (groupBy === 'type') { key = inst.instrument_type.replace(/_/g, ' ') }
      else if (groupBy === 'owner') { key = ownerMap.get(inst.id) ?? 'Unassigned' }
      if (!g.has(key)) g.set(key, { items: [], color })
      g.get(key)!.items.push(inst)
    }
    return g
  }, [sortedInstruments, groupBy, ownerMap, categories])

  const close = () => setSheet({ type: 'none' })
  const afterSave = async () => { close(); await load() }

  const pillCls = (active: boolean) =>
    `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${active ? 'bg-primary-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)]'}`

  const renderRow = (inst: Instrument) => {
    const cat = categories.find((c) => c.id === inst.asset_category)
    const isExpanded = cardExpand.isExpanded(inst.id)
    return (
      <ExpandableGridCard
        key={inst.id}
        expanded={isExpanded}
        onToggle={() => cardExpand.toggle(inst.id)}
        className={isExpanded ? 'ring-2 ring-primary-400 ring-offset-1 rounded-xl' : ''}
        collapsed={<InstrumentRow instrument={inst} category={cat} />}
      >
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Owner</dt>
              <dd className="text-[var(--text)]">{ownerMap.get(inst.id) ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Category</dt>
              <dd className="text-[var(--text)]">{cat?.name ?? 'Uncategorised'}</dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setSheet({ type: 'instrument', item: inst })} disabled={!canWrite}
              className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
              Edit
            </button>
            <button type="button" onClick={() => setSheet({ type: 'delete', instrument: inst })} disabled={!canWrite}
              className="flex-1 rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50 dark:bg-red-900/15 disabled:opacity-50">
              Delete
            </button>
          </div>
        </div>
      </ExpandableGridCard>
    )
  }

  const TYPE_ICONS: Record<string, string> = {
    mutual_fund: '📊', equity: '📈', fd: '🏦', rd: '🏦', epf: '🛡',
    ppf: '🛡', nps: '🛡', gold: '🪙', real_estate: '🏠', sip: '🔄',
    insurance: '☂️', cash: '💵', other: '💼', vehicle: '🚗', liability: '⚠️',
  }

  const thCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap'

  const renderTableRow = (inst: Instrument) => {
    const cat = categories.find((c) => c.id === inst.asset_category)
    const account = accounts.find((a) => a.id === inst.default_account)
    return (
      <tr key={inst.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]">
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm">
              {TYPE_ICONS[inst.instrument_type] ?? '💼'}
            </span>
            <span className="truncate text-sm font-medium text-[var(--text)]">{inst.name}</span>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs capitalize text-[var(--text-2)]">{inst.instrument_type.replace(/_/g, ' ')}</td>
        <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{inst.symbol || '—'}</td>
        <td className="px-3 py-2 text-xs text-[var(--text-2)]">
          {cat ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat.color }} />
              {cat.name}
            </span>
          ) : <span className="text-[var(--text-faint)]">Uncategorised</span>}
        </td>
        <td className="px-3 py-2 text-xs text-[var(--text-2)]">{account?.label ?? '—'}</td>
        <td className="px-3 py-2 text-xs text-[var(--text-2)]">{ownerMap.get(inst.id) ?? 'Unassigned'}</td>
        <td className="px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${inst.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
            {inst.is_active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <button type="button" onClick={() => setSheet({ type: 'instrument', item: inst })} disabled={!canWrite}
              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
              Edit
            </button>
            <button type="button" onClick={() => setSheet({ type: 'delete', instrument: inst })} disabled={!canWrite}
              className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:bg-red-900/15 disabled:opacity-50">
              Delete
            </button>
          </div>
        </td>
      </tr>
    )
  }

  const renderTable = (items: Instrument[]) => (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-2)]">
          <tr>
            <th className={thCls}>Name</th>
            <th className={thCls}>Type</th>
            <th className={thCls}>Symbol</th>
            <th className={thCls}>Category</th>
            <th className={thCls}>Default Account</th>
            <th className={thCls}>Owner</th>
            <th className={thCls}>Status</th>
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody>{items.map(renderTableRow)}</tbody>
      </table>
    </div>
  )

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">Group:</span>
          {([['type', 'Type'], ['category', 'Category'], ['owner', 'Owner'], ['none', 'None']] as [GroupBy, string][]).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setGroupBy(v)} className={pillCls(groupBy === v)}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">Sort:</span>
          {([['name', 'Name'], ['type', 'Type'], ['category', 'Category']] as [SortBy, string][]).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setSortBy(v)} className={pillCls(sortBy === v)}>{l}</button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={viewMode === 'card'}
            onClick={() => changeViewMode(viewMode === 'table' ? 'card' : 'table')}
            title={viewMode === 'table' ? 'Switch to Card view' : 'Switch to Table view'}
            className="flex items-center gap-2 rounded-full bg-[var(--surface-2)] px-1 py-1 text-xs font-medium text-[var(--text-muted)]"
          >
            <span className={`rounded-full px-2 py-0.5 transition-colors ${viewMode === 'table' ? 'bg-primary-600 text-white' : ''}`}>Table</span>
            <span className={`rounded-full px-2 py-0.5 transition-colors ${viewMode === 'card' ? 'bg-primary-600 text-white' : ''}`}>Card</span>
          </button>
          <button type="button" onClick={() => setSheet({ type: 'instrument' })} disabled={!canWrite}
            className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            + Add Instrument
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><CoinSpinner size={48} /></div>
      ) : instruments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-3xl">📋</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-2)]">No instruments yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Tap + to add your first instrument.</p>
        </div>
      ) : groupBy === 'none' ? (
        viewMode === 'table' ? renderTable(sortedInstruments) : (
          <div className="card-grid grid gap-3">{instruments.map(renderRow)}</div>
        )
      ) : (
        <div className="grid gap-1">
          {Array.from(grouped.entries()).map(([label, { items, color }]) => {
            const isOpen = !collapsed.has(label)
            return (
              <div key={label}>
                <button type="button" onClick={() => toggleGroup(label)}
                  className="flex w-full items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
                    <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">{items.length}</span>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {isOpen && (viewMode === 'table' ? renderTable(items) : <div className="card-grid grid gap-3 pb-2">{items.map(renderRow)}</div>)}
              </div>
            )
          })}
        </div>
      )}

      {/* Categories section */}
      <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Categories</p>
          <button type="button" onClick={() => setSheet({ type: 'category' })} disabled={!canWrite} className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-300 disabled:opacity-50">+ Add</button>
        </div>
        {categories.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No categories yet.</p>
        ) : (
          <div className="grid gap-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cat.color }} />
                <p className="flex-1 text-sm text-[var(--text-2)]">{cat.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{cat.instrument_count}</p>
                <button type="button" onClick={() => setSheet({ type: 'category', item: cat })} disabled={!canWrite} className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-300 disabled:opacity-50">Edit</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ownership section — grouped by owner */}
      {instruments.length > 0 && members.length > 1 && (
        <details className="group rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Ownership</p>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-[var(--text-faint)] transition-transform group-open:rotate-90">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
            </svg>
          </summary>
          <div className="border-t border-[var(--border)] px-4 py-1">
            <p className="py-2 text-xs text-[var(--text-muted)]">Assign each instrument to the member who owns it — drives per-member net worth on Home.</p>
            {Array.from(ownershipGroups.entries()).map(([label, items]) => {
              const groupKey = `owner-section:${label}`
              const isOpen = !collapsed.has(groupKey)
              return (
                <div key={label} className="border-t border-[var(--border)] first:border-t-0">
                  <button type="button" onClick={() => toggleGroup(groupKey)}
                    className="flex w-full items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
                      <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">{items.length}</span>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="pb-2">
                      {items.map((inst) => {
                        const existing = ownerships.filter((o) => o.instrument === inst.id)
                        const currentMemberId = existing[0]?.member ?? null
                        return (
                          <OwnershipRow
                            key={`${inst.id}-${currentMemberId}`}
                            name={inst.name}
                            subtitle={inst.instrument_type.replace(/_/g, ' ')}
                            currentMemberId={currentMemberId}
                            memberOptions={members}
                            onSave={async (memberId) => {
                              const fresh = await portfolioApi.listInstrumentOwnerships(inst.id)
                              if (memberId === null) {
                                await Promise.all(fresh.map((o) => portfolioApi.deleteInstrumentOwnership(o.id)))
                              } else if (fresh.length === 0) {
                                await portfolioApi.createInstrumentOwnership({ instrument: inst.id, member: memberId, allocation_percent: '100.00' })
                              } else {
                                await Promise.all(fresh.map((o) => portfolioApi.updateInstrumentOwnership(o.id, { member: memberId })))
                              }
                              await load()
                            }}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      )}

      {/* sheets */}
      {sheet.type === 'instrument' && (
        <Sheet title={sheet.item ? 'Edit Instrument' : 'Add Instrument'} onClose={close}>
          <InstrumentForm householdId={householdId} instrument={sheet.item} onSave={afterSave} onCancel={close}
            onDelete={sheet.item ? () => setSheet({ type: 'delete', instrument: sheet.item! }) : undefined} />
        </Sheet>
      )}
      {sheet.type === 'delete' && (
        <Sheet title="Delete Instrument" onClose={close} tall>
          <InstrumentDeleteSheet householdId={householdId} instrument={sheet.instrument}
            onDeleted={async () => { close(); await load() }} onCancel={close} />
        </Sheet>
      )}
      {sheet.type === 'category' && (
        <Sheet title={sheet.item ? 'Edit Category' : 'New Category'} onClose={close}>
          <AssetCategoryForm householdId={householdId} category={sheet.item}
            onSave={async () => { close(); await refreshCategories() }} onCancel={close} />
        </Sheet>
      )}
    </div>
  )
}
