import { useEffect, useRef, useState } from 'react'
import { insuranceApi } from '../api/insuranceApi'
import { BaseForm } from '../components/common/BaseForm'
import { DeleteButton } from '../components/common/DeleteButton'
import { FormActions } from '../components/common/FormActions'
import { DateField, MoneyInput, PercentageInput, SelectField, TextAreaField, TextField } from '../components/common/FormField'
import { useAuth } from '../context/AuthContext'
import { normalizeApiError } from '../hooks/errorUtils'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import type { InsurancePolicy, OptionItem, VehicleClaim } from '../types/domain'

const POLICY_TYPE_OPTIONS: OptionItem[] = [
  { id: 1, label: 'Life' },
  { id: 2, label: 'Health' },
  { id: 3, label: 'Vehicle' },
  { id: 4, label: 'Government Scheme' },
  { id: 5, label: 'Other' },
]
const POLICY_TYPE_VALUES = ['life', 'health', 'vehicle', 'govt_scheme', 'other'] as const
type PolicyType = InsurancePolicy['policy_type']

const FREQ_OPTIONS: OptionItem[] = [
  { id: 1, label: 'Annual' },
  { id: 2, label: 'Half-Yearly' },
  { id: 3, label: 'Quarterly' },
  { id: 4, label: 'Monthly' },
  { id: 5, label: 'Single Premium' },
  { id: 6, label: 'N/A' },
]
const FREQ_VALUES = ['annual', 'half_yearly', 'quarterly', 'monthly', 'single', 'na'] as const
type PremiumFreq = InsurancePolicy['premium_frequency']

const VEHICLE_TYPE_OPTIONS: OptionItem[] = [
  { id: 1, label: 'Car' },
  { id: 2, label: 'Two-Wheeler' },
  { id: 3, label: 'Other' },
]
const VEHICLE_TYPE_VALUES = ['car', 'two_wheeler', 'other'] as const

const COVERAGE_TYPE_OPTIONS: OptionItem[] = [
  { id: 1, label: 'Comprehensive' },
  { id: 2, label: 'Third Party' },
  { id: 3, label: 'Own Damage' },
]
const COVERAGE_TYPE_VALUES = ['comprehensive', 'third_party', 'own_damage'] as const

const CLAIM_STATUS_OPTIONS: OptionItem[] = [
  { id: 1, label: 'Filed' },
  { id: 2, label: 'Approved' },
  { id: 3, label: 'Rejected' },
  { id: 4, label: 'Settled' },
]
const CLAIM_STATUS_VALUES = ['filed', 'approved', 'rejected', 'settled'] as const

const POLICY_TYPE_ICONS: Record<PolicyType, string> = {
  life: '🛡',
  health: '🏥',
  vehicle: '🚗',
  govt_scheme: '🏛',
  other: '📄',
}

const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  life: 'Life Insurance',
  health: 'Health Insurance',
  vehicle: 'Vehicle Insurance',
  govt_scheme: 'Government Schemes',
  other: 'Other Policies',
}

const FREQ_LABEL: Record<PremiumFreq, string> = {
  annual: 'Annual',
  half_yearly: 'Half-Yearly',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
  single: 'Single Premium',
  na: 'N/A',
}

const CLAIM_STATUS_COLORS: Record<VehicleClaim['status'], string> = {
  filed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  settled: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}

function toIdxOption(values: readonly string[], value: string): string {
  const idx = values.indexOf(value)
  return idx >= 0 ? String(idx + 1) : ''
}

function fromIdxOption<T extends string>(values: readonly T[], idStr: string, fallback: T): T {
  const idx = Number(idStr) - 1
  return (idx >= 0 && idx < values.length) ? values[idx] : fallback
}

