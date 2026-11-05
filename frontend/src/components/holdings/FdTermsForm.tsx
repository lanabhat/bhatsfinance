import { useState } from 'react'
import { fdDetailsApi } from '../../api/fdDetailsApi'
import { normalizeApiError } from '../../hooks/errorUtils'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Input'
import type { FDDetails } from '../../types/domain'

const COMPOUNDING: { value: FDDetails['compounding']; label: string }[] = [
  { value: 'simple', label: 'Simple interest' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'annually', label: 'Annually' },
]

/**
 * Edits the terms of one fixed deposit (rate, compounding, dates, principal). These live on
 * FDDetails, not the instrument, since one instrument can hold several deposits.
 */
export function FdTermsForm({ fd, onSave, onCancel }: {
  fd: FDDetails
  onSave: () => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    annual_rate: fd.annual_rate,
    compounding: fd.compounding,
    principal: fd.principal,
    investment_date: fd.investment_date,
    maturity_date: fd.maturity_date,
    maturity_value: fd.maturity_value ?? '',
    account_number: fd.account_number,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((p) => ({ ...p, [key]: value }))

  const save = async () => {
    if (!form.annual_rate || !form.principal || !form.investment_date || !form.maturity_date) {
      setError('Enter the rate, principal and both dates.'); return
    }
    setSaving(true)
    setError('')
    try {
      await fdDetailsApi.update(fd.id, { ...form, maturity_value: form.maturity_value || null })
      await onSave()
    } catch (e) {
      setError(normalizeApiError(e) || 'Couldn’t save the deposit terms.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Interest rate (% a year)" htmlFor="fd-rate">
          <Input id="fd-rate" type="number" step="0.01" min="0" value={form.annual_rate} onChange={(e) => set('annual_rate', e.target.value)} />
        </Field>
        <Field label="Compounding" htmlFor="fd-comp">
          <Select id="fd-comp" value={form.compounding} onChange={(e) => set('compounding', e.target.value as FDDetails['compounding'])}>
            {COMPOUNDING.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opened on" htmlFor="fd-start">
          <Input id="fd-start" type="date" value={form.investment_date} onChange={(e) => set('investment_date', e.target.value)} />
        </Field>
        <Field label="Matures on" htmlFor="fd-maturity">
          <Input id="fd-maturity" type="date" value={form.maturity_date} onChange={(e) => set('maturity_date', e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Principal (₹)" htmlFor="fd-principal" hint="Interest is worked out on this.">
          <Input id="fd-principal" type="number" min="0" step="0.01" value={form.principal} onChange={(e) => set('principal', e.target.value)} />
        </Field>
        <Field label="Maturity value (₹)" htmlFor="fd-mv" hint="Optional — the bank’s figure, if known.">
          <Input id="fd-mv" type="number" min="0" step="0.01" value={form.maturity_value} onChange={(e) => set('maturity_value', e.target.value)} />
        </Field>
      </div>
      <Field label="FD account / receipt number" htmlFor="fd-acct">
        <Input id="fd-acct" value={form.account_number} onChange={(e) => set('account_number', e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" loading={saving} onClick={() => void save()}>Save</Button>
      </div>
    </div>
  )
}
