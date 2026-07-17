import { useEffect, useMemo, useState } from 'react'
import { householdApi } from '../api/householdApi'
import { FormActions } from '../components/common/FormActions'
import { AsyncSelect, SelectField, TextField } from '../components/common/FormField'
import { DeleteButton } from '../components/common/DeleteButton'
import { AvatarUpload } from '../components/common/AvatarUpload'
import { ValidationMessage } from '../components/common/ValidationMessage'
import { Sheet } from '../components/ui/Sheet'
import { useAuth } from '../context/AuthContext'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { normalizeApiError } from '../hooks/errorUtils'
import type { Household, Member, OptionItem } from '../types/domain'

type Props = {
  householdId: number
  householdOptions: OptionItem[]
  onHouseholdsChanged: () => Promise<void>
  canDelete: (e: DeleteEntity) => boolean
}

type Tab = 'households' | 'members'

const RELATION_OPTIONS: OptionItem[] = [
  { id: 1, label: 'self' },
  { id: 2, label: 'spouse' },
  { id: 3, label: 'child' },
  { id: 4, label: 'parent' },
  { id: 5, label: 'other' },
]

const blankHouseholdForm = () => ({ id: 0, name: '', base_currency: 'INR' })
const blankMemberForm = (household: number) => ({
  id: 0,
  household,
  full_name: '',
  email: '',
  relation_type: 'self' as Member['relation_type'],
  is_active: true,
  include_in_networth: true,
  photo: '',
})

type HouseholdSheetState = { type: 'none' } | { type: 'household'; item?: Household }
type MemberSheetState = { type: 'none' } | { type: 'member'; item?: Member }

