import { useEffect, useMemo, useState } from 'react'
import { fdDetailsApi } from '../api/fdDetailsApi'
import { portfolioApi } from '../api/portfolioApi'
import { BaseForm } from '../components/common/BaseForm'
import { EntityPageLayout } from '../components/common/EntityPageLayout'
import { FormActions } from '../components/common/FormActions'
import { AsyncSelect, DateField, MoneyInput, PercentageInput, SelectField, TextAreaField, TextField } from '../components/common/FormField'
import { DeleteButton } from '../components/common/DeleteButton'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { normalizeApiError } from '../hooks/errorUtils'
import { TOOLTIPS } from '../data/helpContent'
import type { Account, AccountOwnership, FDDetails, Instrument, InstrumentOwnership, OptionItem } from '../types/domain'

const FD_TYPES = new Set(['fd', 'rd', 'epf', 'ppf', 'nps'])

const COMPOUNDING_OPTIONS: OptionItem[] = [
  { id: 1, label: 'simple' },
  { id: 2, label: 'monthly' },
  { id: 3, label: 'quarterly' },
  { id: 4, label: 'half_yearly' },
  { id: 5, label: 'annually' },
]

const emptyFD = (instrumentId = 0): Omit<FDDetails, 'id'> => ({
  instrument: instrumentId,
  principal: '',
  annual_rate: '',
  investment_date: new Date().toISOString().slice(0, 10),
  maturity_date: '',
  compounding: 'quarterly',
  maturity_value: null,
})

type Props = {
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  refreshOptions: () => Promise<void>
  canDelete: (e: DeleteEntity) => boolean
}

const ACCOUNT_TYPES: OptionItem[] = [
  'bank',
  'broker',
  'pf',
  'loan',
  'credit_card',
  'insurance',
  'cash',
  'other',
].map((x, i) => ({ id: i + 1, label: x }))

const INSTRUMENT_TYPES: OptionItem[] = [
  'cash',
  'equity',
  'mutual_fund',
  'sip',
  'fd',
  'rd',
  'epf',
  'ppf',
  'nps',
  'real_estate',
  'gold',
  'vehicle',
  'liability',
  'insurance',
  'other',
].map((x, i) => ({ id: i + 1, label: x }))

