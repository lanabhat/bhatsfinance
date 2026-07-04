import { useState } from 'react'
import { GmailSyncPage } from './GmailSyncPage'
import { GmailRulesPage } from './GmailRulesPage'
import { GmailStagingPage } from './GmailStagingPage'
import type { OptionItem } from '../types/domain'

type Tab = 'sync' | 'rules' | 'staging'

type Props = {
  householdId: number
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  memberOptions: OptionItem[]
}

export function GmailPage({ householdId, accountOptions, instrumentOptions, memberOptions }: Props) {
  const [tab, setTab] = useState<Tab>('sync')

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'}`

  return (
    <section className="grid single-col">
      <div className="mb-4 flex flex-wrap gap-2">
        <button className={tabCls('sync')} onClick={() => setTab('sync')}>Sync</button>
        <button className={tabCls('rules')} onClick={() => setTab('rules')}>Rules</button>
        <button className={tabCls('staging')} onClick={() => setTab('staging')}>Transactions</button>
      </div>

      {tab === 'sync' && (
        <GmailSyncPage
          householdId={householdId}
          accountOptions={accountOptions}
          instrumentOptions={instrumentOptions}
          memberOptions={memberOptions}
        />
      )}

      {tab === 'rules' && (
        <GmailRulesPage
          householdId={householdId}
          accountOptions={accountOptions}
          memberOptions={memberOptions}
        />
      )}

      {tab === 'staging' && (
        <GmailStagingPage accountOptions={accountOptions} />
      )}
    </section>
  )
}
