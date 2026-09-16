import { DataTable } from '../ui/DataTable'
import type { DataTableColumn } from '../ui/DataTable'
import type { CagrByPeriod, FundPerformanceRow } from '../../types/domain'

type Props = { rows: FundPerformanceRow[] }

const PERIOD_KEYS: (keyof CagrByPeriod)[] = ['3M', '6M', '1Y', '3Y', '5Y']

function num(v: number | null | undefined): number {
  return v === null || v === undefined ? -Infinity : v
}

function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`
}

const columns: DataTableColumn<FundPerformanceRow>[] = [
  {
    key: 'name', label: 'Fund', sortable: true, searchable: true,
    sortValue: (r) => r.instrument_name, searchValue: (r) => r.instrument_name,
    render: (r) => (
      <>
        <p className="text-[var(--text)]">{r.instrument_name}</p>
        {r.fund_sub_category && <p className="text-xs text-[var(--text-muted)]">{r.fund_sub_category}</p>}
      </>
    ),
  },
  {
    key: 'allocation', label: 'Allocation %', align: 'right', sortable: true,
    sortValue: (r) => num(parseFloat(r.allocation_percent)),
    dataBar: { value: (r) => parseFloat(r.allocation_percent) || null },
    render: (r) => `${parseFloat(r.allocation_percent).toFixed(1)}%`,
  },
  {
    key: 'xirr', label: 'XIRR', align: 'right', sortable: true,
    sortValue: (r) => num(r.xirr),
    render: (r) => <span className="font-medium">{r.xirr !== null ? `${(r.xirr * 100).toFixed(1)}%` : '—'}</span>,
  },
  ...PERIOD_KEYS.map((p): DataTableColumn<FundPerformanceRow> => ({
    key: p, label: `CAGR ${p}`, align: 'right', sortable: true,
    sortValue: (r) => num(r.cagr[p]),
    render: (r) => (
      <span
        className={r.cagr[p] === null ? 'text-[var(--text-faint)]' : (r.cagr[p]! >= 0 ? 'text-emerald-600' : 'text-red-500')}
        title={r.cagr[p] === null ? 'Not enough history' : undefined}
      >
        {pct(r.cagr[p])}
      </span>
    ),
  })),
]

export function FundPerformanceTable({ rows }: Props) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.instrument_id}
      defaultSortCol="allocation"
      defaultSortDir="desc"
      minWidth="min-w-[820px]"
    />
  )
}
