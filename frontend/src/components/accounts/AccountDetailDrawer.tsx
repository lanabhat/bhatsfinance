import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, CreditCard, Pencil, RefreshCw } from 'lucide-react'
import { accountApi } from '../../api/accountApi'
import { expenseApi } from '../../api/expenseApi'
import { ledgerApi } from '../../api/ledgerApi'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { normalizeApiError } from '../../hooks/errorUtils'
import { isLiability } from '../../lib/accounts'
import { ACCOUNT_TYPE_LABELS, TX_TYPE_LABELS } from '../../lib/labels'
import { Amount } from '../ui/Amount'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { DateText } from '../ui/DateText'
import { DetailDrawer } from '../ui/DetailDrawer'
import { EmptyState, ErrorState } from '../ui/EmptyState'
import { MemberAvatar } from '../ui/MemberAvatar'
import { ProgressBar } from '../ui/ProgressBar'
import { SectionHeader } from '../ui/SectionHeader'
import { Skeleton } from '../ui/Skeleton'
import type { Account, AccountBalance, ExpenseCategory, Transaction } from '../../types/domain'

const RECENT_TX_LIMIT = 15

type Props = {
  open: boolean
  onClose: () => void
  account: Account
  householdId: number
  owner: string
  /** Balance as on the dashboard (credit cards negative = outstanding). */
  balance: number | null
  onEdit: () => void
  onUpdateBalance: () => void
  onRecordSpend: () => void
  onRecordPayment: () => void
}

/** One account: header (name, owner, balance) → facts → recent activity → actions. */
export function AccountDetailDrawer(p: Props) {
  const { canWrite } = useAuth()
  const { members } = useApp()
  const { account } = p
  const [bal, setBal] = useState<AccountBalance | null>(null)
  const [txs, setTxs] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [reload, setReload] = useState(0)
  // Loading/error belong to one request (account + retry count); derived, not reset in the effect.
  const requestKey = `${account.id}:${reload}`
  const [settled, setSettled] = useState<{ key: string; error: string } | null>(null)
  const loading = settled?.key !== requestKey
  const error = loading ? '' : settled.error
  const isCC = account.account_type === 'credit_card'

  useEffect(() => {
    if (!p.open) return
    let active = true
    Promise.all([
      accountApi.getBalance(account.id),
      ledgerApi.listTransactionsForAccount(p.householdId, account.id),
      expenseApi.listCategories(p.householdId),
    ])
      .then(([b, t, cats]) => {
        if (!active) return
        setBal(b)
        setTxs([...t].sort((x, y) => y.tx_date.localeCompare(x.tx_date)))
        setCategories(cats)
        setSettled({ key: requestKey, error: '' })
      })
      .catch((e) => { if (active) setSettled({ key: requestKey, error: normalizeApiError(e) }) })
    return () => { active = false }
  }, [p.open, account.id, p.householdId, requestKey])

  const recent = useMemo(() => txs.slice(0, RECENT_TX_LIMIT), [txs])
  const memberName = (id: number | null) => (id ? members.find((m) => m.id === id)?.label ?? null : null)

  const outstanding = Math.max(bal?.outstanding ?? 0, 0)
  const limit = bal?.credit_limit ?? 0

  return (
    <DetailDrawer
      open={p.open}
      onClose={p.onClose}
      title={account.name}
      subtitle={<><MemberAvatar name={p.owner} /><span>{ACCOUNT_TYPE_LABELS[account.account_type] ?? account.account_type}{account.institution_name ? ` · ${account.institution_name}` : ''}</span></>}
      amount={p.balance !== null ? <Amount value={p.balance} tone={p.balance < 0 ? 'debit' : 'default'} /> : undefined}
      amountCaption={isCC ? 'Outstanding on the card' : 'Current balance'}
      badges={(
        <>
          {isLiability(account.account_type) && <Badge tone="danger">Liability</Badge>}
          {!account.is_active && <Badge>Inactive</Badge>}
        </>
      )}
      facts={[
        { label: 'Type', value: ACCOUNT_TYPE_LABELS[account.account_type] ?? account.account_type },
        { label: 'Institution', value: account.institution_name || '—' },
        ...(!isCC ? [{ label: 'Opening balance', value: <Amount value={account.opening_balance} /> }] : []),
        ...(isCC && limit > 0 ? [
          { label: 'Available', value: bal?.available != null ? <Amount value={bal.available} /> : '—' },
          { label: 'Credit limit', value: <Amount value={limit} /> },
          { label: 'Utilisation', wide: true, value: <ProgressBar value={outstanding} max={limit} color="auto" sublabel={`${((outstanding / limit) * 100).toFixed(0)}% used`} /> },
        ] : []),
        ...(isCC && account.statement_due_day ? [{ label: 'Payment due', value: `Day ${account.statement_due_day} of each month` }] : []),
        ...(account.sms_identifiers ? [{ label: 'SMS identifiers', value: account.sms_identifiers }] : []),
      ]}
      actions={canWrite ? (
        <>
          <Button variant="secondary" icon={<Pencil />} onClick={p.onEdit}>Edit</Button>
          {isCC && <Button variant="secondary" icon={<CreditCard />} onClick={p.onRecordSpend}>Record spend</Button>}
          {isCC && <Button variant="secondary" icon={<ArrowDownToLine />} onClick={p.onRecordPayment}>Pay bill</Button>}
          <Button variant="secondary" icon={<RefreshCw />} onClick={p.onUpdateBalance}>Update balance</Button>
        </>
      ) : undefined}
    >
      <section className="grid gap-2" aria-label="Recent activity">
        <SectionHeader title="Recent activity" as="h3" subtitle={txs.length > RECENT_TX_LIMIT ? `Latest ${RECENT_TX_LIMIT} of ${txs.length}` : undefined} />
        {loading ? <Skeleton variant="table" rows={4} /> : error ? <ErrorState message={error} onRetry={() => setReload((r) => r + 1)} /> : recent.length === 0 ? (
          <EmptyState title="No transactions yet" />
        ) : (
          <ul className="m-0 list-none divide-y divide-line p-0">
            {recent.map((tx) => {
              const cat = categories.find((c) => c.key === tx.spend_category)
              // Own description first, then an imported reference, the category, the bare type.
              const primary = tx.description || tx.external_reference || cat?.label || TX_TYPE_LABELS[tx.transaction_type] || tx.transaction_type
              const meta = [cat?.label !== primary ? cat?.label : null, memberName(tx.member)].filter(Boolean).join(' · ')
              const out = tx.direction === 'outflow'
              return (
                <li key={tx.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{primary}</p>
                    <p className="truncate text-xs text-ink-muted"><DateText value={tx.tx_date} format="short" />{meta ? ` · ${meta}` : ''}</p>
                  </div>
                  <Amount value={out ? -parseFloat(tx.amount) : parseFloat(tx.amount)} signed tone={out ? 'debit' : 'credit'} className="text-sm font-medium" />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </DetailDrawer>
  )
}
