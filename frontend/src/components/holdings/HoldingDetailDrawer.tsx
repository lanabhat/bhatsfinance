import { useCallback, useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { investmentApi } from '../../api/investmentApi'
import { ledgerApi } from '../../api/ledgerApi'
import { portfolioApi } from '../../api/portfolioApi'
import { valuationApi } from '../../api/valuationApi'
import { normalizeApiError } from '../../hooks/errorUtils'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { computeGain, fmtRate, formatMaturity } from '../../lib/fmt'
import { TYPE_LABELS } from '../../lib/instrumentTypes'
import { BuyHistoryEditor } from '../assets/InstrumentExpandedDetail'
import type { MaturityInfo } from '../assets/InstrumentRow'
import { Amount } from '../ui/Amount'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { DateText } from '../ui/DateText'
import { Delta } from '../ui/Delta'
import { DetailDrawer } from '../ui/DetailDrawer'
import { EmptyState } from '../ui/EmptyState'
import { MemberAvatar } from '../ui/MemberAvatar'
import { Menu, RowMenu } from '../ui/Menu'
import { SectionHeader } from '../ui/SectionHeader'
import { Skeleton } from '../ui/Skeleton'
import type { AssetCategory, DashboardHolding, Instrument, InstrumentOwnership, Transaction, ValuationSnapshot } from '../../types/domain'

type Props = {
  open: boolean
  onClose: () => void
  householdId: number
  holding: DashboardHolding
  instrument: Instrument
  category?: AssetCategory
  maturities?: (MaturityInfo & { investmentDate: string })[]
  onBuy: () => void
  /** Omit for value-based holdings that don't sell by units. */
  onSell?: () => void
  onUpdateValue: () => void
  onEdit: () => void
  /** Asks to delete (with its transactions and valuations); the page handles confirm/undo. */
  onDelete: () => void
  onTransactionsChanged: () => Promise<void>
}

/** One holding: header (name, owner, value) → facts → buy/sell history and valuations → actions. */
export function HoldingDetailDrawer(p: Props) {
  const { canWrite } = useAuth()
  const { members } = useApp()
  const { holding, instrument } = p
  const [txs, setTxs] = useState<Transaction[]>([])
  const [valuations, setValuations] = useState<ValuationSnapshot[]>([])
  const [ownerships, setOwnerships] = useState<InstrumentOwnership[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const investmentId = holding.investment_id

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (investmentId) {
        const [t, inv, v] = await Promise.all([
          ledgerApi.listTransactionsForInvestment(p.householdId, investmentId),
          investmentApi.getInvestment(investmentId),
          valuationApi.listForInvestment(p.householdId, investmentId),
        ])
        setTxs(t); setValuations(v)
        setOwnerships(inv.member ? [{ id: -1, instrument: instrument.id, member: inv.member, allocation_percent: '100.00' }] : [])
      } else {
        const [t, o, v] = await Promise.all([
          ledgerApi.listTransactionsForInstrument(p.householdId, instrument.id),
          portfolioApi.listInstrumentOwnerships(instrument.id),
          valuationApi.listForInstrument(p.householdId, instrument.id),
        ])
        setTxs(t); setValuations(v); setOwnerships(o)
      }
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setLoading(false)
    }
  }, [p.householdId, investmentId, instrument.id])

  // market_value in deps: reload after "Update value" refreshes the dashboard holding.
  useEffect(() => { if (p.open) void load() }, [p.open, load, holding.market_value])

  const deleteEntry = async (t: Transaction) => {
    try {
      await ledgerApi.deleteTransaction(t.id)
      await load()
      await p.onTransactionsChanged()
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  const value = parseFloat(holding.market_value)
  const invested = parseFloat(holding.net_invested)
  const { gain, gainPct } = computeGain(value, invested, instrument.instrument_type)
  const owner = ownerships.length
    ? ownerships.map((o) => members.find((m) => m.id === o.member)?.label ?? `#${o.member}`).join(', ')
    : 'Unassigned'
  const nearest = p.maturities?.[0]
  const buysAndSells = txs.filter((t) => t.transaction_type === 'buy' || t.transaction_type === 'sell')
  const qty = parseFloat(holding.quantity)

  return (
    <DetailDrawer
      open={p.open}
      onClose={p.onClose}
      title={holding.display_name}
      subtitle={<>{loading ? null : <MemberAvatar name={owner} />}<span>{TYPE_LABELS[instrument.instrument_type] ?? instrument.instrument_type}</span></>}
      amount={<Amount value={value} />}
      amountCaption={invested > 0 && instrument.instrument_type !== 'cash'
        ? <span className="inline-flex flex-wrap items-center gap-2"><Amount value={gain} signed tone="gain" /><Delta value={gainPct} /></span>
        : undefined}
      badges={nearest && formatMaturity(nearest.date).includes('day') ? <Badge tone="warning">{formatMaturity(nearest.date)}</Badge> : undefined}
      facts={[
        { label: 'Invested', value: invested > 0 ? <Amount value={invested} /> : '—' },
        { label: 'Category', value: p.category?.name ?? 'Uncategorised' },
        ...(qty > 0 ? [{ label: 'Units', value: <span className="tabular-nums">{qty.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</span> }] : []), // ui-check-ignore
        { label: 'Last valued', value: <DateText value={holding.last_valued_on} /> },
        ...(p.maturities ?? []).map((m, i) => ({
          label: (p.maturities!.length > 1 ? `Deposit ${i + 1}` : 'Deposit'),
          value: <>{fmtRate(m.rate)} · from <DateText value={m.investmentDate} format="short" /> · matures <DateText value={m.date} /> ({formatMaturity(m.date)})</>,
          wide: true,
        })),
      ]}
      actions={canWrite ? (
        <>
          <Button variant="secondary" icon={<Pencil />} onClick={p.onEdit}>Edit</Button>
          <Button variant="secondary" icon={<ArrowDownToLine />} onClick={p.onBuy}>Buy</Button>
          {p.onSell && <Button variant="secondary" icon={<ArrowUpFromLine />} onClick={p.onSell}>Sell</Button>}
          <Button variant="secondary" icon={<RefreshCw />} onClick={p.onUpdateValue}>Update value</Button>
          <Menu
            title="More"
            items={[{
              label: 'Delete holding', icon: <Trash2 />, destructive: true, onSelect: p.onDelete,
              hint: `With its ${txs.length} transaction${txs.length === 1 ? '' : 's'} and ${valuations.length} valuation${valuations.length === 1 ? '' : 's'}`,
            }]}
            trigger={({ toggle, ref }) => <Button ref={ref} variant="ghost" icon={<MoreHorizontal />} onClick={toggle} aria-label="More actions" className="flex-none" />}
          />
        </>
      ) : undefined}
    >
      {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}

      <section className="mb-6 grid gap-2" aria-label="Buy and sell history">
        <SectionHeader title="Buy and sell history" as="h3" />
        {loading ? <Skeleton variant="table" rows={3} /> : buysAndSells.length === 0 ? (
          <EmptyState title="No buys or sells recorded" />
        ) : (
          <ul className="m-0 list-none divide-y divide-line p-0">
            {buysAndSells.map((t) => {
              const isSell = t.transaction_type === 'sell'
              const realized = isSell && t.realized_gain !== null ? parseFloat(t.realized_gain) : null
              return (
                <li key={t.id} className="group flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm text-ink">
                      <Badge tone={isSell ? 'neutral' : 'accent'}>{isSell ? 'Sell' : 'Buy'}</Badge>
                      <DateText value={t.tx_date} />
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {t.quantity ? `${parseFloat(t.quantity).toFixed(4)} units` : null}
                      {t.external_reference ? `${t.quantity ? ' · ' : ''}${t.external_reference}` : null}
                    </p>
                    {realized !== null && <p className="text-xs">Realised <Amount value={realized} signed tone="gain" /></p>}
                  </div>
                  <Amount value={t.amount} className="text-sm font-medium" />
                  {canWrite && (
                    <RowMenu label="Entry actions" actions={[
                      { kind: 'edit', label: 'Edit entry', onSelect: () => setEditingTx(t) },
                      { kind: 'delete', label: 'Delete entry', onSelect: () => void deleteEntry(t),
                        confirm: { title: `Delete this ${isSell ? 'sell' : 'buy'}?`, message: 'The holding’s units and invested amount are recalculated without it.', confirmLabel: 'Delete' } },
                    ]} />
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {editingTx && (
          <BuyHistoryEditor
            transaction={editingTx}
            onSave={async () => { setEditingTx(null); await load(); await p.onTransactionsChanged() }}
            onCancel={() => setEditingTx(null)}
          />
        )}
      </section>

      <section className="grid gap-2" aria-label="Valuations">
        <SectionHeader title="Valuations" as="h3" />
        {loading ? <Skeleton variant="table" rows={3} /> : valuations.length === 0 ? (
          <EmptyState title="Never valued" description="Use Update value to record today’s price or value." />
        ) : (
          <ul className="m-0 list-none divide-y divide-line p-0">
            {valuations.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-ink"><DateText value={v.valuation_date} /></p>
                  <p className="truncate text-xs text-ink-muted">{v.source}{v.notes ? ` · ${v.notes}` : ''}</p>
                </div>
                <span className="text-sm font-medium tabular-nums text-ink">
                  {v.unit_price !== null ? <>NAV <Amount value={v.unit_price} format="precise" /></> : v.market_value !== null ? <Amount value={v.market_value} /> : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DetailDrawer>
  )
}
