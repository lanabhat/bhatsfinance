import type { PortfolioTopHolding } from '../../types/domain'

type Props = { holdings: PortfolioTopHolding[] }

export function TopHoldingsTable({ holdings }: Props) {
  if (holdings.length === 0) {
    return <p className="py-4 text-center text-xs text-[var(--text-muted)]">Upload holdings for at least one fund to see this.</p>
  }
  const top = holdings.slice(0, 20)
  const maxWeight = Math.max(...top.map((h) => parseFloat(h.portfolio_weight_percent)), 1)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <th className="py-2 pr-3">Stock</th>
            <th className="py-2 pr-3 text-right">Portfolio weight</th>
            <th className="py-2">Via</th>
          </tr>
        </thead>
        <tbody>
          {top.map((h) => {
            const weight = parseFloat(h.portfolio_weight_percent)
            return (
              <tr key={h.isin} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2.5 pr-3 text-[var(--text)]">{h.name}</td>
                <td className="py-2.5 pr-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(weight / maxWeight) * 100}%` }} />
                    </div>
                    <span className="w-14 shrink-0 tabular-nums text-[var(--text)]">{h.portfolio_weight_percent}%</span>
                  </div>
                </td>
                <td className="py-2.5 text-xs text-[var(--text-muted)]">
                  {h.via_funds.length > 1 ? `${h.via_funds.length} funds` : h.via_funds[0]}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
