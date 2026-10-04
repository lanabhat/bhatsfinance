import { useState } from 'react'
import type { Account } from '../../types/domain'

type Group = 'bank' | 'wallet' | 'card' | 'broker'

const GROUPS: { key: Group; label: string }[] = [
  { key: 'bank', label: 'Savings & bank' },
  { key: 'wallet', label: 'Wallets & cash' },
  { key: 'card', label: 'Credit cards' },
  { key: 'broker', label: 'Broker' },
]

const ICON: Record<Group, string> = { bank: '🏦', wallet: '👛', card: '💳', broker: '📈' }

// Money never moves through these by SMS — pension/provident accounts, loans, insurance.
const EXCLUDED_NAME = /\b(nps|epf|ppf|pension|provident)\b/i

function accountGroup(a: Account): Group | null {
  if (['pf', 'loan', 'insurance'].includes(a.account_type)) return null
  if (EXCLUDED_NAME.test(`${a.name} ${a.institution_name}`)) return null
  if (a.account_type === 'credit_card') return 'card'
  if (a.account_type === 'broker') return 'broker'
  if (a.account_type === 'bank') return 'bank'
  return 'wallet'
}

function AccountCard({ account, selected, detected, onClick }: {
  account: Account
  selected: boolean
  detected?: boolean
  onClick?: () => void
}) {
  const group = accountGroup(account) ?? 'wallet'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
        selected
          ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500 dark:border-primary-400 dark:bg-primary-900/30 dark:ring-primary-400'
          : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <span className="text-base leading-none">{ICON[group]}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[var(--text)]">{account.name}</span>
        <span className="block truncate text-[10px] text-[var(--text-muted)]">
          {account.institution_name || account.account_type.replace('_', ' ')}
          {account.sms_identifiers ? ` · •••${account.sms_identifiers.split(',')[0].trim()}` : ''}
        </span>
      </span>
      {detected && (
        <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          Detected
        </span>
      )}
    </button>
  )
}

type Props = {
  accounts: Account[]
  selectedId: number | null
  detectedId: number | null
  /** Trailing digits the SMS mentions, if any. */
  hint?: string
  showBroker: boolean
  onSelect: (id: number) => void
}

/** The detected account up front; every other usable account in a collapsed card,
 *  grouped by kind, for when the detection is wrong or missing. */
export function SmsAccountPicker({ accounts, selectedId, detectedId, hint, showBroker, onSelect }: Props) {
  const usable = accounts.filter((a) => a.is_active && accountGroup(a) && (showBroker || accountGroup(a) !== 'broker'))
  const detected = accounts.find((a) => a.id === detectedId) ?? null
  const selected = accounts.find((a) => a.id === selectedId) ?? null
  const [open, setOpen] = useState(!detected)
  const others = usable.filter((a) => a.id !== detected?.id)
  const changed = detected !== null && selected !== null && selected.id !== detected.id

  return (
    <div className="grid gap-2">
      {detected ? (
        <AccountCard account={detected} selected={selectedId === detected.id} detected onClick={() => onSelect(detected.id)} />
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/15 dark:text-amber-300">
          Couldn't tell the account from this SMS{hint ? ` (it mentions •••${hint})` : ''}. Pick it below
          {hint ? ' and future SMS with these digits will match it automatically' : ''}.
        </p>
      )}
      {changed && (
        <p className="text-[11px] text-[var(--text-muted)]">
          Using <span className="font-medium text-[var(--text-2)]">{selected.name}</span> instead of the detected account.
        </p>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-[var(--text-2)]"
        >
          <span>
            {detected ? 'Not this account? Other accounts' : 'Accounts'}
            <span className="ml-1 text-[var(--text-muted)]">({others.length})</span>
            {!open && selected && selected.id !== detected?.id && (
              <span className="ml-2 text-primary-600 dark:text-primary-300">· {selected.name}</span>
            )}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {open && (
          <div className="grid gap-3 border-t border-[var(--border)] p-3">
            {GROUPS.map(({ key, label }) => {
              const list = others.filter((a) => accountGroup(a) === key)
              if (list.length === 0) return null
              return (
                <div key={key}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((a) => (
                      <AccountCard key={a.id} account={a} selected={selectedId === a.id} onClick={() => onSelect(a.id)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
