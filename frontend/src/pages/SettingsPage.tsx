import { useState } from 'react'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { ImportWizard } from './ImportWizard'
import { GrowwImportWizard } from '../components/imports/GrowwImportWizard'
import { UpstoxConnect } from '../components/integrations/UpstoxConnect'
import { useTerms } from '../context/TermsContext'
import type { OptionItem } from '../types/domain'

const ENTITY_LABELS: Array<{ key: DeleteEntity; label: string; warning?: string }> = [
  { key: 'transaction', label: 'Transactions', warning: 'Deleting transactions affects net worth and XIRR calculations' },
  { key: 'valuation', label: 'Valuation Snapshots' },
  { key: 'fd_details', label: 'FD Details' },
  { key: 'instrument', label: 'Instruments', warning: 'Cascades to transactions and valuations' },
  { key: 'account', label: 'Accounts', warning: 'Cascades to transactions' },
  { key: 'instrument_ownership', label: 'Instrument Ownerships' },
  { key: 'account_ownership', label: 'Account Ownerships' },
  { key: 'member', label: 'Members' },
  { key: 'sip_mandate', label: 'SIP Mandates' },
  { key: 'tax_record', label: 'Tax Records' },
  { key: 'tax_projection', label: 'Tax Projections' },
]

type Tab = 'display' | 'delete' | 'import' | 'groww' | 'upstox'

type Props = {
  deleteConfig: Record<DeleteEntity, boolean>
  toggleDelete: (e: DeleteEntity) => void
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
}

export function SettingsPage({ deleteConfig, toggleDelete, householdId, memberOptions, accountOptions, instrumentOptions }: Props) {
  const [tab, setTab] = useState<Tab>('display')
  const { mode, setMode } = useTerms()

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'}`

  return (
    <section className="grid single-col">
      <div className="mb-4 flex flex-wrap gap-2">
        <button className={tabCls('display')} onClick={() => setTab('display')}>Display</button>
        <button className={tabCls('delete')} onClick={() => setTab('delete')}>Delete Permissions</button>
        <button className={tabCls('import')} onClick={() => setTab('import')}>Import Data</button>
        <button className={tabCls('groww')} onClick={() => setTab('groww')}>Portfolio Import</button>
        <button className={tabCls('upstox')} onClick={() => setTab('upstox')}>Upstox</button>
      </div>

      {tab === 'display' && (
        <article className="panel">
          <h2>Display Mode</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Choose how menu labels and terminology appear throughout the app.
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            {([
              { value: 'simple', emoji: '🌱', label: 'Simple', desc: 'Easy language, beginner-friendly' },
              { value: 'advanced', emoji: '📊', label: 'Advanced', desc: 'Financial terms, detailed analytics' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-center transition-all ${
                  mode === opt.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-primary-300 hover:bg-[var(--surface-2)]'
                }`}
              >
                <span className="text-3xl">{opt.emoji}</span>
                <span className="font-semibold">{opt.label}</span>
                <span className="text-xs text-[var(--text-muted)]">{opt.desc}</span>
              </button>
            ))}
          </div>
        </article>
      )}

      {tab === 'import' && (
        <ImportWizard
          householdId={householdId}
          memberOptions={memberOptions}
          accountOptions={accountOptions}
          instrumentOptions={instrumentOptions}
        />
      )}

      {tab === 'groww' && (
        <article className="panel">
          <h2>Portfolio Import</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Import holdings from Groww or Upstox Excel exports. Both formats are auto-detected.
            Groww: Portfolio → top-right menu → Download. Upstox: Reports → Holdings.
            Upload files for multiple family members at once.
          </p>
          <GrowwImportWizard householdId={householdId} />
        </article>
      )}

      {tab === 'upstox' && (
        <article className="panel">
          <h2>Upstox Integration</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Connect a family member's Upstox account to automatically sync their equity holdings.
            Requires a free developer app at <strong>developer.upstox.com</strong> — credentials go in <code>.env</code>.
          </p>
          <UpstoxConnect householdId={householdId} memberOptions={memberOptions} />
        </article>
      )}

      {tab === 'delete' && <article className="panel">
        <h2>Delete Permissions</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Control which entity types show delete buttons. Disable to prevent accidental deletions.
        </p>
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Allow Delete</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {ENTITY_LABELS.map(({ key, label, warning }) => (
              <tr key={key}>
                <td>{label}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={deleteConfig[key]}
                    onChange={() => toggleDelete(key)}
                  />
                </td>
                <td style={{ color: '#f59e0b', fontSize: '0.85rem' }}>{warning || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>}

    </section>
  )
}