export function HouseholdPage({ householdId, householdOptions, onHouseholdsChanged, canDelete }: Props) {
  const { canWrite } = useAuth()
  const [tab, setTab] = useState<Tab>('households')
  const [households, setHouseholds] = useState<Household[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [householdSheet, setHouseholdSheet] = useState<HouseholdSheetState>({ type: 'none' })
  const [householdForm, setHouseholdForm] = useState(blankHouseholdForm())

  const [memberSheet, setMemberSheet] = useState<MemberSheetState>({ type: 'none' })
  const [memberForm, setMemberForm] = useState(blankMemberForm(householdId))

  const selectedHouseholdName = useMemo(() => {
    return householdOptions.find((h) => h.id === householdId)?.label || `Household ${householdId}`
  }, [householdId, householdOptions])

  const loadData = async () => {
    try {
      const [h, m] = await Promise.all([householdApi.listHouseholds(), householdApi.listMembers(householdId)])
      setHouseholds(h)
      setMembers(m)
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  const openHousehold = (item?: Household) => {
    setError('')
    setHouseholdForm(item ? { id: item.id, name: item.name, base_currency: item.base_currency } : blankHouseholdForm())
    setHouseholdSheet({ type: 'household', item })
  }

  const openMember = (item?: Member) => {
    setError('')
    setMemberForm(item ? { ...item } : blankMemberForm(householdId))
    setMemberSheet({ type: 'member', item })
  }

  const saveHousehold = async () => {
    setError('')
    setSaving(true)
    try {
      if (householdForm.id) {
        await householdApi.updateHousehold(householdForm.id, {
          name: householdForm.name,
          base_currency: householdForm.base_currency,
        })
      } else {
        await householdApi.createHousehold({ name: householdForm.name, base_currency: householdForm.base_currency })
      }
      setHouseholdSheet({ type: 'none' })
      await onHouseholdsChanged()
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const saveMember = async () => {
    setError('')
    setSaving(true)
    try {
      if (memberForm.id) {
        await householdApi.updateMember(memberForm.id, memberForm)
      } else {
        await householdApi.createMember(memberForm)
      }
      setMemberSheet({ type: 'none' })
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'}`

  return (
    <section className="grid min-w-0 gap-5">
      <div className="flex items-start justify-between gap-3">
        <header>
          <h1 className="text-xl font-semibold text-[var(--text)]">Household</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">Managing {selectedHouseholdName}</p>
        </header>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={tabCls('households')} onClick={() => setTab('households')}>Households</button>
        <button className={tabCls('members')} onClick={() => setTab('members')}>Members</button>
      </div>

      {tab === 'households' && (
        <div className="grid min-w-0 gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-[var(--text-muted)]">{households.length} {households.length === 1 ? 'household' : 'households'}</p>
            {canWrite && (
              <button
                type="button"
                onClick={() => openHousehold()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                + Add Household
              </button>
            )}
          </div>

          {households.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--border-2)] bg-[var(--surface)] p-8 text-center">
              <p className="mt-2 text-sm font-medium text-[var(--text-2)]">No households yet</p>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => openHousehold()}
                  className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
                  Add First Household
                </button>
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {households.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)]"
              >
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => openHousehold(h)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--text)] hover:text-primary-600 disabled:cursor-not-allowed"
                >
                  {h.name} <span className="text-[var(--text-muted)]">({h.base_currency})</span>
                </button>
                <DeleteButton
                  disabled={!canDelete('household')}
                  onDelete={async () => {
                    setError('')
                    try {
                      await householdApi.deleteHousehold(h.id)
                      await onHouseholdsChanged()
                      await loadData()
                    } catch (e) {
                      setError(normalizeApiError(e))
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="grid min-w-0 gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-[var(--text-muted)]">{members.length} {members.length === 1 ? 'member' : 'members'}</p>
            {canWrite && (
              <button
                type="button"
                onClick={() => openMember()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                + Add Member
              </button>
            )}
          </div>

          {members.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--border-2)] bg-[var(--surface)] p-8 text-center">
              <p className="mt-2 text-sm font-medium text-[var(--text-2)]">No members yet</p>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => openMember()}
                  className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
                  Add First Member
                </button>
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)] ${!m.include_in_networth ? 'opacity-60' : ''}`}
              >
                <AvatarUpload
                  photo={m.photo}
                  name={m.full_name}
                  size={36}
                  disabled={!canWrite}
                  onChange={async (photo) => { await householdApi.updateMember(m.id, { photo }); await loadData() }}
                />
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => openMember(m)}
                  className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                >
                  <p className="truncate text-sm font-medium text-[var(--text)] hover:text-primary-600">{m.full_name}</p>
                  <p className="text-xs capitalize text-[var(--text-muted)]">
                    {m.relation_type}
                    {!m.include_in_networth && ' · excluded from net worth'}
                  </p>
                </button>
                <DeleteButton
                  disabled={!canDelete('member')}
                  onDelete={async () => { await householdApi.deleteMember(m.id); await loadData() }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {householdSheet.type === 'household' && (
        <Sheet title={householdSheet.item ? 'Edit Household' : 'Add Household'} onClose={() => setHouseholdSheet({ type: 'none' })}>
          <div className="space-y-3">
            {error && <ValidationMessage message={error} />}
            <TextField label="Name" value={householdForm.name} onChange={(v) => setHouseholdForm((p) => ({ ...p, name: v }))} />
            <TextField
              label="Base Currency"
              value={householdForm.base_currency}
              onChange={(v) => setHouseholdForm((p) => ({ ...p, base_currency: v.toUpperCase() }))}
            />
            <FormActions onSubmit={saveHousehold} saving={saving} disabled={!canWrite} />
          </div>
        </Sheet>
      )}

      {memberSheet.type === 'member' && (
        <Sheet title={memberSheet.item ? 'Edit Member' : 'Add Member'} onClose={() => setMemberSheet({ type: 'none' })}>
          <div className="space-y-3">
            {error && <ValidationMessage message={error} />}
            <div className="mb-1 flex justify-center">
              <AvatarUpload
                photo={memberForm.photo}
                name={memberForm.full_name}
                size={72}
                disabled={!canWrite}
                onChange={(photo) => setMemberForm((p) => ({ ...p, photo }))}
              />
            </div>
            <AsyncSelect
              label="Household"
              value={String(memberForm.household)}
              onChange={(v) => setMemberForm((p) => ({ ...p, household: Number(v) }))}
              options={householdOptions}
            />
            <TextField label="Full Name" value={memberForm.full_name} onChange={(v) => setMemberForm((p) => ({ ...p, full_name: v }))} />
            <TextField label="Email" value={memberForm.email} onChange={(v) => setMemberForm((p) => ({ ...p, email: v }))} type="email" />
            <SelectField
              label="Relation"
              value={String(RELATION_OPTIONS.find((x) => x.label === memberForm.relation_type)?.id || 1)}
              onChange={(v) =>
                setMemberForm((p) => ({ ...p, relation_type: RELATION_OPTIONS.find((x) => x.id === Number(v))?.label as Member['relation_type'] }))
              }
              options={RELATION_OPTIONS}
            />
            <SelectField
              label="Active"
              value={memberForm.is_active ? '1' : '0'}
              onChange={(v) => setMemberForm((p) => ({ ...p, is_active: v === '1' }))}
              options={[
                { id: 1, label: 'true' },
                { id: 0, label: 'false' },
              ]}
            />
            <SelectField
              label="Include in Net Worth"
              value={memberForm.include_in_networth ? '1' : '0'}
              onChange={(v) => setMemberForm((p) => ({ ...p, include_in_networth: v === '1' }))}
              options={[
                { id: 1, label: 'true' },
                { id: 0, label: 'false' },
              ]}
            />
            <FormActions onSubmit={saveMember} saving={saving} disabled={!canWrite} />
          </div>
        </Sheet>
      )}
    </section>
  )
}
