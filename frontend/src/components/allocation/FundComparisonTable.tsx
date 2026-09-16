import { DataTable } from '../ui/DataTable'
import type { DataTableColumn } from '../ui/DataTable'
import type { FundComparisonRow } from '../../types/domain'

type Props = { rows: FundComparisonRow[] }

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return -Infinity
  return typeof v === 'number' ? v : parseFloat(v)
}

function riskFallback(r: FundComparisonRow): string {
  return r.linked_to_nav_source ? (r.risk_metrics?.reason ?? 'Not enough data') : 'Not linked to NAV data'
}

const columns: DataTableColumn<FundComparisonRow>[] = [
  {
    key: 'name', label: 'Name', sortable: true, searchable: true,
    sortValue: (r) => r.instrument_name, searchValue: (r) => r.instrument_name,
    render: (r) => (
      <>
        <p className="text-[var(--text)]">{r.instrument_name}</p>
        {r.fund_category && <p className="text-xs text-[var(--text-muted)]">{r.fund_category}</p>}
      </>
    ),
  },
  {
    key: 'expense_ratio', label: 'Expense', align: 'right', sortable: true,
    sortValue: (r) => num(r.expense_ratio),
    render: (r) => r.expense_ratio ? `${r.expense_ratio}%` : '—',
  },
  {
    key: 'xirr', label: 'XIRR', align: 'right', sortable: true,
    sortValue: (r) => num(r.xirr_percent),
    render: (r) => r.xirr_percent !== null ? `${r.xirr_percent.toFixed(1)}%` : '—',
  },
  {
    key: 'std_dev', label: 'Std Dev', align: 'right', sortable: true,
    sortValue: (r) => num(r.risk_metrics?.standard_deviation_percent),
    render: (r) => r.risk_metrics?.available ? `${r.risk_metrics.standard_deviation_percent}%` : <span className="text-xs text-[var(--text-faint)]">{riskFallback(r)}</span>,
  },
  {
    key: 'beta', label: 'Beta', align: 'right', sortable: true,
    sortValue: (r) => num(r.risk_metrics?.beta),
    render: (r) => r.risk_metrics?.available ? (r.risk_metrics.beta ?? '—') : <span className="text-xs text-[var(--text-faint)]">{riskFallback(r)}</span>,
  },
  {
    key: 'alpha', label: 'Alpha', align: 'right', sortable: true,
    sortValue: (r) => num(r.risk_metrics?.alpha_percent),
    render: (r) => {
      if (!r.risk_metrics?.available) return <span className="text-xs text-[var(--text-faint)]">{riskFallback(r)}</span>
      const alpha = r.risk_metrics.alpha_percent
      return <span className={`font-medium ${(alpha ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{alpha !== null ? `${alpha}%` : '—'}</span>
    },
  },
  {
    key: 'sharpe', label: 'Sharpe', align: 'right', sortable: true,
    sortValue: (r) => num(r.risk_metrics?.sharpe_ratio),
    render: (r) => r.risk_metrics?.available ? <span className="font-medium">{r.risk_metrics.sharpe_ratio ?? '—'}</span> : <span className="text-xs text-[var(--text-faint)]">{riskFallback(r)}</span>,
  },
  {
    key: 'overlap', label: 'Overlap', align: 'right', sortable: true,
    sortValue: (r) => r.max_overlap_percent,
    render: (r) => r.max_overlap_percent > 0 ? `${r.max_overlap_percent.toFixed(1)}%` : '—',
  },
  {
    key: 'benchmark', label: 'Benchmark', align: 'right',
    render: (r) => r.benchmark_comparison?.available
      ? <span className="text-xs text-[var(--text-muted)]">{r.benchmark_comparison.benchmark_name?.split('(')[0].trim()}</span>
      : <span className="text-xs text-[var(--text-faint)]">{r.benchmark_comparison?.reason ?? 'No matching benchmark'}</span>,
  },
  {
    key: 'benchmark_gap', label: '3Y vs Benchmark', align: 'right', sortable: true,
    sortValue: (r) => num(r.benchmark_comparison?.periods?.['3Y']?.gap_percent),
    render: (r) => {
      if (!r.benchmark_comparison?.available) return <span className="text-xs text-[var(--text-faint)]">{r.benchmark_comparison?.reason ?? 'No matching benchmark'}</span>
      const gap = r.benchmark_comparison.periods?.['3Y']?.gap_percent
      return (
        <span className={`font-medium ${r.benchmark_comparison.underperforming ? 'text-red-500' : 'text-emerald-600'}`}>
          {gap !== null && gap !== undefined ? `${gap >= 0 ? '+' : ''}${gap}%` : '—'}
        </span>
      )
    },
  },
]

export function FundComparisonTable({ rows }: Props) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.instrument_id}
      defaultSortCol="sharpe"
      defaultSortDir="desc"
      minWidth="min-w-[980px]"
    />
  )
}
