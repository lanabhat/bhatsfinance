import { useEffect, useMemo, useState } from 'react'
import { getJson, toQueryString, unwrapList, deleteJson } from '../api/http'
import { useMaskedFmt } from '../components/common/Money'
import { portfolioApi } from '../api/portfolioApi'
import { AssetCategoryForm } from '../components/assets/AssetCategoryForm'
import { InstrumentForm } from '../components/assets/InstrumentForm'
import { InstrumentRow } from '../components/assets/InstrumentRow'
import { Sheet } from '../components/ui/Sheet'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import type { ApiListResponse, AssetCategory, Instrument, InstrumentOwnership, Transaction, ValuationSnapshot } from '../types/domain'

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

  const fmt = useMaskedFmt()

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
                  <p className="text-xs font-medium text-[var(--text-2)]">{fmt(t.amount)}</p>
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
                  <p className="text-xs font-medium text-[var(--text-2)]">{v.market_value ? fmt(v.market_value) : v.unit_price ? `@ ${v.unit_price}` : '—'}</p>
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
type SheetState =
  | { type: 'none' }
  | { type: 'instrument'; item?: Instrument }
  | { type: 'delete'; instrument: Instrument }
  | { type: 'category'; item?: AssetCategory }

export function InstrumentsPage() {
  const { canWrite } = useAuth()
  const { householdId, categories, refreshCategories, members } = useApp()
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [ownerships, setOwnerships] = useState<InstrumentOwnership[]>([])
  const [loading, setLoading] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' })

  const load = async () => {
    setLoading(true)
    try {
      const [i, o] = await Promise.all([portfolioApi.listInstruments(householdId), portfolioApi.listInstrumentOwnerships()])
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

  const grouped = useMemo(() => {
    const g = new Map<string, { items: Instrument[]; color?: string }>()
    for (const inst of instruments) {
      let key = '__flat__'; let color: string | undefined
      if (groupBy === 'category') { const cat = categories.find((c) => c.id === inst.asset_category); key = cat?.name ?? 'Uncategorised'; color = cat?.color }
      else if (groupBy === 'type') { key = inst.instrument_type.replace(/_/g, ' ') }
      else if (groupBy === 'owner') { key = ownerMap.get(inst.id) ?? 'Unassigned' }
      if (!g.has(key)) g.set(key, { items: [], color })
      g.get(key)!.items.push(inst)
    }
    return g
  }, [instruments, groupBy, ownerMap, categories])

  const close = () => setSheet({ type: 'none' })
  const afterSave = async () => { close(); await load() }

  const GROUP_OPTS: { value: GroupBy; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'category', label: 'Category' },
    { value: 'type', label: 'Type' },
    { value: 'owner', label: 'Owner' },
  ]

  const renderRow = (inst: Instrument) => {
    const cat = categories.find((c) => c.id === inst.asset_category)
    return (
      <InstrumentRow key={inst.id} instrument={inst} category={cat}
        onClick={canWrite ? () => setSheet({ type: 'instrument', item: inst }) : undefined} />
    )
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs text-[var(--text-muted)]">Group:</span>
        {GROUP_OPTS.map((o) => (
          <button key={o.value} type="button" onClick={() => setGroupBy(o.value)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${groupBy === o.value ? 'bg-indigo-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)]'}`}>
            {o.label}
          </button>
        ))}
        <button type="button" onClick={() => setSheet({ type: 'instrument' })} disabled={!canWrite}
          className="ml-auto shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          + Add Instrument
        </button>
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs text-[var(--text-muted)]">Loading…</p>
      ) : instruments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-3xl">📋</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-2)]">No instruments yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Tap + to add your first instrument.</p>
        </div>
      ) : groupBy === 'none' ? (
        <div className="grid gap-2">{instruments.map(renderRow)}</div>
      ) : (
        <div className="grid gap-2">
          {Array.from(grouped.entries()).map(([label, { items, color }]) => (
            <div key={label}>
              <div className="mt-3 flex items-center gap-2 first:mt-0">
                {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
              </div>
              {items.map(renderRow)}
            </div>
          ))}
        </div>
      )}

      {/* Categories section */}
      <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Categories</p>
          <button type="button" onClick={() => setSheet({ type: 'category' })} disabled={!canWrite} className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 disabled:opacity-50">+ Add</button>
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
                <button type="button" onClick={() => setSheet({ type: 'category', item: cat })} disabled={!canWrite} className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 disabled:opacity-50">Edit</button>
              </div>
            ))}
          </div>
        )}
      </div>

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
