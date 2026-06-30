import { useEffect, useState } from 'react'
import { Money, useMaskedFmt } from '../common/Money'
import { ledgerApi } from '../../api/ledgerApi'
import { portfolioApi } from '../../api/portfolioApi'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import type { DashboardHolding, Instrument, InstrumentOwnership, Transaction } from '../../types/domain'

type Props = {
  householdId: number
  holding: DashboardHolding
  instrument: Instrument
  onBuy: () => void
  onUpdateValue: () => void
  onEdit: () => void
  onTransactionsChanged: () => Promise<void>
}

const INP = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

function BuyHistoryEditor({ transaction, onSave, onCancel }: {
  transaction: Transaction
  onSave: () => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    tx_date: transaction.tx_date,
    amount: transaction.amount,
    quantity: transaction.quantity ?? '',
    price_per_unit: transaction.price_per_unit ?? '',
    external_reference: transaction.external_reference ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await ledgerApi.updateTransaction(transaction.id, {
        household: transaction.household,
        member: transaction.member,
        account: transaction.account,
        instrument: transaction.instrument,
        tx_date: form.tx_date,
        amount: form.amount,
        quantity: form.quantity || null,
        price_per_unit: form.price_per_unit || null,
        fees: transaction.fees,
        taxes: transaction.taxes,
        currency: transaction.currency,
        direction: transaction.direction,
        transaction_type: transaction.transaction_type,
        external_reference: form.external_reference,
        idempotency_key: transaction.idempotency_key,
        metadata: transaction.metadata,
      })
      await onSave()
    } catch {
      setError('Failed to update buy entry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-[var(--border)] px-3 py-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Edit Buy Entry</p>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Date</label>
            <input type="date" value={form.tx_date} onChange={(e) => setForm((p) => ({ ...p, tx_date: e.target.value }))} className={INP} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Amount</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Quantity</label>
            <input type="number" min="0" step="0.000001" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} className={INP} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Price per unit</label>
            <input type="number" min="0" step="0.000001" value={form.price_per_unit} onChange={(e) => setForm((p) => ({ ...p, price_per_unit: e.target.value }))} className={INP} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Reference</label>
          <input value={form.external_reference} onChange={(e) => setForm((p) => ({ ...p, external_reference: e.target.value }))} className={INP} />
        </div>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void save()} className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function InstrumentExpandedDetail({ householdId, holding, instrument, onBuy, onUpdateValue, onEdit, onTransactionsChanged }: Props) {
  const { canWrite } = useAuth()
  const { members } = useApp()
  const fmt = useMaskedFmt()
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [ownerships, setOwnerships] = useState<InstrumentOwnership[]>([])
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [busyTxId, setBusyTxId] = useState<number | null>(null)
  const [actionError, setActionError] = useState('')

  const loadHistory = async () => {
    setLoading(true)
    const [t, o] = await Promise.all([
      ledgerApi.listTransactionsForInstrument(householdId, instrument.id),
      portfolioApi.listInstrumentOwnerships(instrument.id),
    ])
    setTxs(t)
    setOwnerships(o)
    setLoading(false)
  }

  useEffect(() => {
    void loadHistory()
  }, [householdId, instrument.id])

  const handleDeleteBuy = async (tx: Transaction) => {
    if (!confirm(`Delete buy entry from ${tx.tx_date}?`)) return
    setBusyTxId(tx.id)
    setActionError('')
    try {
      await ledgerApi.deleteTransaction(tx.id)
      await loadHistory()
      await onTransactionsChanged()
    } catch {
      setActionError('Failed to delete buy entry.')
    } finally {
      setBusyTxId(null)
    }
  }

  const buys = txs.filter((t) => t.transaction_type === 'buy')
  const gain = parseFloat(holding.market_value) - parseFloat(holding.net_invested)
  const gainPct = parseFloat(holding.net_invested) > 0 ? ((gain / parseFloat(holding.net_invested)) * 100).toFixed(1) : null

  const ownerLabel = ownerships.length > 0
    ? ownerships.map((o) => members.find((m) => m.id === o.member)?.label ?? `#${o.member}`).join(', ')
    : 'Unassigned'

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <p className="px-3 pt-3 text-xs text-[var(--text-muted)]">{ownerLabel}</p>
      <div className="grid grid-cols-3 gap-px bg-[var(--surface-2)] mt-2">
        {[
          { label: 'Current Value', value: fmt(holding.market_value) },
          { label: 'Invested', value: fmt(holding.net_invested) },
          { label: 'Gain / Loss', value: gainPct ? `${gain >= 0 ? '+' : ''}${gainPct}%` : '—' },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--surface)] px-3 py-2.5 text-center">
            <p className={`text-sm font-bold ${s.label === 'Gain / Loss' ? (gain >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-[var(--text)]'}`}>{s.value}</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="max-h-52 overflow-y-auto px-3 py-2">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Buy History</p>
        {actionError ? <p className="mb-2 text-xs text-red-500">{actionError}</p> : null}
        {loading ? <p className="py-3 text-center text-xs text-[var(--text-muted)]">Loading...</p>
        : buys.length === 0 ? <p className="py-3 text-center text-xs text-[var(--text-muted)]">No buy transactions recorded.</p>
        : buys.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0">
            <div>
              <p className="text-xs font-medium text-[var(--text-2)]">{t.tx_date}</p>
              {t.quantity && <p className="text-xs text-[var(--text-muted)]">{parseFloat(t.quantity).toFixed(4)} units</p>}
              {t.external_reference ? <p className="text-xs text-[var(--text-muted)]">{t.external_reference}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              <p><Money value={t.amount} className="text-xs font-semibold text-[var(--text)]" /></p>
              {canWrite ? (
                <>
                  <button type="button" onClick={() => setEditingTx(t)} className="rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-2)] hover:bg-[var(--surface-2)]">
                    Edit
                  </button>
                  <button type="button" disabled={busyTxId === t.id} onClick={() => void handleDeleteBuy(t)} className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 dark:bg-red-900/15 disabled:opacity-50">
                    Delete
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {editingTx ? (
        <BuyHistoryEditor
          transaction={editingTx}
          onSave={async () => {
            setEditingTx(null)
            await loadHistory()
            await onTransactionsChanged()
          }}
          onCancel={() => setEditingTx(null)}
        />
      ) : null}
      <div className="flex gap-2 border-t border-[var(--border)] p-3">
        <button type="button" onClick={onBuy} disabled={!canWrite} className="flex-1 rounded-xl border border-primary-300 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:bg-primary-900/15 disabled:opacity-50">+ Buy More</button>
        <button type="button" onClick={onUpdateValue} disabled={!canWrite} className="flex-1 rounded-xl bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">Update Value</button>
        <button type="button" onClick={onEdit} disabled={!canWrite} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50" title="Edit instrument">✏️</button>
      </div>
    </div>
  )
}
