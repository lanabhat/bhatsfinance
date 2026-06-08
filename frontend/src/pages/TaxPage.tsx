import { useEffect, useState } from 'react'
import { taxApi } from '../api/taxApi'
import { BaseForm } from '../components/common/BaseForm'
import { EntityPageLayout } from '../components/common/EntityPageLayout'
import { DateField, MoneyInput, SelectField, TextAreaField, TextField } from '../components/common/FormField'
import { FormActions } from '../components/common/FormActions'
import { DeleteButton } from '../components/common/DeleteButton'
import { useAuth } from '../context/AuthContext'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { normalizeApiError } from '../hooks/errorUtils'
import type { OptionItem, TaxProjection, TaxRecord } from '../types/domain'

type Props = {
  householdId: number
  memberOptions: OptionItem[]
  canDelete: (e: DeleteEntity) => boolean
}

const RECORD_TYPES: OptionItem[] = [
  { id: 1, label: 'paid' },
  { id: 2, label: 'tds' },
  { id: 3, label: 'refund' },
]

export function TaxPage({ householdId, memberOptions, canDelete }: Props) {
  const { canWrite } = useAuth()
  const [records, setRecords] = useState<TaxRecord[]>([])
  const [projections, setProjections] = useState<TaxProjection[]>([])
  const [recordEditId, setRecordEditId] = useState(0)
  const [projectionEditId, setProjectionEditId] = useState(0)
  const [error, setError] = useState('')

  const [recordForm, setRecordForm] = useState<Omit<TaxRecord, 'id'>>({
    household: householdId,
    member: null,
    transaction_date: new Date().toISOString().slice(0, 10),
    financial_year: '2025-26',
    record_type: 'paid',
    amount: '0.00',
    notes: '',
  })

  const [projectionForm, setProjectionForm] = useState<Omit<TaxProjection, 'id'>>({
    household: householdId,
    member: null,
    financial_year: '2025-26',
    projected_total_income: '0.00',
    declared_deductions: '0.00',
    projected_tax: '0.00',
    notes: '',
  })

  const loadData = async () => {
    try {
      const [r, p] = await Promise.all([taxApi.listTaxRecords(householdId), taxApi.listTaxProjections(householdId)])
      setRecords(r)
      setProjections(p)
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  useEffect(() => {
    setRecordForm((f) => ({ ...f, household: householdId }))
    setProjectionForm((f) => ({ ...f, household: householdId }))
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  const validFY = (value: string) => /^\d{4}-\d{2}$/.test(value)

  const saveRecord = async () => {
    if (!validFY(recordForm.financial_year)) {
      setError('financial_year format must be YYYY-YY, e.g. 2025-26')
      return
    }
    setError('')
    try {
      if (recordEditId) await taxApi.updateTaxRecord(recordEditId, recordForm)
      else await taxApi.createTaxRecord(recordForm)
      setRecordEditId(0)
      setRecordForm({
        household: householdId,
        member: null,
        transaction_date: new Date().toISOString().slice(0, 10),
        financial_year: '2025-26',
        record_type: 'paid',
        amount: '0.00',
        notes: '',
      })
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const saveProjection = async () => {
    if (!validFY(projectionForm.financial_year)) {
      setError('financial_year format must be YYYY-YY, e.g. 2025-26')
      return
    }
    setError('')
    try {
      if (projectionEditId) await taxApi.updateTaxProjection(projectionEditId, projectionForm)
      else await taxApi.createTaxProjection(projectionForm)
      setProjectionEditId(0)
      setProjectionForm({
        household: householdId,
        member: null,
        financial_year: '2025-26',
        projected_total_income: '0.00',
        declared_deductions: '0.00',
        projected_tax: '0.00',
        notes: '',
      })
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  return (
    <>
      <EntityPageLayout
        title="Tax Records"
        subtitle="Paid, TDS, and refund entries"
        list={
          <article className="panel">
            <h3>Tax Records</h3>
            <ul className="simple-list">
              {records.map((x) => (
                <li key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button className="list-link" disabled={!canWrite} onClick={() => { setRecordEditId(x.id); setRecordForm({ ...x }) }}>
                    {x.financial_year} {x.record_type} {x.amount}
                  </button>
                  <DeleteButton disabled={!canDelete('tax_record')} onDelete={async () => { await taxApi.deleteTaxRecord(x.id); await loadData() }} />
                </li>
              ))}
            </ul>
          </article>
        }
        form={
          <BaseForm title={recordEditId ? 'Edit Tax Record' : 'Create Tax Record'} error={error}>
            <div className="form-grid">
              <SelectField label="Member" value={recordForm.member ? String(recordForm.member) : ''} onChange={(v) => setRecordForm((p) => ({ ...p, member: v ? Number(v) : null }))} options={memberOptions} placeholder="Optional" />
              <DateField label="Transaction Date" value={recordForm.transaction_date} onChange={(v) => setRecordForm((p) => ({ ...p, transaction_date: v }))} />
              <TextField label="Financial Year" value={recordForm.financial_year} onChange={(v) => setRecordForm((p) => ({ ...p, financial_year: v }))} />
              <SelectField label="Record Type" value={String(RECORD_TYPES.find((x) => x.label === recordForm.record_type)?.id || 1)} onChange={(v) => setRecordForm((p) => ({ ...p, record_type: RECORD_TYPES.find((x) => x.id === Number(v))?.label as TaxRecord['record_type'] }))} options={RECORD_TYPES} />
              <MoneyInput label="Amount" value={recordForm.amount} onChange={(v) => setRecordForm((p) => ({ ...p, amount: v }))} />
            </div>
            <TextAreaField label="Notes" value={recordForm.notes} onChange={(v) => setRecordForm((p) => ({ ...p, notes: v }))} rows={3} />
            <FormActions onSubmit={saveRecord} disabled={!canWrite} />
          </BaseForm>
        }
      />

      <EntityPageLayout
        title="Tax Projections"
        subtitle="Basic annual projections"
        list={
          <article className="panel">
            <h3>Tax Projections</h3>
            <ul className="simple-list">
              {projections.map((x) => (
                <li key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button className="list-link" disabled={!canWrite} onClick={() => { setProjectionEditId(x.id); setProjectionForm({ ...x }) }}>
                    {x.financial_year} projected tax {x.projected_tax}
                  </button>
                  <DeleteButton disabled={!canDelete('tax_projection')} onDelete={async () => { await taxApi.deleteTaxProjection(x.id); await loadData() }} />
                </li>
              ))}
            </ul>
          </article>
        }
        form={
          <BaseForm title={projectionEditId ? 'Edit Tax Projection' : 'Create Tax Projection'} error={error}>
            <div className="form-grid">
              <SelectField label="Member" value={projectionForm.member ? String(projectionForm.member) : ''} onChange={(v) => setProjectionForm((p) => ({ ...p, member: v ? Number(v) : null }))} options={memberOptions} placeholder="Optional" />
              <TextField label="Financial Year" value={projectionForm.financial_year} onChange={(v) => setProjectionForm((p) => ({ ...p, financial_year: v }))} />
              <MoneyInput label="Projected Income" value={projectionForm.projected_total_income} onChange={(v) => setProjectionForm((p) => ({ ...p, projected_total_income: v }))} />
              <MoneyInput label="Declared Deductions" value={projectionForm.declared_deductions} onChange={(v) => setProjectionForm((p) => ({ ...p, declared_deductions: v }))} />
              <MoneyInput label="Projected Tax" value={projectionForm.projected_tax} onChange={(v) => setProjectionForm((p) => ({ ...p, projected_tax: v }))} />
            </div>
            <TextAreaField label="Notes" value={projectionForm.notes} onChange={(v) => setProjectionForm((p) => ({ ...p, notes: v }))} rows={3} />
            <FormActions onSubmit={saveProjection} disabled={!canWrite} />
          </BaseForm>
        }
      />
    </>
  )
}
