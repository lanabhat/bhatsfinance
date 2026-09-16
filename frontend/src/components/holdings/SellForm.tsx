import { useEffect, useState } from 'react'
import { ledgerApi } from '../../api/ledgerApi'
import { portfolioApi } from '../../api/portfolioApi'
import { useApp } from '../../context/AppContext'
import type { Account } from '../../types/domain'

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

/**
 * Records a sell against an already-known holding (instrument, optionally
 * investment) — unlike BuyForm this never picks/creates an instrument, it's
 * always opened from a specific holding row. Realized gain/loss is computed
 * server-side (average cost basis — see ledger/serializers.py) and shown
 * once the sale is recorded, since that's the whole point: knowing whether
 * you made a profit or a loss on the units you just sold.
 */
export function SellForm({ householdId, instrumentId, investmentId, holdingName, currentQuantity, onSave, onCancel }: {
  householdId: number
  instrumentId: number
  investmentId?: number
  holdingName: string
  /** Units currently held — a positive decimal string, or null if unknown
   * (e.g. FD/RD-style holdings with no quantity concept). Used only for
   * client-side "can't sell more than you own" validation; the server is
   * the source of truth either way. */
  currentQuantity: string | null
  onSave: () => void
  onCancel: () => void
}) {
  const { members } = useApp()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [quantity, setQuantity] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [amount, setAmount] = useState('')
  const [memberId, setMemberId] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [affectsBalance, setAffectsBalance] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedGain, setSavedGain] = useState<string | null>(null)

  useEffect(() => { portfolioApi.listAccounts(householdId).then(setAccounts).catch(() => {}) }, [householdId])

  useEffect(() => {
    if (quantity && pricePerUnit) setAmount((parseFloat(quantity) * parseFloat(pricePerUnit)).toFixed(2))
  }, [quantity, pricePerUnit])

  const maxQuantity = currentQuantity ? parseFloat(currentQuantity) : null

  const save = async () => {
    if (!quantity || parseFloat(quantity) <= 0) { setError('Enter the number of units sold.'); return }
    if (maxQuantity !== null && parseFloat(quantity) > maxQuantity) {
      setError(`You only hold ${currentQuantity} units — enter a smaller quantity.`)
      return
    }
    if (!amount || parseFloat(amount) <= 0) { setError('Enter the sale proceeds (or units + price per unit).'); return }
    setSaving(true); setError('')
    try {
      const tx = await ledgerApi.createTransaction({
        household: householdId,
        member: memberId ? Number(memberId) : null,
        account: accountId ? Number(accountId) : null,
        instrument: instrumentId,
        investment: investmentId ?? null,
        tx_date: date,
        amount,
        quantity,
        price_per_unit: pricePerUnit || null,
        fees: '0.00',
        taxes: '0.00',
        currency: 'INR',
        direction: 'inflow',
        transaction_type: 'sell',
        external_reference: '',
        idempotency_key: `sell-${investmentId ?? instrumentId}-${Date.now()}`,
        metadata: {},
        affects_balance: accountId ? affectsBalance : true,
      })
      if (tx.realized_gain !== null) {
        setSavedGain(tx.realized_gain)
        return
      }
      onSave()
    } catch (e: unknown) {
      setError(e && typeof e === 'object' && 'detail' in e ? String((e as { detail: unknown }).detail) : 'Failed to save.')
    } finally { setSaving(false) }
  }

  if (savedGain !== null) {
    const gain = parseFloat(savedGain)
    const isProfit = gain >= 0
    return (
      <div className="grid gap-4 text-center">
        <p className="text-4xl">{isProfit ? '📈' : '📉'}</p>
        <div>
          <p className={`text-lg font-semibold ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {isProfit ? 'Profit' : 'Loss'} of ₹{Math.abs(gain).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">on this sale of {holdingName}, vs. average cost</p>
        </div>
        <button type="button" onClick={onSave} className="rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700">Done</button>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-[var(--text-muted)]">Selling <span className="font-medium text-[var(--text)]">{holdingName}</span></p>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Owner (member)</label>
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={INP}>
          <option value="">— Unassigned —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Sale Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INP} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Units Sold *</label>
          <input type="number" min="0" step="0.000001" max={maxQuantity ?? undefined} placeholder="e.g. 10.5" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={INP} />
          {currentQuantity && <p className="mt-1 text-[11px] text-[var(--text-muted)]">You hold {currentQuantity} units</p>}
        </div>
        <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Price per unit</label>
          <input type="number" min="0" step="0.000001" placeholder="e.g. 94.50" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} className={INP} /></div>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Total sale proceeds (₹) *</label>
        <input type="number" min="0" step="0.01" placeholder="e.g. 5000" value={amount} onChange={(e) => setAmount(e.target.value)} className={INP} /></div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Credited to account (optional)</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={INP}>
          <option value="">— None —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {accountId && (
        <label className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
          <input
            type="checkbox"
            checked={affectsBalance}
            onChange={(e) => setAffectsBalance(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border)] text-primary-600 focus:ring-primary-500"
          />
          <span className="text-xs text-[var(--text-2)]">
            <span className="font-medium">Add to account balance</span>
            <br />
            <span className="text-[var(--text-muted)]">Turn off if the proceeds didn't actually land in this account.</span>
          </span>
        </label>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
        <button type="button" disabled={saving} onClick={save} className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">{saving ? 'Saving…' : 'Record Sell'}</button>
      </div>
    </div>
  )
}
