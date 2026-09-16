import { DataTable } from '../ui/DataTable'
import type { DataTableColumn } from '../ui/DataTable'
import type { PortfolioTopHolding } from '../../types/domain'

type Props = { holdings: PortfolioTopHolding[] }

const columns: DataTableColumn<PortfolioTopHolding>[] = [
  {
    key: 'name', label: 'Stock', sortable: true, searchable: true,
    sortValue: (h) => h.name, searchValue: (h) => h.name,
    render: (h) => h.name,
  },
  {
    key: 'weight', label: 'Portfolio weight', align: 'right', sortable: true,
    sortValue: (h) => parseFloat(h.portfolio_weight_percent),
    dataBar: { value: (h) => parseFloat(h.portfolio_weight_percent) || null },
    render: (h) => `${h.portfolio_weight_percent}%`,
  },
  {
    key: 'via', label: 'Via',
    render: (h) => h.via_funds.length > 1 ? `${h.via_funds.length} funds` : h.via_funds[0],
  },
]

export function TopHoldingsTable({ holdings }: Props) {
  if (holdings.length === 0) {
    return <p className="py-4 text-center text-xs text-[var(--text-muted)]">Upload holdings for at least one fund to see this.</p>
  }
  const top = holdings.slice(0, 20)

  return (
    <DataTable
      columns={columns}
      rows={top}
      rowKey={(h) => h.isin}
      defaultSortCol="weight"
      defaultSortDir="desc"
      minWidth="min-w-[480px]"
    />
  )
}
