import { useEffect, useState } from 'react'
import { fdDetailsApi } from '../api/fdDetailsApi'
import { valuationApi } from '../api/valuationApi'
import { BaseForm } from '../components/common/BaseForm'
import { EntityPageLayout } from '../components/common/EntityPageLayout'
import { useMaskedFmt } from '../components/common/Money'
import { DateField, MoneyInput, SelectField, TextAreaField, TextField } from '../components/common/FormField'
import { FormActions } from '../components/common/FormActions'
import { DeleteButton } from '../components/common/DeleteButton'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { normalizeApiError } from '../hooks/errorUtils'
import { HelpTooltip } from '../components/common/HelpTooltip'
import { useAuth } from '../context/AuthContext'
import { TOOLTIPS } from '../data/helpContent'
import type { BulkSnapshotResult, OptionItem, ValuationSnapshot } from '../types/domain'

type Props = {
  householdId: number
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  canDelete: (e: DeleteEntity) => boolean
}

const SOURCE_OPTIONS: OptionItem[] = [
  { id: 1, label: 'manual' },
  { id: 2, label: 'csv' },
  { id: 3, label: 'api' },
]

export function ValuationPage({ householdId, accountOptions, instrumentOptions, canDelete }: Props) {
  const { canWrite } = useAuth()
  const [items, setItems] = useState<ValuationSnapshot[]>([])
  const [editId, setEditId] = useState(0)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Omit<ValuationSnapshot, 'id'>>({
    household: householdId,
    valuation_date: new Date().toISOString().slice(0, 10),
    account: null,
    instrument: null,
    unit_price: null,
    market_value: null,
    balance: '0.00',
    source: 'manual',
    notes: '',
  })

  const [snapshotResult, setSnapshotResult] = useState<BulkSnapshotResult | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().slice(0, 10))

  const loadData = async () => {
    try {
      setItems(await valuationApi.listValuations(householdId))
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  useEffect(() => {
    setForm((p) => ({ ...p, household: householdId }))
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  const save = async () => {
    if ((form.account && form.instrument) || (!form.account && !form.instrument)) {
      setError('Set exactly one of account or instrument.')
      return
    }
    setError('')
    try {
      if (editId) await valuationApi.updateValuation(editId, form)
      else await valuationApi.createValuation(form)
      setEditId(0)
      setForm({ household: householdId, valuation_date: new Date().toISOString().slice(0, 10), account: null, instrument: null, unit_price: null, market_value: null, balance: '0.00', source: 'manual', notes: '' })
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const takeSnapshot = async () => {
    setSnapshotLoading(true)
    setSnapshotResult(null)
    try {
      const result = await fdDetailsApi.bulkSnapshot(householdId, snapshotDate)
      setSnapshotResult(result)
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSnapshotLoading(false)
    }
  }

  const fmt = useMaskedFmt()

  return (
    <>
      {/* Bulk Snapshot */}
      <article className="panel">
        <h3 style={{ display: 'inline-flex', alignItems: 'center' }}>Take Snapshot <HelpTooltip text={TOOLTIPS.take_snapshot} /></h3>
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
          Auto-computes FD/RD values using interest rates saved in Portfolio. Carries forward last known values for all other instruments and accounts.
        </p>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            Snapshot Date&nbsp;
            <input type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
          </label>
          <button onClick={() => void takeSnapshot()} disabled={snapshotLoading || !canWrite}>
            {snapshotLoading ? 'Taking snapshot…' : '📸 Take Snapshot'}
          </button>
        </div>

        {snapshotResult && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Net Worth</span><br /><strong style={{ fontSize: '1.4rem' }}>{fmt(snapshotResult.net_worth)}</strong></div>
              <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Total Assets</span><br /><strong>{fmt(snapshotResult.total_assets)}</strong></div>
              <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Total Liabilities</span><br /><strong>{fmt(snapshotResult.total_liabilities)}</strong></div>
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Snapshot saved as of {snapshotResult.as_of}</p>
            {snapshotResult.auto_computed.length > 0 && (
              <>
                <p style={{ color: '#10b981' }}>✓ Auto-computed ({snapshotResult.auto_computed.length})</p>
                <ul className="simple-list">
                  {snapshotResult.auto_computed.map((x, i) => <li key={i}>{x.name} ({x.type}) — {fmt(x.value)}</li>)}
                </ul>
              </>
            )}
            {snapshotResult.carried_forward.length > 0 && (
              <>
                <p style={{ color: '#6366f1' }}>↩ Carried forward ({snapshotResult.carried_forward.length})</p>
                <ul className="simple-list">
                  {snapshotResult.carried_forward.map((x, i) => <li key={i}>{x.name} ({x.type}) — {fmt(x.value)}</li>)}
                </ul>
              </>
            )}
            {snapshotResult.needs_manual.length > 0 && (
              <>
                <p style={{ color: '#f59e0b' }}>⚠ Needs manual entry ({snapshotResult.needs_manual.length})</p>
                <ul className="simple-list">
                  {snapshotResult.needs_manual.map((x, i) => <li key={i}>{x.name} ({x.type})</li>)}
                </ul>
              </>
            )}
          </div>
        )}
      </article>

      {/* Manual Valuation Entry */}
      <EntityPageLayout
        title="Manual Valuation Entry"
        subtitle="Enter unit price or market value for equity, MF, real estate, gold etc."
        list={
          <article className="panel">
            <h3>Valuation Snapshots</h3>
            <ul className="simple-list">
              {items.slice(0, 30).map((x) => (
                <li key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button className="list-link" disabled={!canWrite} onClick={() => { setEditId(x.id); setForm({ ...x }) }}>
                    {x.valuation_date} — {x.account ? `Account #${x.account}` : `Instrument #${x.instrument}`}
                    {x.market_value ? ` — ${fmt(x.market_value)}` : ''}
                    {x.notes ? ` (${x.notes.slice(0, 30)})` : ''}
                  </button>
                  <DeleteButton disabled={!canDelete('valuation')} onDelete={async () => { await valuationApi.deleteValuation(x.id); await loadData() }} />
                </li>
              ))}
            </ul>
          </article>
        }
        form={
          <BaseForm title={editId ? 'Edit Valuation Snapshot' : 'Create Valuation Snapshot'} error={error}>
            <div className="form-grid">
              <DateField label="Valuation Date" value={form.valuation_date} onChange={(v) => setForm((p) => ({ ...p, valuation_date: v }))} />
              <SelectField label="Account" value={form.account ? String(form.account) : ''} onChange={(v) => setForm((p) => ({ ...p, account: v ? Number(v) : null, instrument: v ? null : p.instrument }))} options={accountOptions} placeholder="Optional" />
              <SelectField label="Instrument" value={form.instrument ? String(form.instrument) : ''} onChange={(v) => setForm((p) => ({ ...p, instrument: v ? Number(v) : null, account: v ? null : p.account }))} options={instrumentOptions} placeholder="Optional" />
              <TextField label="Unit Price" type="number" min="0" step="0.000001" value={form.unit_price || ''} onChange={(v) => setForm((p) => ({ ...p, unit_price: v || null }))} />
              <MoneyInput label="Market Value" value={form.market_value || ''} onChange={(v) => setForm((p) => ({ ...p, market_value: v || null }))} />
              <MoneyInput label="Balance" value={form.balance} onChange={(v) => setForm((p) => ({ ...p, balance: v }))} />
              <SelectField label="Source" value={String(SOURCE_OPTIONS.find((x) => x.label === form.source)?.id || 1)} onChange={(v) => setForm((p) => ({ ...p, source: SOURCE_OPTIONS.find((x) => x.id === Number(v))?.label as ValuationSnapshot['source'] }))} options={SOURCE_OPTIONS} />
            </div>
            <TextAreaField label="Notes" value={form.notes} onChange={(v) => setForm((p) => ({ ...p, notes: v }))} rows={3} />
            <FormActions onSubmit={save} disabled={!canWrite} />
          </BaseForm>
        }
      />
    </>
  )
}
