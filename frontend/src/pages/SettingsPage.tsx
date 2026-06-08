import { useState } from 'react'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import { ImportWizard } from './ImportWizard'
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

type Tab = 'delete' | 'import'

type Props = {
  deleteConfig: Record<DeleteEntity, boolean>
  toggleDelete: (e: DeleteEntity) => void
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
}

export function SettingsPage({ deleteConfig, toggleDelete, householdId, memberOptions, accountOptions, instrumentOptions }: Props) {
  const [tab, setTab] = useState<Tab>('delete')

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`

  return (
    <section className="grid single-col">
      <div className="mb-4 flex gap-2">
        <button className={tabCls('delete')} onClick={() => setTab('delete')}>Delete Permissions</button>
        <button className={tabCls('import')} onClick={() => setTab('import')}>Import Data</button>
      </div>

      {tab === 'import' && (
        <ImportWizard
          householdId={householdId}
          memberOptions={memberOptions}
          accountOptions={accountOptions}
          instrumentOptions={instrumentOptions}
        />
      )}

      {tab === 'delete' && <article className="panel">
        <h2>Delete Permissions</h2>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1rem' }}>
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
