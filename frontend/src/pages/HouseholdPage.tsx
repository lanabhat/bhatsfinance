import { useEffect, useMemo, useState } from 'react'
import { householdApi } from '../api/householdApi'
import { BaseForm } from '../components/common/BaseForm'
import { EntityPageLayout } from '../components/common/EntityPageLayout'
import { FormActions } from '../components/common/FormActions'
import { AsyncSelect, SelectField, TextField } from '../components/common/FormField'
import { DeleteButton } from '../components/common/DeleteButton'
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

const RELATION_OPTIONS: OptionItem[] = [
  { id: 1, label: 'self' },
  { id: 2, label: 'spouse' },
  { id: 3, label: 'child' },
  { id: 4, label: 'parent' },
  { id: 5, label: 'other' },
]

export function HouseholdPage({ householdId, householdOptions, onHouseholdsChanged, canDelete }: Props) {
  const { canWrite } = useAuth()
  const [households, setHouseholds] = useState<Household[]>([])
  const [members, setMembers] = useState<Member[]>([])

  const [householdForm, setHouseholdForm] = useState({ id: 0, name: '', base_currency: 'INR' })
  const [memberForm, setMemberForm] = useState({
    id: 0,
    household: householdId,
    full_name: '',
    email: '',
    relation_type: 'self' as Member['relation_type'],
    is_active: true,
    include_in_networth: true,
  })
  const [error, setError] = useState('')

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
    setMemberForm((p) => ({ ...p, household: householdId }))
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  const saveHousehold = async () => {
    setError('')
    try {
      if (householdForm.id) {
        await householdApi.updateHousehold(householdForm.id, {
          name: householdForm.name,
          base_currency: householdForm.base_currency,
        })
      } else {
        await householdApi.createHousehold({ name: householdForm.name, base_currency: householdForm.base_currency })
      }
      setHouseholdForm({ id: 0, name: '', base_currency: 'INR' })
      await onHouseholdsChanged()
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const saveMember = async () => {
    setError('')
    try {
      if (memberForm.id) {
        await householdApi.updateMember(memberForm.id, memberForm)
      } else {
        await householdApi.createMember(memberForm)
      }
      setMemberForm({
        id: 0,
        household: householdId,
        full_name: '',
        email: '',
        relation_type: 'self' as Member['relation_type'],
        is_active: true,
        include_in_networth: true,
      })
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const resetMemberForm = () => {
    setMemberForm({
      id: 0,
      household: householdId,
      full_name: '',
      email: '',
      relation_type: 'self' as Member['relation_type'],
      is_active: true,
      include_in_networth: true,
    })
  }

  return (
    <>
      <EntityPageLayout
        title="Households"
        subtitle={`Managing ${selectedHouseholdName}`}
        list={
          <article className="panel">
            <h3>Existing Households</h3>
            <ul className="simple-list">
              {households.map((h) => (
                <li key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button className="list-link" disabled={!canWrite} onClick={() => setHouseholdForm({ id: h.id, name: h.name, base_currency: h.base_currency })}>
                    {h.name} ({h.base_currency})
                  </button>
                  <DeleteButton
                    disabled={!canDelete('household')}
                    onDelete={async () => {
                      setError('')
                      try {
                        await householdApi.deleteHousehold(h.id)
                        if (householdForm.id === h.id) setHouseholdForm({ id: 0, name: '', base_currency: 'INR' })
                        await onHouseholdsChanged()
                        await loadData()
                      } catch (e) {
                        setError(normalizeApiError(e))
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          </article>
        }
        form={
          <BaseForm title={householdForm.id ? 'Edit Household' : 'Create Household'} error={error}>
            <TextField label="Name" value={householdForm.name} onChange={(v) => setHouseholdForm((p) => ({ ...p, name: v }))} />
            <TextField
              label="Base Currency"
              value={householdForm.base_currency}
              onChange={(v) => setHouseholdForm((p) => ({ ...p, base_currency: v.toUpperCase() }))}
            />
            <FormActions onSubmit={saveHousehold} onReset={() => setHouseholdForm({ id: 0, name: '', base_currency: 'INR' })} disabled={!canWrite} />
          </BaseForm>
        }
      />

      <EntityPageLayout
        title="Members"
        subtitle="Create and edit household members"
        list={
          <article className="panel">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3>Members</h3>
              <button
                type="button"
                disabled={!canWrite}
                onClick={resetMemberForm}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                + Add Member
              </button>
            </div>
            <ul className="simple-list">
              {members.map((m) => (
                <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button className="list-link" disabled={!canWrite} onClick={() => setMemberForm({ ...m })}>
                    {m.full_name} ({m.relation_type})
                  </button>
                  {!m.include_in_networth && (
                    <span className="text-[10px] text-[var(--text-muted)]">excluded from net worth</span>
                  )}
                  <DeleteButton disabled={!canDelete('member')} onDelete={async () => { await householdApi.deleteMember(m.id); await loadData() }} />
                </li>
              ))}
            </ul>
          </article>
        }
        form={
          <BaseForm title={memberForm.id ? 'Edit Member' : 'Create Member'} error={error}>
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
            <FormActions
              onSubmit={saveMember}
              disabled={!canWrite}
              onReset={resetMemberForm}
            />
          </BaseForm>
        }
      />
    </>
  )
}
