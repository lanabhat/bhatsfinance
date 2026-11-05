import { useState } from 'react'
import { portfolioApi } from '../../api/portfolioApi'
import { normalizeApiError } from '../../hooks/errorUtils'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Input'
import type { BondDetails } from '../../types/domain'

const COUPON_FREQUENCIES: { value: BondDetails['coupon_frequency']; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'annual', label: 'Annual' },
  { value: 'cumulative', label: 'Cumulative (paid at maturity)' },
]

const BOND_TYPES: { value: BondDetails['bond_type']; label: string }[] = [
  { value: 'government', label: 'Government' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'tax_free', label: 'Tax-free' },
  { value: 'sgb', label: 'Sovereign Gold Bond' },
  { value: 'ncd', label: 'NCD' },
  { value: 'other', label: 'Other' },
]

/**
 * Edits the terms of one bond investment (coupon rate, schedule, maturity). These live on
 * BondDetails, not the instrument, since one instrument can hold several bond buys.
 */
export function BondTermsForm({ bond, onSave, onCancel }: {
  bond: BondDetails
  onSave: () => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    issuer_name: bond.issuer_name,
    bond_type: bond.bond_type,
    isin: bond.isin,
    face_value: bond.face_value,
    quantity: String(bond.quantity),
    grace_days: String(bond.grace_days),
    coupon_rate: bond.coupon_rate,
    coupon_frequency: bond.coupon_frequency,
    investment_date: bond.investment_date,
    maturity_date: bond.maturity_date,
    first_coupon_date: bond.first_coupon_date ?? '',
    maturity_value: bond.maturity_value ?? '',
    credit_rating: bond.credit_rating,
    notes: bond.notes,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((p) => ({ ...p, [key]: value }))

  const save = async () => {
    if (!form.coupon_rate || !form.maturity_date || !form.face_value) { setError('Enter the coupon rate, maturity date and face value.'); return }
    setSaving(true)
    setError('')
    try {
      await portfolioApi.updateBondDetails(bond.id, {
        ...form,
        quantity: Number(form.quantity || '1'),
        grace_days: Number(form.grace_days || '0'),
        first_coupon_date: form.first_coupon_date || null,
        maturity_value: form.maturity_value || null,
      })
      await onSave()
    } catch (e) {
      setError(normalizeApiError(e) || 'Couldn’t save the bond terms.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Coupon rate (% a year)" htmlFor="bond-rate">
          <Input id="bond-rate" type="number" step="0.01" min="0" value={form.coupon_rate} onChange={(e) => set('coupon_rate', e.target.value)} />
        </Field>
        <Field label="Coupon frequency" htmlFor="bond-freq">
          <Select id="bond-freq" value={form.coupon_frequency} onChange={(e) => set('coupon_frequency', e.target.value as BondDetails['coupon_frequency'])}>
            {COUPON_FREQUENCIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Invested on" htmlFor="bond-start">
          <Input id="bond-start" type="date" value={form.investment_date} onChange={(e) => set('investment_date', e.target.value)} />
        </Field>
        <Field label="Matures on" htmlFor="bond-maturity">
          <Input id="bond-maturity" type="date" value={form.maturity_date} onChange={(e) => set('maturity_date', e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First coupon date" htmlFor="bond-first" hint="Optional — when coupon reminders start.">
          <Input id="bond-first" type="date" value={form.first_coupon_date} onChange={(e) => set('first_coupon_date', e.target.value)} />
        </Field>
        <Field label="Reminder grace days" htmlFor="bond-grace">
          <Input id="bond-grace" type="number" min="0" step="1" value={form.grace_days} onChange={(e) => set('grace_days', e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Face value (₹)" htmlFor="bond-face" hint="Per unit. Coupons are face value × units × rate.">
          <Input id="bond-face" type="number" min="0" step="0.01" value={form.face_value} onChange={(e) => set('face_value', e.target.value)} />
        </Field>
        <Field label="Units" htmlFor="bond-qty">
          <Input id="bond-qty" type="number" min="1" step="1" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
        </Field>
      </div>
      <Field label="Issuer" htmlFor="bond-issuer">
        <Input id="bond-issuer" value={form.issuer_name} onChange={(e) => set('issuer_name', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bond type" htmlFor="bond-type">
          <Select id="bond-type" value={form.bond_type} onChange={(e) => set('bond_type', e.target.value as BondDetails['bond_type'])}>
            {BOND_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="ISIN" htmlFor="bond-isin">
          <Input id="bond-isin" value={form.isin} onChange={(e) => set('isin', e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Credit rating" htmlFor="bond-rating">
          <Input id="bond-rating" placeholder="e.g. AAA" value={form.credit_rating} onChange={(e) => set('credit_rating', e.target.value)} />
        </Field>
        <Field label="Maturity value (₹)" htmlFor="bond-mv" hint="Optional">
          <Input id="bond-mv" type="number" min="0" step="0.01" value={form.maturity_value} onChange={(e) => set('maturity_value', e.target.value)} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="bond-notes">
        <Input id="bond-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" loading={saving} onClick={() => void save()}>Save</Button>
      </div>
    </div>
  )
}
