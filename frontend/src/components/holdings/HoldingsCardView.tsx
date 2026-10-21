import { useState } from 'react'
import { ChevronRight, Layers } from 'lucide-react'
import { cn } from '../../lib/cn'
import { computeGain } from '../../lib/fmt'
import { EntityIcon } from '../ui/EntityIcon'
import { Amount } from '../ui/Amount'
import { Delta } from '../ui/Delta'
import { EntityCard } from '../ui/EntityCard'
import type { RowAction } from '../ui/Menu'
import { SectionHeader } from '../ui/SectionHeader'
import type { DashboardHolding } from '../../types/domain'

export type CardItem =
  | { kind: 'holding'; holding: DashboardHolding }
  | { kind: 'fund_rollup'; key: string; fundName: string; folios: DashboardHolding[]; totalInvested: number; totalValue: number }

export type CardSection = { key: string; label: string; color?: string; items: CardItem[]; total: number }

type Props = {
  sections: CardSection[]
  itemKey: (h: DashboardHolding) => string | number
  subtitleOf: (h: DashboardHolding) => string
  ownerOf: (h: DashboardHolding) => string
  actionsFor: (h: DashboardHolding) => RowAction[]
  onOpen: (h: DashboardHolding) => void
}

/** The Investments "Card" view: the same holdings and actions as the table, as a grid of cards. */
export function HoldingsCardView({ sections, itemKey, subtitleOf, ownerOf, actionsFor, onOpen }: Props) {
  const [openFunds, setOpenFunds] = useState<Set<string>>(new Set())
  const toggleFund = (k: string) => setOpenFunds((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const card = (h: DashboardHolding) => (
    <HoldingCard key={itemKey(h)} holding={h} subtitle={subtitleOf(h)} owner={ownerOf(h)} actions={actionsFor(h)} onOpen={() => onOpen(h)} />
  )

  return (
    <div className="grid gap-6">
      {sections.map((s) => (
        <section key={s.key} className="grid gap-3" aria-label={s.label || 'Holdings'}>
          {s.label && (
            <SectionHeader
              title={s.label}
              subtitle={<>{s.items.length} · <Amount value={s.total} format="compact" /></>}
            />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {s.items.map((it) => {
              if (it.kind === 'holding') return card(it.holding)
              const open = openFunds.has(it.key)
              const { gainPct } = computeGain(it.totalValue, it.totalInvested, 'mutual_fund')
              return (
                <div key={it.key} className={cn('grid gap-3', open && 'col-span-full')}>
                  <button type="button" onClick={() => toggleFund(it.key)} aria-expanded={open}
                    className="flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 text-left shadow-[var(--shadow-card)] hover:border-line-strong">
                    <ChevronRight className={cn('h-4 w-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-90')} aria-hidden />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted" aria-hidden><Layers className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{it.fundName}</span>
                      <span className="block text-xs text-ink-muted">{it.folios.length} folios</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Amount value={it.totalValue} format="compact" className="block text-sm font-semibold text-ink" />
                      <Delta value={gainPct} className="text-xs" />
                    </span>
                  </button>
                  {open && <div className="grid grid-cols-1 gap-3 border-l-2 border-line pl-4 sm:grid-cols-2 xl:grid-cols-3">{it.folios.map(card)}</div>}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function HoldingCard({ holding: h, subtitle, owner, actions, onOpen }: {
  holding: DashboardHolding; subtitle: string; owner: string; actions: RowAction[]; onOpen: () => void
}) {
  const value = parseFloat(h.market_value)
  const invested = parseFloat(h.net_invested)
  const { gainPct } = computeGain(value, invested, h.instrument_type)
  return (
    <EntityCard
      icon={<EntityIcon kind="asset" type={h.instrument_type} className="h-9 w-9" />}
      title={h.display_name}
      subtitle={`${subtitle} · ${owner}`}
      value={<Amount value={value} format="compact" />}
      meta={invested > 0 && h.instrument_type !== 'cash' ? <Delta value={gainPct} className="text-xs" /> : undefined}
      actions={actions}
      onOpen={onOpen}
    />
  )
}
