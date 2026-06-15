import { useEffect, useState } from 'react'
import { accountApi } from '../../api/accountApi'
import { useMaskedFmt } from '../common/Money'
import type { Account, AccountBalance } from '../../types/domain'

type Props = {
  account: Account
  onClick?: () => void
}

const TYPE_COLOR: Record<string, { bg: string; border: string; icon: string }> = {
  bank:        { bg: 'bg-blue-50',   border: 'border-l-blue-400',   icon: '🏦' },
  broker:      { bg: 'bg-violet-50', border: 'border-l-violet-400', icon: '📈' },
  pf:          { bg: 'bg-green-50',  border: 'border-l-green-500',  icon: '🛡' },
  credit_card: { bg: 'bg-rose-50',   border: 'border-l-rose-400',   icon: '💳' },
  loan:        { bg: 'bg-orange-50', border: 'border-l-orange-400', icon: '🏛' },
  cash:        { bg: 'bg-yellow-50', border: 'border-l-yellow-400', icon: '💵' },
  insurance:   { bg: 'bg-sky-50',    border: 'border-l-sky-400',    icon: '☂️' },
  other:       { bg: 'bg-[var(--surface-2)]',  border: 'border-l-slate-300',  icon: '💼' },
}


export function AccountCard({ account, onClick }: Props) {
  const fmtINR = useMaskedFmt()
  const [balance, setBalance] = useState<AccountBalance | null>(null)
  const style = TYPE_COLOR[account.account_type] ?? TYPE_COLOR.other

  useEffect(() => {
    accountApi.getBalance(account.id).then(setBalance).catch(() => null)
  }, [account.id])

  const isCC = account.account_type === 'credit_card'
  const displayValue = balance
    ? isCC
      ? fmtINR(-(balance.outstanding ?? 0))
      : fmtINR(balance.current_balance)
    : '—'

  return (
    <div
      className={`section-card ${style.bg} ${style.border} ${onClick ? 'cursor-pointer active:opacity-80' : ''}`}
      onClick={onClick}
    >
      <span className="icon-badge bg-white/60 text-lg">{style.icon}</span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">{account.name}</p>
          <p className={`shrink-0 text-sm font-bold ${isCC ? 'text-rose-600' : 'text-[var(--text)]'}`}>
            {displayValue}
          </p>
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
          {account.institution_name || account.account_type.replace('_', ' ')}
          {isCC && balance?.credit_limit ? ` · Limit ${fmtINR(balance.credit_limit)}` : ''}
          {isCC && (balance?.outstanding ?? 0) > 0 ? ' · due' : ''}
        </p>
        {isCC && balance?.credit_limit && (balance.credit_limit > 0) && (
          <div className="fill-bar mt-1.5">
            <div
              className="fill-bar-inner bg-rose-400"
              style={{ width: `${Math.min(((balance.outstanding ?? 0) / balance.credit_limit) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