function emptyForm(householdId: number): Omit<InsurancePolicy, 'id' | 'member_name' | 'account_name' | 'covered_member_names' | 'vehicle_claims' | 'created_at' | 'updated_at'> {
  return {
    household: householdId,
    member: null,
    nominee_name: '',
    nominee_relation: '',
    policy_type: 'life',
    policy_subtype: '',
    policy_name: '',
    policy_number: '',
    insurer_name: '',
    sum_insured: null,
    premium_amount: null,
    premium_frequency: 'annual',
    premium_due_day: null,
    premium_due_month: null,
    start_date: new Date().toISOString().slice(0, 10),
    maturity_date: null,
    end_date: null,
    grace_days: 30,
    is_active: true,
    is_employer_paid: false,
    account: null,
    notes: '',
    is_family_floater: false,
    covered_members: [],
    vehicle_instrument: null,
    vehicle_type: '',
    coverage_type: '',
    idv_amount: null,
    ncb_percent: null,
    add_on_covers: '',
  }
}

type Props = {
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  canDelete: (e: DeleteEntity) => boolean
}

type ViewMode = 'table' | 'card'
const VIEW_MODE_KEY = 'insurance:viewMode'

function loadViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY)
    return raw === 'card' ? 'card' : 'table'
  } catch { return 'table' }
}

