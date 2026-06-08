import { useEffect, useState } from 'react'
import { alertsApi } from '../api/alertsApi'
import { BaseForm } from '../components/common/BaseForm'
import { EntityPageLayout } from '../components/common/EntityPageLayout'
import { DateField, MoneyInput, SelectField, TextField } from '../components/common/FormField'
import { FormActions } from '../components/common/FormActions'
import { DeleteButton } from '../components/common/DeleteButton'
import { useAuth } from '../context/AuthContext'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { normalizeApiError } from '../hooks/errorUtils'
import type { OptionItem, SIPMandate } from '../types/domain'

type Props = {
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  canDelete: (e: DeleteEntity) => boolean
}

const FREQUENCIES: OptionItem[] = [
  { id: 1, label: 'monthly' },
  { id: 2, label: 'quarterly' },
]

export function AlertsPage({ householdId, memberOptions, accountOptions, instrumentOptions, canDelete }: Props) {
  const { canWrite } = useAuth()
  const [items, setItems] = useState<SIPMandate[]>([])
  const [editId, setEditId] = useState(0)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Omit<SIPMandate, 'id'>>({
    household: householdId,
    member: null,
    account: 0,
    instrument: 0,
    expected_amount: '0.00',
    frequency: 'monthly',
    due_day: 5,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: null,
    grace_days: 5,
    is_active: true,
  })

  const loadData = async () => {
    try {
      setItems(await alertsApi.listSipMandates(householdId))
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
    if (form.due_day < 1 || form.due_day > 28) {
      setError('due_day must be between 1 and 28')
      return
    }
    setError('')
    try {
      if (editId) await alertsApi.updateSipMandate(editId, form)
      else await alertsApi.createSipMandate(form)
      setEditId(0)
      setForm({
        household: householdId,
        member: null,
        account: 0,
        instrument: 0,
        expected_amount: '0.00',
        frequency: 'monthly',
        due_day: 5,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: null,
        grace_days: 5,
        is_active: true,
      })
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  return (
    <EntityPageLayout
      title="Alerts"
      subtitle="SIP mandate management"
      list={
        <article className="panel">
          <h3>SIP Mandates</h3>
          <ul className="simple-list">
            {items.map((x) => (
              <li key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button className="list-link" disabled={!canWrite} onClick={() => { setEditId(x.id); setForm({ ...x }) }}>
                  Instrument #{x.instrument} - {x.frequency} - {x.expected_amount}
                </button>
                <DeleteButton disabled={!canDelete('sip_mandate')} onDelete={async () => { await alertsApi.deleteSipMandate(x.id); await loadData() }} />
              </li>
            ))}
          </ul>
        </article>
      }
      form={
        <BaseForm title={editId ? 'Edit SIP Mandate' : 'Create SIP Mandate'} error={error}>
          <div className="form-grid">
            <SelectField label="Member" value={form.member ? String(form.member) : ''} onChange={(v) => setForm((p) => ({ ...p, member: v ? Number(v) : null }))} options={memberOptions} placeholder="Optional" />
            <SelectField label="Account" value={String(form.account || '')} onChange={(v) => setForm((p) => ({ ...p, account: Number(v) }))} options={accountOptions} />
            <SelectField label="Instrument" value={String(form.instrument || '')} onChange={(v) => setForm((p) => ({ ...p, instrument: Number(v) }))} options={instrumentOptions} />
            <MoneyInput label="Expected Amount" value={form.expected_amount} onChange={(v) => setForm((p) => ({ ...p, expected_amount: v }))} />
            <SelectField label="Frequency" value={String(FREQUENCIES.find((x) => x.label === form.frequency)?.id || 1)} onChange={(v) => setForm((p) => ({ ...p, frequency: FREQUENCIES.find((x) => x.id === Number(v))?.label as SIPMandate['frequency'] }))} options={FREQUENCIES} />
            <TextField label="Due Day" type="number" min="1" step="1" value={form.due_day} onChange={(v) => setForm((p) => ({ ...p, due_day: Number(v) }))} />
            <DateField label="Start Date" value={form.start_date} onChange={(v) => setForm((p) => ({ ...p, start_date: v }))} />
            <DateField label="End Date" value={form.end_date || ''} onChange={(v) => setForm((p) => ({ ...p, end_date: v || null }))} />
            <TextField label="Grace Days" type="number" min="0" step="1" value={form.grace_days} onChange={(v) => setForm((p) => ({ ...p, grace_days: Number(v) }))} />
          </div>
          <FormActions onSubmit={save} disabled={!canWrite} />
        </BaseForm>
      }
    />
  )
}