export function PortfolioPage({ householdId, memberOptions, accountOptions, instrumentOptions, refreshOptions, canDelete }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [accountOwnerships, setAccountOwnerships] = useState<AccountOwnership[]>([])
  const [instrumentOwnerships, setInstrumentOwnerships] = useState<InstrumentOwnership[]>([])

  const [accountForm, setAccountForm] = useState<Omit<Account, 'id'>>({
    household: householdId,
    name: '',
    account_type: 'bank',
    institution_name: '',
    primary_member: null,
    opening_balance: '0',
    credit_limit: null,
    statement_due_day: null,
    is_active: true,
  })
  const [accountEditId, setAccountEditId] = useState(0)

  const [instrumentForm, setInstrumentForm] = useState<Omit<Instrument, 'id'>>({
    household: householdId,
    default_account: null,
    asset_category: null,
    name: '',
    instrument_type: 'equity',
    symbol: '',
    metadata: {},
    is_active: true,
  })
  const [metadataText, setMetadataText] = useState('{}')
  const [instrumentEditId, setInstrumentEditId] = useState(0)

  const [fdMap, setFdMap] = useState<Record<number, FDDetails>>({})
  const [fdForm, setFdForm] = useState<Omit<FDDetails, 'id'>>(emptyFD())
  const [fdEditId, setFdEditId] = useState(0)


  const [accountOwnershipForm, setAccountOwnershipForm] = useState<Omit<AccountOwnership, 'id'>>({
    account: 0,
    member: 0,
    allocation_percent: '100.00',
  })
  const [accountOwnershipEditId, setAccountOwnershipEditId] = useState(0)

  const [instrumentOwnershipForm, setInstrumentOwnershipForm] = useState<Omit<InstrumentOwnership, 'id'>>({
    instrument: 0,
    member: 0,
    allocation_percent: '100.00',
  })
  const [instrumentOwnershipEditId, setInstrumentOwnershipEditId] = useState(0)

  const [error, setError] = useState('')

  const loadData = async () => {
    try {
      const [a, i] = await Promise.all([portfolioApi.listAccounts(householdId), portfolioApi.listInstruments(householdId)])
      setAccounts(a)
      setInstruments(i)
      const [ao, io, fds] = await Promise.all([
        portfolioApi.listAccountOwnerships(),
        portfolioApi.listInstrumentOwnerships(),
        fdDetailsApi.list(),
      ])
      setAccountOwnerships(ao)
      setInstrumentOwnerships(io)
      setFdMap(Object.fromEntries(fds.map((fd) => [fd.instrument, fd])))
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  useEffect(() => {
    setAccountForm((p) => ({ ...p, household: householdId }))
    setInstrumentForm((p) => ({ ...p, household: householdId }))
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  const accountAllocationWarning = useMemo(() => {
    const selected = accountOwnershipForm.account
    if (!selected) return ''
    const total = accountOwnerships
      .filter((x) => x.account === selected && x.id !== accountOwnershipEditId)
      .reduce((sum, x) => sum + Number(x.allocation_percent), 0)
    const next = total + Number(accountOwnershipForm.allocation_percent || '0')
    return next === 100 ? '' : `Allocation warning: total becomes ${next.toFixed(2)}%`
  }, [accountOwnerships, accountOwnershipForm, accountOwnershipEditId])

  const isFDType = FD_TYPES.has(instrumentForm.instrument_type)

  const instrumentAllocationWarning = useMemo(() => {
    const selected = instrumentOwnershipForm.instrument
    if (!selected) return ''
    const total = instrumentOwnerships
      .filter((x) => x.instrument === selected && x.id !== instrumentOwnershipEditId)
      .reduce((sum, x) => sum + Number(x.allocation_percent), 0)
    const next = total + Number(instrumentOwnershipForm.allocation_percent || '0')
    return next === 100 ? '' : `Allocation warning: total becomes ${next.toFixed(2)}%`
  }, [instrumentOwnerships, instrumentOwnershipForm, instrumentOwnershipEditId])

  const saveAccount = async () => {
    setError('')
    try {
      if (accountEditId) await portfolioApi.updateAccount(accountEditId, accountForm)
      else await portfolioApi.createAccount(accountForm)
      setAccountEditId(0)
      setAccountForm({ household: householdId, name: '', account_type: 'bank', institution_name: '', primary_member: null, opening_balance: '0', credit_limit: null, statement_due_day: null, is_active: true })
      await refreshOptions()
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const saveInstrument = async () => {
    setError('')
    try {
      const metadata = JSON.parse(metadataText)
      const payload = { ...instrumentForm, metadata }
      let savedId = instrumentEditId
      if (instrumentEditId) {
        await portfolioApi.updateInstrument(instrumentEditId, payload)
      } else {
        const created = await portfolioApi.createInstrument(payload)
        savedId = created.id
      }
      // Save FD details if applicable
      if (FD_TYPES.has(instrumentForm.instrument_type) && fdForm.principal && fdForm.annual_rate && fdForm.maturity_date) {
        const fdPayload = { ...fdForm, instrument: savedId }
        if (fdEditId) await fdDetailsApi.update(fdEditId, fdPayload)
        else await fdDetailsApi.create(fdPayload)
      }
      setInstrumentEditId(0)
      setFdEditId(0)
      setInstrumentForm({ household: householdId, default_account: null, asset_category: null, name: '', instrument_type: 'equity', symbol: '', metadata: {}, is_active: true })
      setMetadataText('{}')
      setFdForm(emptyFD())
      await refreshOptions()
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const saveAccountOwnership = async () => {
    setError('')
    try {
      if (accountOwnershipEditId) await portfolioApi.updateAccountOwnership(accountOwnershipEditId, accountOwnershipForm)
      else await portfolioApi.createAccountOwnership(accountOwnershipForm)
      setAccountOwnershipEditId(0)
      setAccountOwnershipForm({ account: 0, member: 0, allocation_percent: '100.00' })
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const saveInstrumentOwnership = async () => {
    setError('')
    try {
      if (instrumentOwnershipEditId) await portfolioApi.updateInstrumentOwnership(instrumentOwnershipEditId, instrumentOwnershipForm)
      else await portfolioApi.createInstrumentOwnership(instrumentOwnershipForm)
      setInstrumentOwnershipEditId(0)
      setInstrumentOwnershipForm({ instrument: 0, member: 0, allocation_percent: '100.00' })
      await loadData()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  return (
    <>
      <EntityPageLayout
        title="Accounts"
        subtitle="Create and edit account master data"
        list={
          <article className="panel">
            <h3>Accounts</h3>
            <ul className="simple-list">
              {accounts.map((x) => (
                <li key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button className="list-link" onClick={() => { setAccountEditId(x.id); setAccountForm({ ...x }) }}>
                    {x.name} ({x.account_type})
                  </button>
                  <DeleteButton disabled={!canDelete('account')} onDelete={async () => { await portfolioApi.deleteAccount(x.id); await refreshOptions(); await loadData() }} />
                </li>
              ))}
            </ul>
          </article>
        }
        form={
          <BaseForm title={accountEditId ? 'Edit Account' : 'Create Account'} error={error}>
            <TextField label="Name" value={accountForm.name} onChange={(v) => setAccountForm((p) => ({ ...p, name: v }))} />
            <SelectField
              label="Account Type"
              helpTooltip={TOOLTIPS.account_type}
              value={String(ACCOUNT_TYPES.find((x) => x.label === accountForm.account_type)?.id || 1)}
              onChange={(v) => setAccountForm((p) => ({ ...p, account_type: ACCOUNT_TYPES.find((x) => x.id === Number(v))?.label as Account['account_type'] }))}
              options={ACCOUNT_TYPES}
            />
            <TextField
              label="Institution"
              value={accountForm.institution_name}
              onChange={(v) => setAccountForm((p) => ({ ...p, institution_name: v }))}
            />
            <AsyncSelect
              label="Primary Member"
              value={accountForm.primary_member ? String(accountForm.primary_member) : ''}
              onChange={(v) => setAccountForm((p) => ({ ...p, primary_member: v ? Number(v) : null }))}
              options={memberOptions}
              placeholder="Optional"
            />
            <MoneyInput
              label="Opening Balance (â‚¹)"
              helpTooltip="Starting balance when you first add this account. The app computes current balance as: opening balance + all deposits âˆ’ all withdrawals."
              value={accountForm.opening_balance ?? '0'}
              onChange={(v) => setAccountForm((p) => ({ ...p, opening_balance: v }))}
            />
            {accountForm.account_type === 'credit_card' && (
              <>
                <MoneyInput
                  label="Credit Limit (â‚¹)"
                  helpTooltip="The maximum spending limit on this credit card as stated by the bank."
                  value={accountForm.credit_limit ?? ''}
                  onChange={(v) => setAccountForm((p) => ({ ...p, credit_limit: v || null }))}
                />
                <TextField
                  label="Statement Due Day"
                  type="number"
                  min={1}
                  step={1}
                  helpTooltip="Day of month when the credit card bill is due for payment (e.g., 15 means 15th of every month)."
                  value={accountForm.statement_due_day ?? ''}
                  onChange={(v) => setAccountForm((p) => ({ ...p, statement_due_day: v ? Number(v) : null }))}
                />
              </>
            )}
            <FormActions onSubmit={saveAccount} onReset={() => { setAccountEditId(0); setAccountForm({ household: householdId, name: '', account_type: 'bank', institution_name: '', primary_member: null, opening_balance: '0', credit_limit: null, statement_due_day: null, is_active: true }) }} />
          </BaseForm>
        }
      />

      <EntityPageLayout
        title="Instruments"
        subtitle="Create and edit investment/asset instruments"
        list={
          <article className="panel">
            <h3>Instruments</h3>
            <ul className="simple-list">
              {instruments.map((x) => (
                <li key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button className="list-link" onClick={() => {
                    setInstrumentEditId(x.id)
                    setInstrumentForm({ ...x })
                    setMetadataText(JSON.stringify(x.metadata || {}, null, 2))
                    const fd = fdMap[x.id]
                    if (fd) { setFdEditId(fd.id); setFdForm({ ...fd }) }
                    else { setFdEditId(0); setFdForm(emptyFD(x.id)) }
                  }}>
                    {x.name} ({x.instrument_type}){fdMap[x.id] ? ' â˜…' : ''}
                  </button>
                  <DeleteButton disabled={!canDelete('instrument')} onDelete={async () => { await portfolioApi.deleteInstrument(x.id); await refreshOptions(); await loadData() }} />
                </li>
              ))}
            </ul>
          </article>
        }
        form={
          <BaseForm title={instrumentEditId ? 'Edit Instrument' : 'Create Instrument'} error={error}>
            <TextField label="Name" value={instrumentForm.name} onChange={(v) => setInstrumentForm((p) => ({ ...p, name: v }))} />
            <SelectField
              label="Instrument Type"
              helpTooltip={TOOLTIPS.instrument_type}
              value={String(INSTRUMENT_TYPES.find((x) => x.label === instrumentForm.instrument_type)?.id || 1)}
              onChange={(v) => setInstrumentForm((p) => ({ ...p, instrument_type: INSTRUMENT_TYPES.find((x) => x.id === Number(v))?.label as Instrument['instrument_type'] }))}
              options={INSTRUMENT_TYPES}
            />
            <AsyncSelect
              label="Default Account"
              value={instrumentForm.default_account ? String(instrumentForm.default_account) : ''}
              onChange={(v) => setInstrumentForm((p) => ({ ...p, default_account: v ? Number(v) : null }))}
              options={accountOptions}
              placeholder="Optional"
            />
            <TextField label="Symbol" value={instrumentForm.symbol} onChange={(v) => setInstrumentForm((p) => ({ ...p, symbol: v }))} />
            {isFDType ? (
              <>
                <MoneyInput label="Principal (â‚¹)" value={fdForm.principal} onChange={(v) => setFdForm((p) => ({ ...p, principal: v }))} />
                <TextField label="Annual Rate (%)" type="number" min="0" step="0.01" value={fdForm.annual_rate} onChange={(v) => setFdForm((p) => ({ ...p, annual_rate: v }))} />
                <DateField label="Investment Date" value={fdForm.investment_date} onChange={(v) => setFdForm((p) => ({ ...p, investment_date: v }))} />
                <DateField label="Maturity Date" value={fdForm.maturity_date} onChange={(v) => setFdForm((p) => ({ ...p, maturity_date: v }))} />
                <SelectField
                  label="Compounding"
                  helpTooltip={TOOLTIPS.compounding}
                  value={String(COMPOUNDING_OPTIONS.find((x) => x.label === fdForm.compounding)?.id || 3)}
                  onChange={(v) => setFdForm((p) => ({ ...p, compounding: COMPOUNDING_OPTIONS.find((x) => x.id === Number(v))?.label as FDDetails['compounding'] }))}
                  options={COMPOUNDING_OPTIONS}
                />
                <MoneyInput label="Maturity Value (if known)" value={fdForm.maturity_value || ''} onChange={(v) => setFdForm((p) => ({ ...p, maturity_value: v || null }))} />
              </>
            ) : (
              <TextAreaField label="Metadata (JSON)" value={metadataText} onChange={setMetadataText} rows={5} />
            )}
            <FormActions onSubmit={saveInstrument} onReset={() => {
              setInstrumentEditId(0); setFdEditId(0)
              setInstrumentForm({ household: householdId, default_account: null, asset_category: null, name: '', instrument_type: 'equity', symbol: '', metadata: {}, is_active: true })
              setMetadataText('{}'); setFdForm(emptyFD())
            }} />
          </BaseForm>
        }
      />

      <section className="grid two-col">
        <BaseForm title="Account Ownership" description={accountAllocationWarning || 'Allocation should total 100%'} error={error}>
          <AsyncSelect label="Account" value={accountOwnershipForm.account ? String(accountOwnershipForm.account) : ''} onChange={(v) => setAccountOwnershipForm((p) => ({ ...p, account: Number(v) }))} options={accountOptions} />
          <AsyncSelect label="Member" value={accountOwnershipForm.member ? String(accountOwnershipForm.member) : ''} onChange={(v) => setAccountOwnershipForm((p) => ({ ...p, member: Number(v) }))} options={memberOptions} />
          <PercentageInput label="Allocation %" value={accountOwnershipForm.allocation_percent} onChange={(v) => setAccountOwnershipForm((p) => ({ ...p, allocation_percent: v }))} />
          <FormActions onSubmit={saveAccountOwnership} onReset={() => { setAccountOwnershipEditId(0); setAccountOwnershipForm({ account: 0, member: 0, allocation_percent: '100.00' }) }} />
          <ul className="simple-list">
            {accountOwnerships.map((x) => (
              <li key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button className="list-link" onClick={() => { setAccountOwnershipEditId(x.id); setAccountOwnershipForm({ ...x }) }}>
                  Account #{x.account} - Member #{x.member}: {x.allocation_percent}%
                </button>
                <DeleteButton disabled={!canDelete('account_ownership')} onDelete={async () => { await portfolioApi.deleteAccountOwnership(x.id); await loadData() }} />
              </li>
            ))}
          </ul>
        </BaseForm>

        <BaseForm title="Instrument Ownership" description={instrumentAllocationWarning || 'Allocation should total 100%'} error={error}>
          <AsyncSelect label="Instrument" value={instrumentOwnershipForm.instrument ? String(instrumentOwnershipForm.instrument) : ''} onChange={(v) => setInstrumentOwnershipForm((p) => ({ ...p, instrument: Number(v) }))} options={instrumentOptions} />
          <AsyncSelect label="Member" value={instrumentOwnershipForm.member ? String(instrumentOwnershipForm.member) : ''} onChange={(v) => setInstrumentOwnershipForm((p) => ({ ...p, member: Number(v) }))} options={memberOptions} />
          <PercentageInput label="Allocation %" value={instrumentOwnershipForm.allocation_percent} onChange={(v) => setInstrumentOwnershipForm((p) => ({ ...p, allocation_percent: v }))} />
          <FormActions onSubmit={saveInstrumentOwnership} onReset={() => { setInstrumentOwnershipEditId(0); setInstrumentOwnershipForm({ instrument: 0, member: 0, allocation_percent: '100.00' }) }} />
          <ul className="simple-list">
            {instrumentOwnerships.map((x) => (
              <li key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button className="list-link" onClick={() => { setInstrumentOwnershipEditId(x.id); setInstrumentOwnershipForm({ ...x }) }}>
                  Instrument #{x.instrument} - Member #{x.member}: {x.allocation_percent}%
                </button>
                <DeleteButton disabled={!canDelete('instrument_ownership')} onDelete={async () => { await portfolioApi.deleteInstrumentOwnership(x.id); await loadData() }} />
              </li>
            ))}
          </ul>
        </BaseForm>
      </section>
    </>
  )
}
