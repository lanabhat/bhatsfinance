import { useEffect, useState } from 'react'
import { portfolioApi } from '../api/portfolioApi'
import { useApp } from '../context/AppContext'
import type { Account, AccountOwnership, Instrument, InstrumentOwnership } from '../types/domain'

// ── Instrument ownership mapper ───────────────────────────────────────────────

function InstrumentOwnershipRow({
  instrument,
  ownerships,
  memberOptions,
  onSaved,
}: {
  instrument: Instrument
  ownerships: InstrumentOwnership[]
  memberOptions: { id: number; label: string }[]
  onSaved: () => void
}) {
  const existing = ownerships.filter((o) => o.instrument === instrument.id)
  const currentMemberId = existing[0]?.member ?? null
  const [memberId, setMemberId] = useState<string>(String(currentMemberId ?? ''))
  const [saving, setSaving] = useState(false)

  const isDirty = String(currentMemberId ?? '') !== memberId

  const save = async () => {
    setSaving(true)
    try {
      if (memberId === '') {
        // remove any existing ownerships for this instrument
        await Promise.all(existing.map((o) => portfolioApi.deleteInstrumentOwnership(o.id)))
      } else {
        const mid = Number(memberId)
        if (existing.length === 0) {
          await portfolioApi.createInstrumentOwnership({ instrument: instrument.id, member: mid, allocation_percent: '100.00' })
        } else {
          await Promise.all(existing.map((o) => portfolioApi.updateInstrumentOwnership(o.id, { member: mid })))
        }
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{instrument.name}</p>
        <p className="text-xs text-slate-400 capitalize">{instrument.instrument_type.replace(/_/g, ' ')}</p>
      </div>
      <select
        value={memberId}
        onChange={(e) => setMemberId(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">— Unassigned —</option>
        {memberOptions.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      {isDirty && (
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '…' : 'Save'}
        </button>
      )}
    </div>
  )
}

// ── Account ownership mapper ──────────────────────────────────────────────────

function AccountOwnershipRow({
  account,
  ownerships,
  memberOptions,
  onSaved,
}: {
  account: Account
  ownerships: AccountOwnership[]
  memberOptions: { id: number; label: string }[]
  onSaved: () => void
}) {
  const existing = ownerships.filter((o) => o.account === account.id)
  const currentMemberId = existing[0]?.member ?? null
  const [memberId, setMemberId] = useState<string>(String(currentMemberId ?? ''))
  const [saving, setSaving] = useState(false)

  const isDirty = String(currentMemberId ?? '') !== memberId

  const save = async () => {
    setSaving(true)
    try {
      if (memberId === '') {
        await Promise.all(existing.map((o) => portfolioApi.deleteAccountOwnership(o.id)))
      } else {
        const mid = Number(memberId)
        if (existing.length === 0) {
          await portfolioApi.createAccountOwnership({ account: account.id, member: mid, allocation_percent: '100.00' })
        } else {
          await Promise.all(existing.map((o) => portfolioApi.updateAccountOwnership(o.id, { member: mid })))
        }
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{account.name}</p>
        <p className="text-xs text-slate-400 capitalize">{account.account_type.replace(/_/g, ' ')}</p>
      </div>
      <select
        value={memberId}
        onChange={(e) => setMemberId(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">— Unassigned —</option>
        {memberOptions.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      {isDirty && (
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '…' : 'Save'}
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Section = 'instruments' | 'accounts'

export function MaintenancePage({ section: initSection }: { section?: Section } = {}) {
  const { householdId, members } = useApp()

  const [section, setSection] = useState<Section>(initSection ?? 'instruments')
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [instrumentOwnerships, setInstrumentOwnerships] = useState<InstrumentOwnership[]>([])
  const [accountOwnerships, setAccountOwnerships] = useState<AccountOwnership[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [insts, accts, io, ao] = await Promise.all([
        portfolioApi.listInstruments(householdId),
        portfolioApi.listAccounts(householdId),
        portfolioApi.listInstrumentOwnerships(),
        portfolioApi.listAccountOwnerships(),
      ])
      setInstruments(insts)
      setAccounts(accts)
      setInstrumentOwnerships(io)
      setAccountOwnerships(ao)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [householdId])

  const pageTitle = initSection === 'instruments' ? 'Manage Instruments'
    : initSection === 'accounts' ? 'Manage Accounts'
    : 'Maintenance'

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{pageTitle}</h1>
        <p className="mt-0.5 text-xs text-slate-500">Assign ownership to family members — drives per-member net worth</p>
      </div>

      {/* Ownership Mapping card */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Ownership Mapping</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Assign each instrument or account to the family member who owns it. This drives per-member net worth on the home screen.
          </p>
        </div>

        {/* sub-tab switcher — hidden when accessed as a dedicated page */}
        {!initSection && (
          <div className="flex gap-1 border-b border-slate-100 px-4 pt-3 pb-0">
            {(['instruments', 'accounts'] as Section[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={`px-3 pb-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                  section === s
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="px-4 py-1">
          {loading ? (
            <p className="py-6 text-center text-xs text-slate-400">Loading…</p>
          ) : section === 'instruments' ? (
            instruments.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No instruments yet.</p>
            ) : (
              instruments.map((inst) => (
                <InstrumentOwnershipRow
                  key={inst.id}
                  instrument={inst}
                  ownerships={instrumentOwnerships}
                  memberOptions={members}
                  onSaved={load}
                />
              ))
            )
          ) : (
            accounts.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No accounts yet.</p>
            ) : (
              accounts.map((acct) => (
                <AccountOwnershipRow
                  key={acct.id}
                  account={acct}
                  ownerships={accountOwnerships}
                  memberOptions={members}
                  onSaved={load}
                />
              ))
            )
          )}
        </div>
      </div>
    </div>
  )
}
