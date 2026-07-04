import { useState } from 'react'
import { SmsMessagesPage } from './SmsMessagesPage'
import { SmsRulesPage } from './SmsRulesPage'
import { SmsDevicesPage } from './SmsDevicesPage'
import { SmsTestPage } from './SmsTestPage'
import type { DeleteEntity } from '../hooks/useDeleteConfig'
import type { InstrumentOption, OptionItem } from '../types/domain'

type Tab = 'messages' | 'rules' | 'devices' | 'test'

type Props = {
  householdId: number
  canDelete: (e: DeleteEntity) => boolean
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
  instrumentOptions: InstrumentOption[]
}

export function SmsPage({ householdId, canDelete, accountOptions, memberOptions, instrumentOptions }: Props) {
  const [tab, setTab] = useState<Tab>('messages')

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]'}`

  return (
    <section className="grid single-col">
      <div className="mb-4 flex flex-wrap gap-2">
        <button className={tabCls('messages')} onClick={() => setTab('messages')}>Messages</button>
        <button className={tabCls('rules')} onClick={() => setTab('rules')}>Rules</button>
        <button className={tabCls('devices')} onClick={() => setTab('devices')}>Devices</button>
        <button className={tabCls('test')} onClick={() => setTab('test')}>Test Sender</button>
      </div>

      {tab === 'messages' && (
        <SmsMessagesPage
          householdId={householdId}
          canDelete={canDelete}
          accountOptions={accountOptions}
          memberOptions={memberOptions}
          instrumentOptions={instrumentOptions}
        />
      )}

      {tab === 'rules' && (
        <SmsRulesPage
          householdId={householdId}
          accountOptions={accountOptions}
          memberOptions={memberOptions}
        />
      )}

      {tab === 'devices' && (
        <SmsDevicesPage householdId={householdId} />
      )}

      {tab === 'test' && (
        <SmsTestPage />
      )}
    </section>
  )
}
