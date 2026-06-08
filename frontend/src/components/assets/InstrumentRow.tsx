import { useMaskedFmt } from '../common/Money'
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
  const fmtINR = useMaskedFmt()
  const borderColor = category?.color ?? '#94a3b8'
  const hasActions = onBuy || onUpdateValue

  return (
    <div
      className={`rounded-xl border-l-4 bg-white shadow-sm ${onClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex items-center gap-3 p-4" onClick={onClick}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
          {TYPE_ICONS[instrument.instrument_type] ?? '💼'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{instrument.name}</p>
          <p className="text-xs text-slate-400 capitalize">{instrument.instrument_type.replace(/_/g, ' ')}</p>
        </div>
        {holding && (
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold text-slate-900">{fmtINR(holding.market_value)}</p>
            {holding.net_invested && parseFloat(holding.net_invested) > 0 && (
              <p className="text-xs text-slate-400">inv {fmtINR(holding.net_invested)}</p>
            )}
          </div>
        )}
      </div>
      {hasActions && (
        <div className="flex gap-1 border-t border-slate-100 px-3 pb-2.5 pt-2">
          {onBuy && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onBuy() }}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
            >
              + Buy
            </button>
          )}
          {onUpdateValue && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUpdateValue() }}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
            >
              Update Value
            </button>
          )}
        </div>
      )}
    </div>
  )
}
