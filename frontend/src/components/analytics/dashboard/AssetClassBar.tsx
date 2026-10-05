import { ASSET_CLASS_ORDER, aggregate, pct, useDashboardColors, useMoney } from './facts'
import type { Fact } from './facts'

type Props = {
  rows: Fact[]
  selected: Set<string>
  onToggle: (value: string) => void
  onClear: () => void
}

/** Part-to-whole of asset classes: a 100% stacked bar plus a legend that carries
 *  every value (so no colour has to be read alone). Segments and legend rows toggle
 *  the asset-class filter. */
export function AssetClassBar({ rows, selected, onToggle, onClear }: Props) {
  const colors = useDashboardColors()
  const money = useMoney()
  const buckets = aggregate(rows, 'asset_class')
    .sort((a, b) => ASSET_CLASS_ORDER.indexOf(a.key) - ASSET_CLASS_ORDER.indexOf(b.key))
  const total = buckets.reduce((s, b) => s + b.value, 0)
  const anySelected = selected.size > 0
  const dimmed = (key: string) => anySelected && !selected.has(key)

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">Asset class</h3>
        {anySelected ? (
          <button type="button" onClick={onClear} className="text-[11px] text-primary-600 hover:underline dark:text-primary-300">
            Clear ({selected.size})
          </button>
        ) : <span className="text-[11px] text-[var(--text-muted)]">Equity vs debt vs the rest</span>}
      </div>
      {total <= 0 ? (
        <p className="py-6 text-center text-xs text-[var(--text-muted)]">Nothing in this view.</p>
      ) : (
        <>
          <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-md">
            {buckets.map((b) => (
              <button key={b.key} type="button" onClick={() => onToggle(b.key)}
                title={`${b.key}: ${money.full(b.value)} (${pct(b.value, total).toFixed(1)}%)`}
                aria-label={`${b.key} ${pct(b.value, total).toFixed(1)}%`}
                style={{ width: `${pct(b.value, total)}%`, background: colors.assetClass(b.key), opacity: dimmed(b.key) ? 0.3 : 1 }}
                className="h-full min-w-[2px] transition-opacity hover:opacity-80" />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {buckets.map((b) => (
              <li key={b.key}>
                <button type="button" onClick={() => onToggle(b.key)}
                  className={`flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-[var(--surface-2)] ${dimmed(b.key) ? 'opacity-50' : ''}`}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colors.assetClass(b.key) }} />
                  <span className="min-w-0 flex-1 truncate text-[var(--text-2)]">{b.key}</span>
                  <span className="tabular-nums text-[var(--text)]">{money.compact(b.value)}</span>
                  <span className="w-10 text-right tabular-nums text-[var(--text-muted)]">{pct(b.value, total).toFixed(1)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
