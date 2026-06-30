import { useEffect, useMemo, useState } from 'react'
import { Money, useMaskedFmt } from '../common/Money'
import { ledgerApi } from '../../api/ledgerApi'
import { accountApi } from '../../api/accountApi'
import { useAuth } from '../../context/AuthContext'
import type { Account, AccountBalance, Transaction } from '../../types/domain'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

type Props = {
  account: Account
  householdId: number
  onEdit: () => void
  onRecordSpend: () => void
  onRecordPayment: () => void
  onUpdateBalance: () => void
}

const RECENT_TX_LIMIT = 8

export function AccountExpandedDetail({ account, householdId, onEdit, onRecordSpend, onRecordPayment, onUpdateBalance }: Props) {
  const fmtINR = useMaskedFmt()
  const { canWrite } = useAuth()
  const [balance, setBalance] = useState<AccountBalance | null>(null)
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const isCreditCard = account.account_type === 'credit_card'

  useEffect(() => {
    let active = true
    Promise.all([accountApi.getBalance(account.id), ledgerApi.listTransactionsForAccount(householdId, account.id)])
      .then(([b, t]) => {
        if (!active) return
        setBalance(b)
        setTxs([...t].sort((a, b2) => b2.tx_date.localeCompare(a.tx_date)))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [account.id, householdId])

  const recentTxs = useMemo(() => txs.slice(0, RECENT_TX_LIMIT), [txs])

  const outstandingRaw = balance?.outstanding ?? 0
  const outstanding = outstandingRaw > 0 ? outstandingRaw : 0
  const limit = balance?.credit_limit ?? 0
  const available = balance?.available ?? null
  const utilPct = limit > 0 ? Math.min((outstanding / limit) * 100, 100) : 0

  if (loading) {
    return <p className="py-3 text-center text-xs text-[var(--text-muted)]">Loading…</p>
  }

  if (!isCreditCard) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Type</dt>
            <dd className="capitalize text-[var(--text)]">{account.account_type.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Institution</dt>
            <dd className="text-[var(--text)]">{account.institution_name || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Opening Balance</dt>
            <dd><Money value={account.opening_balance} className="text-[var(--text)]" /></dd>
          </div>
        </dl>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onUpdateBalance} disabled={!canWrite}
            className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            Update Balance
          </button>
          <button type="button" onClick={onEdit} disabled={!canWrite}
            className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
            Edit
          </button>
        </div>

        <h3 className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Recent Transactions</h3>
        {recentTxs.length === 0 ? (
          <p className="py-3 text-center text-xs text-[var(--text-muted)]">No transactions yet</p>
        ) : (
          <div className="grid gap-1">
            {recentTxs.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-[var(--text)]">{tx.external_reference || tx.transaction_type.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{fmtDate(tx.tx_date)}</p>
                </div>
                <p className={`ml-3 shrink-0 text-xs font-semibold ${tx.direction === 'outflow' ? 'text-rose-600' : 'text-primary-600'}`}>
                  <Money value={tx.direction === 'outflow' ? -parseFloat(tx.amount) : parseFloat(tx.amount)} />
                </p>
              </div>
            ))}
            {txs.length > RECENT_TX_LIMIT && (
              <p className="pt-1 text-center text-[10px] text-[var(--text-muted)]">…and {txs.length - RECENT_TX_LIMIT} more</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 rounded-xl bg-rose-50 dark:bg-rose-900/15 p-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-[var(--text-muted)]">Outstanding</p>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400">{outstanding > 0 ? <Money value={-outstanding} /> : '₹0'}</p>
          </div>
          {limit > 0 && (
            <div className="text-right">
              <p className="text-xs text-[var(--text-muted)]">Available</p>
              <p className="text-sm font-bold text-[var(--text-2)]">{available != null ? <Money value={available} /> : '—'}</p>
              <p className="text-xs text-[var(--text-muted)]">of {fmtINR(limit)} limit</p>
            </div>
          )}
        </div>
        {limit > 0 && (
          <div className="fill-bar mt-2.5">
            <div className="fill-bar-inner bg-rose-400" style={{ width: `${utilPct}%` }} />
          </div>
        )}
        {account.statement_due_day && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">Payment due: {account.statement_due_day}th of each month</p>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={onRecordSpend} disabled={!canWrite}
          className="flex-1 rounded-lg bg-rose-500 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50">
          + Record Spend
        </button>
        <button type="button" onClick={onRecordPayment} disabled={!canWrite}
          className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          Pay Bill
        </button>
        <button type="button" onClick={onUpdateBalance} disabled={!canWrite}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
          Update Balance
        </button>
        <button type="button" onClick={onEdit} disabled={!canWrite}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
          Edit
        </button>
      </div>

      {recentTxs.length === 0 ? (
        <p className="py-3 text-center text-xs text-[var(--text-muted)]">No transactions yet</p>
      ) : (
        <div className="grid gap-1">
          {recentTxs.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-[var(--text)]">{tx.external_reference || tx.transaction_type.replace(/_/g, ' ')}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{fmtDate(tx.tx_date)}</p>
              </div>
              <p className={`ml-3 shrink-0 text-xs font-semibold ${tx.direction === 'outflow' ? 'text-rose-600' : 'text-primary-600'}`}>
                <Money value={tx.direction === 'outflow' ? -parseFloat(tx.amount) : parseFloat(tx.amount)} />
              </p>
            </div>
          ))}
          {txs.length > RECENT_TX_LIMIT && (
            <p className="pt-1 text-center text-[10px] text-[var(--text-muted)]">…and {txs.length - RECENT_TX_LIMIT} more</p>
          )}
        </div>
      )}
    </div>
  )
}
