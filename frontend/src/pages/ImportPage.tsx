import { useState } from 'react'
import { ImportWizard } from './ImportWizard'
import { GrowwImportWizard } from '../components/imports/GrowwImportWizard'
import { FDAdviceImportWizard } from '../components/imports/FDAdviceImportWizard'
import { UpstoxConnect } from '../components/integrations/UpstoxConnect'
import type { OptionItem } from '../types/domain'

type Tab = 'import' | 'groww' | 'upstox' | 'fd'

type Props = {
  householdId: number
  memberOptions: OptionItem[]
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
}

export function ImportPage({ householdId, memberOptions, accountOptions, instrumentOptions }: Props) {
  const [tab, setTab] = useState<Tab>('import')

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'}`

  return (
    <section className="grid single-col">
      <div className="mb-4 flex flex-wrap gap-2">
        <button className={tabCls('import')} onClick={() => setTab('import')}>Import Data</button>
        <button className={tabCls('groww')} onClick={() => setTab('groww')}>Portfolio Import</button>
        <button className={tabCls('upstox')} onClick={() => setTab('upstox')}>Upstox</button>
        <button className={tabCls('fd')} onClick={() => setTab('fd')}>FD Import</button>
      </div>

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
          <UpstoxConnect memberOptions={memberOptions} />
        </article>
      )}

      {tab === 'fd' && (
        <article className="panel">
          <h2>FD / RD Import</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Import Fixed Deposit advice letters or Recurring Deposit statements of account (.pdf).
            Password-protected files are supported — SBI e-TDR/e-STDR and RD statements are fully
            supported; other banks are parsed on a best-effort basis and reviewable before import.
          </p>
          <FDAdviceImportWizard householdId={householdId} />
        </article>
      )}
    </section>
  )
}