export function InsurancePage({ householdId, memberOptions, accountOptions, instrumentOptions, canDelete }: Props) {
  const { canWrite } = useAuth()
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [editId, setEditId] = useState(0)
  const [form, setForm] = useState(() => emptyForm(householdId))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  const formRef = useRef<HTMLDivElement>(null)

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem(VIEW_MODE_KEY, mode) } catch { /* ignore */ }
  }

  // The form panel renders below the (potentially long) policy list, so
  // opening it via a table/card Edit button gives no visible feedback unless
  // we scroll it into view — otherwise it looks like Edit "did nothing".
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showForm])

  // Vehicle claims state (for edit mode)
  const [claims, setClaims] = useState<VehicleClaim[]>([])
  const [claimForm, setClaimForm] = useState<Omit<VehicleClaim, 'id' | 'created_at' | 'updated_at'>>({
    policy: 0, claim_date: new Date().toISOString().slice(0, 10),
    description: '', claim_amount: '0', status: 'filed', settled_amount: null, notes: '',
  })
  const [claimError, setClaimError] = useState('')
  const [claimSaving, setClaimSaving] = useState(false)
  const [showClaimForm, setShowClaimForm] = useState(false)

  const loadPolicies = async () => {
    try {
      setPolicies(await insuranceApi.listPolicies(householdId))
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  useEffect(() => {
    setForm((p) => ({ ...p, household: householdId }))
    void loadPolicies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  const openNew = () => {
    setEditId(0)
    setForm(emptyForm(householdId))
    setClaims([])
    setShowClaimForm(false)
    setError('')
    setShowForm(true)
  }

  const openEdit = (p: InsurancePolicy) => {
    setEditId(p.id)
    setForm({
      household: p.household,
      member: p.member,
      nominee_name: p.nominee_name,
      nominee_relation: p.nominee_relation,
      policy_type: p.policy_type,
      policy_subtype: p.policy_subtype,
      policy_name: p.policy_name,
      policy_number: p.policy_number,
      insurer_name: p.insurer_name,
      sum_insured: p.sum_insured,
      premium_amount: p.premium_amount,
      premium_frequency: p.premium_frequency,
      premium_due_day: p.premium_due_day,
      premium_due_month: p.premium_due_month,
      start_date: p.start_date,
      maturity_date: p.maturity_date,
      end_date: p.end_date,
      grace_days: p.grace_days,
      is_active: p.is_active,
      is_employer_paid: p.is_employer_paid,
      account: p.account,
      notes: p.notes,
      is_family_floater: p.is_family_floater,
      covered_members: p.covered_members,
      vehicle_instrument: p.vehicle_instrument,
      vehicle_type: p.vehicle_type,
      coverage_type: p.coverage_type,
      idv_amount: p.idv_amount,
      ncb_percent: p.ncb_percent,
      add_on_covers: p.add_on_covers,
    })
    setClaims(p.vehicle_claims ?? [])
    setClaimForm({ policy: p.id, claim_date: new Date().toISOString().slice(0, 10), description: '', claim_amount: '0', status: 'filed', settled_amount: null, notes: '' })
    setShowClaimForm(false)
    setError('')
    setShowForm(true)
  }

  const save = async () => {
    if (!form.policy_name.trim()) { setError('Policy name is required.'); return }
    setSaving(true); setError('')
    try {
      if (editId) await insuranceApi.updatePolicy(editId, form)
      else await insuranceApi.createPolicy(form)
      setShowForm(false)
      setEditId(0)
      await loadPolicies()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const saveClaim = async () => {
    if (!claimForm.description.trim()) { setClaimError('Description is required.'); return }
    setClaimSaving(true); setClaimError('')
    try {
      const created = await insuranceApi.createClaim({ ...claimForm, policy: editId })
      setClaims((prev) => [created, ...prev])
      setShowClaimForm(false)
      setClaimForm({ policy: editId, claim_date: new Date().toISOString().slice(0, 10), description: '', claim_amount: '0', status: 'filed', settled_amount: null, notes: '' })
      await loadPolicies()
    } catch (e) {
      setClaimError(normalizeApiError(e))
    } finally {
      setClaimSaving(false)
    }
  }

  const deleteClaim = async (id: number) => {
    await insuranceApi.deleteClaim(id)
    setClaims((prev) => prev.filter((c) => c.id !== id))
    await loadPolicies()
  }

  const grouped = POLICY_TYPE_VALUES.reduce<Record<PolicyType, InsurancePolicy[]>>(
    (acc, t) => { acc[t] = policies.filter((p) => p.policy_type === t); return acc },
    {} as Record<PolicyType, InsurancePolicy[]>,
  )

  const vehicleInstrumentOptions = instrumentOptions

  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex items-start justify-between gap-3">
        <header>
          <h1 className="text-xl font-semibold text-[var(--text)]">Insurance & Policies</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">{policies.length} {policies.length === 1 ? 'policy' : 'policies'}</p>
        </header>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {policies.length > 0 && (
            <a
              href={`/api/insurance-policies/export/?household_id=${householdId}`}
              download="insurance_policies.csv"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
            >
              Export CSV
            </a>
          )}
          <a
            href="#/import"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            Import CSV
          </a>
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
          {canWrite && (
            <button
              type="button"
              onClick={openNew}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              + Add Policy
            </button>
          )}
        </div>
      </div>

      {error && !showForm && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {policies.length === 0 && !showForm && (
        <div className="rounded-2xl border border-dashed border-[var(--border-2)] bg-[var(--surface)] p-8 text-center">
          <p className="text-3xl">🛡</p>
          <p className="mt-2 text-sm font-medium text-[var(--text-2)]">No policies yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Add your LIC, health, vehicle, and government scheme policies.</p>
          {canWrite && (
            <button
              type="button"
              onClick={openNew}
              className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Add First Policy
            </button>
          )}
        </div>
      )}

      {/* Policy groups */}
      {POLICY_TYPE_VALUES.map((type) => {
        const group = grouped[type]
        if (group.length === 0) return null
        return (
          <div key={type}>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <span>{POLICY_TYPE_ICONS[type]}</span>
              <span>{POLICY_TYPE_LABELS[type]}</span>
            </h2>
            {viewMode === 'table' ? (
              <PolicyTable
                policies={group}
                canWrite={canWrite}
                canDelete={canDelete('sip_mandate')}
                onEdit={openEdit}
                onDelete={async (id) => { await insuranceApi.deletePolicy(id); await loadPolicies() }}
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {group.map((p) => (
                  <PolicyCard
                    key={p.id}
                    policy={p}
                    canWrite={canWrite}
                    canDelete={canDelete('sip_mandate')}
                    onEdit={() => openEdit(p)}
                    onDelete={async () => { await insuranceApi.deletePolicy(p.id); await loadPolicies() }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Form panel */}
      {showForm && (
        <div ref={formRef} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text)]">
              {editId ? 'Edit Policy' : 'New Policy'}
            </h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-xl text-[var(--text-muted)] hover:text-[var(--text-2)]">&times;</button>
          </div>
          <PolicyForm
            form={form}
            setForm={setForm}
            memberOptions={memberOptions}
            accountOptions={accountOptions}
            instrumentOptions={vehicleInstrumentOptions}
            error={error}
            saving={saving}
            canWrite={canWrite}
            onSave={save}
            onCancel={() => setShowForm(false)}
          />

          {/* Vehicle claims section (edit mode only) */}
          {editId > 0 && form.policy_type === 'vehicle' && (
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text)]">Claims History</h3>
                {canWrite && !showClaimForm && (
                  <button
                    type="button"
                    onClick={() => setShowClaimForm(true)}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    + Add Claim
                  </button>
                )}
              </div>
              {showClaimForm && (
                <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DateField label="Claim Date" value={claimForm.claim_date} onChange={(v) => setClaimForm((p) => ({ ...p, claim_date: v }))} />
                    <TextField label="Description" value={claimForm.description} onChange={(v) => setClaimForm((p) => ({ ...p, description: v }))} />
                    <MoneyInput label="Claim Amount" value={claimForm.claim_amount} onChange={(v) => setClaimForm((p) => ({ ...p, claim_amount: v }))} />
                    <SelectField
                      label="Status"
                      value={toIdxOption(CLAIM_STATUS_VALUES, claimForm.status)}
                      onChange={(v) => setClaimForm((p) => ({ ...p, status: fromIdxOption(CLAIM_STATUS_VALUES, v, 'filed') }))}
                      options={CLAIM_STATUS_OPTIONS}
                    />
                    {claimForm.status === 'settled' && (
                      <MoneyInput label="Settled Amount" value={claimForm.settled_amount ?? ''} onChange={(v) => setClaimForm((p) => ({ ...p, settled_amount: v || null }))} />
                    )}
                    <TextAreaField label="Notes" value={claimForm.notes} onChange={(v) => setClaimForm((p) => ({ ...p, notes: v }))} rows={2} className="sm:col-span-2" />
                  </div>
                  {claimError && <p className="mt-2 text-xs text-red-600">{claimError}</p>}
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={claimSaving} onClick={saveClaim} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                      {claimSaving ? 'Saving…' : 'Add Claim'}
                    </button>
                    <button type="button" onClick={() => setShowClaimForm(false)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {claims.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No claims recorded.</p>
              ) : (
                <div className="space-y-2">
                  {claims.map((c) => (
                    <div key={c.id} className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[var(--text)]">{c.description}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CLAIM_STATUS_COLORS[c.status]}`}>{c.status}</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">
                          {c.claim_date} · ₹{parseFloat(c.claim_amount).toLocaleString('en-IN')}
                          {c.settled_amount ? ` · Settled: ₹${parseFloat(c.settled_amount).toLocaleString('en-IN')}` : ''}
                        </p>
                        {c.notes && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{c.notes}</p>}
                      </div>
                      {canDelete('sip_mandate') && (
                        <DeleteButton onDelete={() => deleteClaim(c.id)} label="Remove" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Policy Table ─────────────────────────────────────────────────────────────

const thCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap'

function PolicyTable({
  policies, canWrite, canDelete, onEdit, onDelete,
}: {
  policies: InsurancePolicy[]
  canWrite: boolean
  canDelete: boolean
  onEdit: (p: InsurancePolicy) => void
  onDelete: (id: number) => Promise<void>
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-2)]">
          <tr>
            <th className={thCls}>Policy</th>
            <th className={thCls}>Insurer</th>
            <th className={thCls}>Insured</th>
            <th className={`${thCls} text-right`}>Sum Insured</th>
            <th className={`${thCls} text-right`}>Premium</th>
            <th className={thCls}>Maturity</th>
            <th className={thCls}>Status</th>
            <th className={thCls}></th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => {
            const maturityDays = p.maturity_date
              ? Math.ceil((new Date(p.maturity_date).getTime() - Date.now()) / 86_400_000)
              : null
            return (
              <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-sm">
                      {POLICY_TYPE_ICONS[p.policy_type]}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text)]">{p.policy_name}</p>
                      {p.policy_number && <p className="truncate font-mono text-[10px] text-[var(--text-faint)]">{p.policy_number}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--text-2)]">{p.insurer_name || '—'}</td>
                <td className="px-3 py-2 text-xs text-[var(--text-2)]">
                  {p.is_family_floater && p.covered_member_names.length > 0
                    ? p.covered_member_names.join(', ')
                    : p.member_name || '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-[var(--text-2)]">
                  {p.sum_insured ? `₹${parseFloat(p.sum_insured).toLocaleString('en-IN')}` : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-[var(--text-2)]">
                  {p.is_employer_paid ? 'Employer' : p.premium_amount ? `₹${parseFloat(p.premium_amount).toLocaleString('en-IN')} / ${FREQ_LABEL[p.premium_frequency]}` : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {maturityDays !== null ? (
                    <span className={maturityDays < 0 ? 'text-red-600' : maturityDays < 60 ? 'text-amber-600' : 'text-[var(--text-2)]'}>
                      {maturityDays < 0 ? `Matured ${Math.abs(maturityDays)}d ago` : `${maturityDays}d`}
                    </span>
                  ) : <span className="text-[var(--text-faint)]">—</span>}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${p.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canWrite && (
                      <button type="button" onClick={() => onEdit(p)}
                        className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]">
                        Edit
                      </button>
                    )}
                    <DeleteButton disabled={!canDelete} onDelete={() => onDelete(p.id)} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Policy Card ──────────────────────────────────────────────────────────────

function PolicyCard({
  policy, canWrite, canDelete, onEdit, onDelete,
}: {
  policy: InsurancePolicy
  canWrite: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const maturityDays = policy.maturity_date
    ? Math.ceil((new Date(policy.maturity_date).getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-lg">
          {POLICY_TYPE_ICONS[policy.policy_type]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text)]">{policy.policy_name}</p>
              {policy.insurer_name && <p className="text-xs text-[var(--text-muted)]">{policy.insurer_name}</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              {policy.is_employer_paid && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  Employer
                </span>
              )}
              {!policy.is_active && (
                <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                  Inactive
                </span>
              )}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-[var(--text-muted)]">
            {policy.policy_number && (
              <span className="col-span-2 font-mono text-[10px]">{policy.policy_number}</span>
            )}
            {policy.member_name && <span>Insured: {policy.member_name}</span>}
            {policy.nominee_name && <span>Nominee: {policy.nominee_name}</span>}
            {policy.sum_insured && (
              <span>Cover: ₹{parseFloat(policy.sum_insured).toLocaleString('en-IN')}</span>
            )}
            {policy.premium_amount && !policy.is_employer_paid && (
              <span>Premium: ₹{parseFloat(policy.premium_amount).toLocaleString('en-IN')} / {FREQ_LABEL[policy.premium_frequency]}</span>
            )}
            {policy.policy_type === 'vehicle' && policy.idv_amount && (
              <span>IDV: ₹{parseFloat(policy.idv_amount).toLocaleString('en-IN')}</span>
            )}
            {policy.policy_type === 'vehicle' && policy.ncb_percent && (
              <span>NCB: {policy.ncb_percent}%</span>
            )}
            {policy.is_family_floater && policy.covered_member_names.length > 0 && (
              <span className="col-span-2">Covers: {policy.covered_member_names.join(', ')}</span>
            )}
            {maturityDays !== null && (
              <span className={maturityDays < 0 ? 'text-red-600' : maturityDays < 60 ? 'text-amber-600' : ''}>
                {maturityDays < 0 ? `Matured ${Math.abs(maturityDays)}d ago` : `Matures in ${maturityDays}d`}
              </span>
            )}
          </div>
        </div>
      </div>

      {canWrite && (
        <div className="mt-3 flex gap-2 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            Edit
          </button>
          <DeleteButton onDelete={onDelete} disabled={!canDelete} />
        </div>
      )}
    </div>
  )
}

// ── Policy Form ──────────────────────────────────────────────────────────────

type FormState = ReturnType<typeof emptyForm>

function PolicyForm({
  form, setForm, memberOptions, accountOptions, instrumentOptions, error, saving, canWrite, onSave, onCancel,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  error: string
  saving: boolean
  canWrite: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: value }))

  const showPremiumFields = !form.is_employer_paid && form.premium_frequency !== 'na'

  return (
    <BaseForm title="" error={error}>
      {/* Core fields */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Policy Type"
          value={toIdxOption(POLICY_TYPE_VALUES, form.policy_type)}
          onChange={(v) => set('policy_type', fromIdxOption(POLICY_TYPE_VALUES, v, 'life'))}
          options={POLICY_TYPE_OPTIONS}
        />
        <TextField label="Policy Name" value={form.policy_name} onChange={(v) => set('policy_name', v)} />
        <TextField label="Insurer / Scheme Name" value={form.insurer_name} onChange={(v) => set('insurer_name', v)} />
        <TextField label="Policy Number" value={form.policy_number} onChange={(v) => set('policy_number', v)} />
        <SelectField
          label="Insured Member"
          value={form.member ? String(form.member) : ''}
          onChange={(v) => set('member', v ? Number(v) : null)}
          options={memberOptions}
          placeholder="Not specified"
        />
        <TextField label="Nominee Name" value={form.nominee_name} onChange={(v) => set('nominee_name', v)} />
        <TextField label="Nominee Relation" value={form.nominee_relation} onChange={(v) => set('nominee_relation', v)} />
        <MoneyInput
          label={form.policy_type === 'vehicle' ? 'Sum Insured / IDV' : 'Sum Insured / Sum Assured'}
          value={form.sum_insured ?? ''}
          onChange={(v) => set('sum_insured', v || null)}
        />
      </div>

      {/* Other sub-type */}
      {form.policy_type === 'other' && (
        <TextField
          label="Policy Sub-type (e.g. Accident, Travel, Home, Term Rider)"
          value={form.policy_subtype}
          onChange={(v) => set('policy_subtype', v)}
        />
      )}

      {/* Health-specific */}
      {form.policy_type === 'health' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Health Details</p>
          <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={form.is_family_floater}
              onChange={(e) => set('is_family_floater', e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-2)] text-primary-600 focus:ring-primary-500"
            />
            Family Floater policy
          </label>
          {form.is_family_floater && memberOptions.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-xs text-[var(--text-muted)]">Covered Members</p>
              <div className="flex flex-wrap gap-2">
                {memberOptions.map((m) => {
                  const checked = form.covered_members.includes(m.id)
                  return (
                    <label key={m.id} className="flex items-center gap-1.5 text-xs text-[var(--text-2)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => set('covered_members', e.target.checked
                          ? [...form.covered_members, m.id]
                          : form.covered_members.filter((id) => id !== m.id)
                        )}
                        className="h-3.5 w-3.5 rounded border-[var(--border-2)] text-primary-600"
                      />
                      {m.label}
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vehicle-specific */}
      {form.policy_type === 'vehicle' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Vehicle Details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Vehicle Type"
              value={form.vehicle_type ? toIdxOption(VEHICLE_TYPE_VALUES, form.vehicle_type) : ''}
              onChange={(v) => set('vehicle_type', v ? fromIdxOption(VEHICLE_TYPE_VALUES, v, 'car') : '')}
              options={VEHICLE_TYPE_OPTIONS}
              placeholder="Select"
            />
            <SelectField
              label="Coverage Type"
              value={form.coverage_type ? toIdxOption(COVERAGE_TYPE_VALUES, form.coverage_type) : ''}
              onChange={(v) => set('coverage_type', v ? fromIdxOption(COVERAGE_TYPE_VALUES, v, 'comprehensive') : '')}
              options={COVERAGE_TYPE_OPTIONS}
              placeholder="Select"
            />
            <SelectField
              label="Link to Vehicle (instrument)"
              value={form.vehicle_instrument ? String(form.vehicle_instrument) : ''}
              onChange={(v) => set('vehicle_instrument', v ? Number(v) : null)}
              options={instrumentOptions}
              placeholder="Optional"
            />
            <MoneyInput label="IDV Amount" value={form.idv_amount ?? ''} onChange={(v) => set('idv_amount', v || null)} />
            <PercentageInput label="NCB %" value={form.ncb_percent ?? ''} onChange={(v) => set('ncb_percent', v || null)} />
            <TextField label="Add-on Covers (comma-separated)" value={form.add_on_covers} onChange={(v) => set('add_on_covers', v)} className="sm:col-span-2" />
          </div>
        </div>
      )}

      {/* Premium & dates */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={form.is_employer_paid}
              onChange={(e) => set('is_employer_paid', e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-2)] text-primary-600 focus:ring-primary-500"
            />
            Employer / institution pays this premium (no reminders)
          </label>
        </div>

        {!form.is_employer_paid && (
          <>
            <MoneyInput label="Premium Amount" value={form.premium_amount ?? ''} onChange={(v) => set('premium_amount', v || null)} />
            <SelectField
              label="Premium Frequency"
              value={toIdxOption(FREQ_VALUES, form.premium_frequency)}
              onChange={(v) => set('premium_frequency', fromIdxOption(FREQ_VALUES, v, 'annual'))}
              options={FREQ_OPTIONS}
            />
            {showPremiumFields && (
              <>
                <TextField label="Due Day (1–28)" type="number" min="1" step="1" value={form.premium_due_day ?? ''} onChange={(v) => set('premium_due_day', v ? Number(v) : null)} />
                {['annual', 'half_yearly'].includes(form.premium_frequency) && (
                  <TextField label="Due Month (1–12)" type="number" min="1" step="1" value={form.premium_due_month ?? ''} onChange={(v) => set('premium_due_month', v ? Number(v) : null)} />
                )}
                <TextField label="Grace Days" type="number" min="0" step="1" value={form.grace_days} onChange={(v) => set('grace_days', Number(v))} />
                <SelectField
                  label="Deduct from Account"
                  value={form.account ? String(form.account) : ''}
                  onChange={(v) => set('account', v ? Number(v) : null)}
                  options={accountOptions}
                  placeholder="Not linked"
                />
              </>
            )}
          </>
        )}

        <DateField label="Start Date" value={form.start_date} onChange={(v) => set('start_date', v)} />
        <DateField label="Maturity Date (optional)" value={form.maturity_date ?? ''} onChange={(v) => set('maturity_date', v || null)} />
        <DateField label="End Date (if cancelled early)" value={form.end_date ?? ''} onChange={(v) => set('end_date', v || null)} />

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-2)] text-primary-600 focus:ring-primary-500"
            />
            Policy is active
          </label>
        </div>

        <TextAreaField label="Notes" value={form.notes} onChange={(v) => set('notes', v)} rows={2} className="sm:col-span-2" />
      </div>

      <FormActions onSubmit={onSave} onReset={onCancel} saving={saving} disabled={!canWrite} resetDisabled={saving} submitLabel={saving ? 'Saving…' : 'Save Policy'} />
    </BaseForm>
  )
}
