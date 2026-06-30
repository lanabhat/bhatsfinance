import { useEffect, useState } from 'react'
import { CoinSpinner } from '../components/common/CoinSpinner'
import { fdDetailsApi } from '../api/fdDetailsApi'
import { valuationApi } from '../api/valuationApi'
import { Money } from '../components/common/Money'
import { DeleteButton } from '../components/common/DeleteButton'
import { Drawer } from '../components/ui/Drawer'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { normalizeApiError } from '../hooks/errorUtils'
import { useAuth } from '../context/AuthContext'
import type { BulkSnapshotResult, OptionItem, ValuationSnapshot } from '../types/domain'

type Props = {
  householdId: number
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  canDelete: (e: DeleteEntity) => boolean
}

const EMPTY_FORM = (householdId: number): Omit<ValuationSnapshot, 'id'> => ({
  household: householdId,
  valuation_date: new Date().toISOString().slice(0, 10),
  account: null,
  instrument: null,
  unit_price: null,
  market_value: null,
  balance: '',
  source: 'manual',
  notes: '',
})

const INP = 'w-full rounded-lg border border-[var(--border-2)] bg-[var(--surface)] text-[var(--text)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const LBL = 'text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]'

type GroupFilter = 'all' | 'account' | 'instrument'

export function ValuationPage({ householdId, accountOptions, instrumentOptions, canDelete }: Props) {
  const { canWrite } = useAuth()

  const [items, setItems] = useState<ValuationSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all')
  const [search, setSearch] = useState('')

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editItem, setEditItem] = useState<ValuationSnapshot | null>(null)
  const [form, setForm] = useState<Omit<ValuationSnapshot, 'id'>>(EMPTY_FORM(householdId))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Snapshot panel
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().slice(0, 10))
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotResult, setSnapshotResult] = useState<BulkSnapshotResult | null>(null)
  const [snapshotError, setSnapshotError] = useState('')
  const [snapshotOpen, setSnapshotOpen] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      setItems(await valuationApi.listValuations(householdId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [householdId])

  const openAdd = () => {
    setEditItem(null)
    setForm(EMPTY_FORM(householdId))
    setFormError('')
    setDrawerOpen(true)
  }

  const openEdit = (item: ValuationSnapshot) => {
    setEditItem(item)
    setForm({ ...item })
    setFormError('')
    setDrawerOpen(true)
  }

  const closeDrawer = () => { setDrawerOpen(false); setEditItem(null) }

  const save = async () => {
    if ((form.account && form.instrument) || (!form.account && !form.instrument)) {
      setFormError('Set exactly one of account or instrument.')
      return
    }
    setFormError('')
    setSaving(true)
    try {
      if (editItem) await valuationApi.updateValuation(editItem.id, form)
      else await valuationApi.createValuation(form)
      closeDrawer()
      await loadData()
    } catch (e) {
      setFormError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const takeSnapshot = async () => {
    setSnapshotLoading(true)
    setSnapshotResult(null)
    setSnapshotError('')
    try {
      const result = await fdDetailsApi.bulkSnapshot(householdId, snapshotDate)
      setSnapshotResult(result)
      await loadData()
    } catch (e) {
      setSnapshotError(normalizeApiError(e))
    } finally {
      setSnapshotLoading(false)
    }
  }

  // Helpers for display
  const accountLabel = (id: number | null) => accountOptions.find((a) => a.id === id)?.label ?? `Account #${id}`
  const instrumentLabel = (id: number | null) => instrumentOptions.find((i) => i.id === id)?.label ?? `Instrument #${id}`

  const filtered = items.filter((x) => {
    if (groupFilter === 'account' && !x.account) return false
    if (groupFilter === 'instrument' && !x.instrument) return false
    if (search) {
      const q = search.toLowerCase()
      const label = x.account ? accountLabel(x.account) : instrumentLabel(x.instrument)
      if (!label.toLowerCase().includes(q) && !x.valuation_date.includes(q) && !x.notes.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="grid gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-1">
            {(['all', 'account', 'instrument'] as GroupFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setGroupFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  groupFilter === f ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-[var(--border-2)] bg-[var(--surface)] text-[var(--text)] px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setSnapshotOpen((v) => !v)}>
            📸 Take Snapshot
          </Button>
          <Button onClick={openAdd} disabled={!canWrite}>+ Add Valuation</Button>
        </div>
      </div>

      {/* Snapshot panel */}
      {snapshotOpen && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 grid gap-3 dark:border-indigo-900/40 dark:bg-indigo-900/15">
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Bulk Snapshot</p>
          <p className="text-xs text-indigo-700 dark:text-indigo-300">
            Auto-computes FD/RD values using saved interest rates. Carries forward last known values for all other instruments and accounts.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className={LBL}>Snapshot Date</span>
              <input type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} className={INP + ' w-44'} />
            </label>
            <Button onClick={() => void takeSnapshot()} loading={snapshotLoading} disabled={!canWrite}>
              Take Snapshot
            </Button>
          </div>
          {snapshotError && <p className="text-xs text-red-600">{snapshotError}</p>}
          {snapshotResult && (
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Net Worth', value: snapshotResult.net_worth },
                  { label: 'Total Assets', value: snapshotResult.total_assets },
                  { label: 'Total Liabilities', value: snapshotResult.total_liabilities },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-[var(--surface)] border border-indigo-100 px-3 py-2 dark:border-indigo-900/40">
                    <p className="text-[11px] text-[var(--text-muted)]">{s.label}</p>
                    <Money value={s.value} className="text-base font-bold text-[var(--text)]" />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">Snapshot saved as of {snapshotResult.as_of}</p>
              {snapshotResult.auto_computed.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-emerald-700 mb-1">✓ Auto-computed ({snapshotResult.auto_computed.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {snapshotResult.auto_computed.map((x, i) => (
                      <span key={i} className="rounded-full bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/25 dark:border-emerald-800/40 dark:text-emerald-300">
                        {x.name} — <Money value={x.value} />
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {snapshotResult.needs_manual.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer list-none text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
                    <span className="font-medium">↓ {snapshotResult.needs_manual.length} item{snapshotResult.needs_manual.length !== 1 ? 's' : ''} skipped</span>
                    <span className="ml-1">(no data to compute from — add a manual valuation to include them next time)</span>
                  </summary>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {snapshotResult.needs_manual.map((x, i) => (
                      <span key={i} className="rounded-full bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        {x.name}
                      </span>
                    ))}
                  </div>
                </details>
              )}
              {snapshotResult.carried_forward.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-indigo-700 mb-1">↩ Carried forward ({snapshotResult.carried_forward.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {snapshotResult.carried_forward.map((x, i) => (
                      <span key={i} className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/25 dark:border-indigo-800/40 dark:text-indigo-300">
                        {x.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-8"><CoinSpinner size={48} /></div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--text-muted)]">No valuations found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Date</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Account / Instrument</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] text-right">Market Value</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] text-right">Balance</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] text-right">Unit Price</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Source</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x) => (
                <tr key={x.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-4 py-3 text-[var(--text-2)] tabular-nums">{x.valuation_date}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-[var(--text)]">
                        {x.account ? accountLabel(x.account) : instrumentLabel(x.instrument)}
                      </span>
                      {x.notes && <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[18rem]">{x.notes}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--text-2)]">
                    {x.market_value ? <Money value={x.market_value} /> : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--text-2)]">
                    {x.balance ? <Money value={x.balance} /> : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)] text-xs">
                    {x.unit_price ? <Money value={x.unit_price} /> : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={x.source} color={x.source === 'manual' ? 'slate' : x.source === 'api' ? 'blue' : 'green'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => openEdit(x)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <DeleteButton disabled={!canDelete('valuation')} onDelete={async () => { await valuationApi.deleteValuation(x.id); await loadData() }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editItem ? 'Edit Valuation' : 'Add Valuation'}
        width="w-full max-w-md"
      >
        <div className="grid gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className={LBL}>Valuation Date *</span>
            <input type="date" value={form.valuation_date} onChange={(e) => setForm((p) => ({ ...p, valuation_date: e.target.value }))} className={INP} />
          </label>

          <label className="flex flex-col gap-1">
            <span className={LBL}>Account</span>
            <select
              value={form.account ? String(form.account) : ''}
              onChange={(e) => setForm((p) => ({ ...p, account: e.target.value ? Number(e.target.value) : null, instrument: e.target.value ? null : p.instrument }))}
              className={INP}
            >
              <option value="">— None —</option>
              {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={LBL}>Instrument</span>
            <select
              value={form.instrument ? String(form.instrument) : ''}
              onChange={(e) => setForm((p) => ({ ...p, instrument: e.target.value ? Number(e.target.value) : null, account: e.target.value ? null : p.account }))}
              className={INP}
            >
              <option value="">— None —</option>
              {instrumentOptions.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
            <p className="text-[11px] text-[var(--text-muted)]">Set exactly one of Account or Instrument.</p>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={LBL}>Market Value</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.market_value ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, market_value: e.target.value || null }))}
                placeholder="e.g. 125000.00"
                className={INP}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LBL}>Balance</span>
              <input
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(e) => setForm((p) => ({ ...p, balance: e.target.value }))}
                placeholder="e.g. 12000.00"
                className={INP}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className={LBL}>Unit Price</span>
            <input
              type="number"
              step="0.000001"
              min="0"
              value={form.unit_price ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, unit_price: e.target.value || null }))}
              placeholder="e.g. 45.6789 (for MF NAV)"
              className={INP}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={LBL}>Source</span>
            <select value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value as ValuationSnapshot['source'] }))} className={INP}>
              <option value="manual">Manual</option>
              <option value="csv">CSV</option>
              <option value="api">API</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={LBL}>Notes</span>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className={INP + ' resize-none'}
              placeholder="Optional note"
            />
          </label>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/15 px-3 py-2 text-xs text-red-700 dark:text-red-300">{formError}</p>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={closeDrawer} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} loading={saving} disabled={!canWrite}>
              {editItem ? 'Save Changes' : 'Add Valuation'}
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  )
}
