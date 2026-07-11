import { useState } from 'react'
import { ImportWizard } from './ImportWizard'
import { GrowwImportWizard } from '../components/imports/GrowwImportWizard'
import { FDAdviceImportWizard } from '../components/imports/FDAdviceImportWizard'
import { NpsImportWizard } from '../components/imports/NpsImportWizard'
import { EpfPassbookImportWizard } from '../components/imports/EpfPassbookImportWizard'
import { PpfStatementImportWizard } from '../components/imports/PpfStatementImportWizard'
import { UpstoxConnect } from '../components/integrations/UpstoxConnect'
import type { OptionItem } from '../types/domain'

type Tab = 'import' | 'groww' | 'upstox' | 'fd' | 'nps' | 'epf' | 'ppf'

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
        <button className={tabCls('nps')} onClick={() => setTab('nps')}>NPS Import</button>
        <button className={tabCls('epf')} onClick={() => setTab('epf')}>EPF Import</button>
        <button className={tabCls('ppf')} onClick={() => setTab('ppf')}>PPF Import</button>
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

      {tab === 'nps' && (
        <article className="panel">
          <h2>NPS Import</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Import NPS transaction statement CSVs (Tier I and/or Tier II) exported from the CRA/CAMS
            portal. Contributions and quarterly fee deductions are backfilled against your NPS holding.
          </p>
          <NpsImportWizard householdId={householdId} />
        </article>
      )}

      {tab === 'epf' && (
        <article className="panel">
          <h2>EPF Import</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Import EPFO Member Passbook PDFs (one per financial year). Monthly Employee/Employer/
            Pension contributions are backfilled against your EPF holding, and interest updates are
            reflected in the closing valuation.
          </p>
          <EpfPassbookImportWizard householdId={householdId} />
        </article>
      )}

      {tab === 'ppf' && (
        <article className="panel">
          <h2>PPF Import</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Import PPF account statement .xls exports from your bank's net banking. Deposits are
            backfilled against your PPF holding; if your bank can't provide statements covering the
            account's full history, you can estimate the pre-statement principal on the review step.
          </p>
          <PpfStatementImportWizard householdId={householdId} />
        </article>
      )}
    </section>
  )
}
