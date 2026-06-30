import { Money } from '../common/Money'
import type { AssetCategory, DashboardHolding, Instrument } from '../../types/domain'

type Props = {
  instrument: Instrument
  holding?: DashboardHolding
  category?: AssetCategory
  onClick?: () => void
  onBuy?: () => void
  onUpdateValue?: () => void
}

const TYPE_ICONS: Record<string, string> = {
  mutual_fund: '📊', equity: '📈', fd: '🏦', rd: '🏦', epf: '🛡',
  ppf: '🛡', nps: '🛡', gold: '🪙', real_estate: '🏠', sip: '🔄',
  insurance: '☂️', cash: '💵', other: '💼', vehicle: '🚗', liability: '⚠️',
}


export function InstrumentRow({ instrument, holding, category, onClick, onBuy, onUpdateValue }: Props) {
  const borderColor = category?.color ?? '#94a3b8'
  const hasActions = onBuy || onUpdateValue

  return (
    <div
      className={`w-full overflow-hidden rounded-xl border-l-4 bg-[var(--surface)] shadow-sm ${onClick ? 'cursor-pointer hover:bg-[var(--surface-2)]' : ''}`}
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5" onClick={onClick}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-base">
          {TYPE_ICONS[instrument.instrument_type] ?? '💼'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[var(--text)]">{instrument.name}</p>
          <p className="text-[11px] text-[var(--text-muted)] capitalize">{instrument.instrument_type.replace(/_/g, ' ')}</p>
        </div>
        {holding && (
          <div className="max-w-[52%] shrink-0 text-right">
            <p><Money value={holding.market_value} className="truncate text-[13px] font-bold text-[var(--text)]" /></p>
            {holding.net_invested && parseFloat(holding.net_invested) > 0 && (
              <p className="truncate text-[11px] text-[var(--text-muted)]">inv <Money value={holding.net_invested} /></p>
            )}
          </div>
        )}
      </div>
      {hasActions && (
        <div className="flex gap-1 border-t border-[var(--border)] px-3 pb-2.5 pt-2">
          {onBuy && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onBuy() }}
              className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text-2)] hover:border-primary-400 hover:text-primary-700 dark:text-primary-300"
            >
              + Buy
            </button>
          )}
          {onUpdateValue && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUpdateValue() }}
              className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--text-2)] hover:border-primary-400 hover:text-primary-700 dark:text-primary-300"
            >
              Update Value
            </button>
          )}
        </div>
      )}
    </div>
  )
}
