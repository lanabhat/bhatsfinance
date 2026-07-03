import { useMemo, useState } from 'react'
import { Money } from '../components/common/Money'
import { Button } from '../components/ui/Button'
import { reportsApi } from '../api/reportsApi'
import type { StatementAccountPreview } from '../api/reportsApi'
import type { OptionItem } from '../types/domain'

type Props = {
  householdId: number
  accountOptions: OptionItem[]
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function computeOpeningBalance(currentBalance: number, txs: StatementAccountPreview['transactions'], excluded: Set<number>): number {
  let inflow = 0
  let outflow = 0
  for (const t of txs) {
    if (excluded.has(t.id)) continue
    const amt = parseFloat(t.amount)
    if (t.direction === 'inflow') inflow += amt
    else outflow += amt
  }
  return currentBalance - inflow + outflow
}

function computeClosingBalance(opening: number, txs: StatementAccountPreview['transactions'], excluded: Set<number>): number {
  let running = opening
  for (const t of txs) {
    if (excluded.has(t.id)) continue
    const amt = parseFloat(t.amount)
    running += t.direction === 'inflow' ? amt : -amt
  }
  return running
}

export function ReportsPage({ householdId, accountOptions }: Props) {
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([])
  const [startDate, setStartDate] = useState(isoDaysAgo(90))
  const [endDate, setEndDate] = useState(isoDaysAgo(0))
  const [preview, setPreview] = useState<StatementAccountPreview[] | null>(null)
  const [excludedByAccount, setExcludedByAccount] = useState<Record<number, Set<number>>>({})
  const [openingOverrides, setOpeningOverrides] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null)
  const [error, setError] = useState('')

  const toggleAccount = (id: number) => {
    setSelectedAccountIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  const loadTransactions = async () => {
    if (selectedAccountIds.length === 0) { setError('Select at least one account.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await reportsApi.previewStatement({
        household_id: householdId,
        account_ids: selectedAccountIds,
        start_date: startDate,
        end_date: endDate,
      })
      setPreview(res.accounts)
      setExcludedByAccount({})
      setOpeningOverrides({})
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }

  const toggleTransaction = (accountId: number, txId: number) => {
    setExcludedByAccount(prev => {
      const current = new Set(prev[accountId] ?? [])
      if (current.has(txId)) current.delete(txId)
      else current.add(txId)
      return { ...prev, [accountId]: current }
    })
  }

  const computed = useMemo(() => {
    if (!preview) return {}
    const map: Record<number, { opening: number; closing: number }> = {}
    for (const acc of preview) {
      const excluded = excludedByAccount[acc.account_id] ?? new Set<number>()
      const currentBalance = parseFloat(acc.current_balance)
      const override = openingOverrides[acc.account_id]
      const opening = override !== undefined && override !== ''
        ? parseFloat(override)
        : computeOpeningBalance(currentBalance, acc.transactions, excluded)
      const closing = computeClosingBalance(opening, acc.transactions, excluded)
      map[acc.account_id] = { opening, closing }
    }
    return map
  }, [preview, excludedByAccount, openingOverrides])

  const handleExport = async (format: 'pdf' | 'xlsx') => {
    if (!preview) return
    setExporting(format)
    setError('')
    try {
      const excluded_transaction_ids: Record<number, number[]> = {}
      for (const acc of preview) {
        excluded_transaction_ids[acc.account_id] = [...(excludedByAccount[acc.account_id] ?? [])]
      }
      const opening_balance_overrides: Record<number, string> = {}
      for (const [accId, val] of Object.entries(openingOverrides)) {
        if (val !== '') opening_balance_overrides[Number(accId)] = val
      }
      await reportsApi.exportStatement({
        household_id: householdId,
        account_ids: selectedAccountIds,
        start_date: startDate,
        end_date: endDate,
        excluded_transaction_ids,
        opening_balance_overrides,
        format,
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-lg font-semibold text-[var(--text)]">Account Statement Report</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Select accounts and a date range to generate a printable statement — opening balance, transactions, and closing balance.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 grid gap-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Accounts</p>
          <div className="flex flex-wrap gap-2">
            {accountOptions.map(a => (
              <label key={a.id} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-sm text-[var(--text)] cursor-pointer">
                <input type="checkbox" checked={selectedAccountIds.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                {a.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            Start Date
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]" />
          </label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            End Date
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]" />
          </label>
          <Button onClick={loadTransactions} loading={loading}>Load Transactions</Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {preview && preview.map(acc => {
        const excluded = excludedByAccount[acc.account_id] ?? new Set<number>()
        const { opening, closing } = computed[acc.account_id] ?? { opening: 0, closing: 0 }
        const isOverridden = openingOverrides[acc.account_id] !== undefined && openingOverrides[acc.account_id] !== ''
        return (
          <div key={acc.account_id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 grid gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                {acc.account_name}{acc.institution_name ? ` (${acc.institution_name})` : ''}
              </h3>
              <span className="text-xs text-[var(--text-muted)]">Current balance: <Money value={acc.current_balance} /></span>
            </div>

            <label className="grid gap-1 text-xs text-[var(--text-muted)] max-w-xs">
              Opening Balance {isOverridden && <span className="text-amber-500">(overridden)</span>}
              <input
                type="number" step="0.01"
                value={openingOverrides[acc.account_id] ?? opening.toFixed(2)}
                onChange={e => setOpeningOverrides(prev => ({ ...prev, [acc.account_id]: e.target.value }))}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]"
              />
            </label>

            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-2)]">
                  <tr>
                    <th className="px-2 py-1.5 text-left"><input type="checkbox"
                      checked={excluded.size === 0}
                      onChange={e => setExcludedByAccount(prev => ({
                        ...prev,
                        [acc.account_id]: e.target.checked ? new Set() : new Set(acc.transactions.map(t => t.id)),
                      }))} /></th>
                    <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Date</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Description</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Direction</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-[var(--text-muted)]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {acc.transactions.length === 0 ? (
                    <tr><td colSpan={5} className="px-2 py-3 text-center text-[var(--text-muted)]">No transactions in this date range.</td></tr>
                  ) : acc.transactions.map(t => (
                    <tr key={t.id} className={`border-t border-[var(--border)] ${excluded.has(t.id) ? 'opacity-40' : ''}`}>
                      <td className="px-2 py-1"><input type="checkbox" checked={!excluded.has(t.id)} onChange={() => toggleTransaction(acc.account_id, t.id)} /></td>
                      <td className="px-2 py-1">{t.tx_date}</td>
                      <td className="px-2 py-1">{t.description}</td>
                      <td className="px-2 py-1 capitalize">{t.direction}</td>
                      <td className="px-2 py-1 text-right"><Money value={t.amount} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">Closing balance</span>
              <span className="font-semibold text-[var(--text)]"><Money value={closing} /></span>
            </div>
          </div>
        )
      })}

      {preview && preview.length > 0 && (
        <div className="flex gap-2">
          <Button onClick={() => handleExport('pdf')} loading={exporting === 'pdf'}>Export PDF</Button>
          <Button variant="secondary" onClick={() => handleExport('xlsx')} loading={exporting === 'xlsx'}>Export Excel</Button>
        </div>
      )}
    </div>
  )
}
