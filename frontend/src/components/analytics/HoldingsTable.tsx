import { useMemo } from 'react'
import { Money } from '../common/Money'
import { DataTable } from '../ui/DataTable'
import type { DataTableColumn } from '../ui/DataTable'
import type { DashboardHolding, CategoryBreakdownItem } from '../../types/domain'

type Props = {
  holdings: DashboardHolding[]
  categoryBreakdown: CategoryBreakdownItem[]
}

const TYPE_LABELS: Record<string, string> = {
  equity: 'Equity', mutual_fund: 'Mutual Fund', fd: 'FD', rd: 'RD',
  epf: 'EPF', ppf: 'PPF', nps: 'NPS', gold: 'Gold',
  real_estate: 'Real Estate', sip: 'SIP', insurance: 'Insurance',
  lending: 'Lending', cash: 'Cash', vehicle: 'Vehicle', liability: 'Liability', other: 'Other',
}

type Row = DashboardHolding & { invested: number; current: number; gain: number; gainPct: number | null; catName: string }

export function HoldingsTable({ holdings, categoryBreakdown }: Props) {
  const catMap = useMemo(() => {
    const m: Record<number, string> = {}
    for (const c of categoryBreakdown) if (c.category_id) m[c.category_id] = c.category_name
    return m
  }, [categoryBreakdown])

  const rows: Row[] = useMemo(() => holdings.map((h) => {
    const invested = parseFloat(h.net_invested)
    const current = parseFloat(h.market_value)
    const gain = current - invested
    const gainPct = invested > 0 ? (gain / invested) * 100 : null
    return { ...h, invested, current, gain, gainPct, catName: h.asset_category ? catMap[h.asset_category] ?? '—' : '—' }
  }), [holdings, catMap])

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'name', label: 'Name', sortable: true, searchable: true,
      sortValue: (r) => r.instrument_name, searchValue: (r) => r.instrument_name,
      render: (r) => <span className="max-w-[200px] truncate font-medium text-[var(--text)] block" title={r.instrument_name}>{r.instrument_name}</span>,
    },
    {
      key: 'type', label: 'Type', sortable: true,
      sortValue: (r) => r.instrument_type,
      render: (r) => <span className="text-[var(--text-muted)]">{TYPE_LABELS[r.instrument_type] ?? r.instrument_type}</span>,
    },
    {
      key: 'category', label: 'Category', sortable: true,
      sortValue: (r) => r.catName,
      render: (r) => <span className="text-[var(--text-muted)]">{r.catName}</span>,
    },
    {
      key: 'invested', label: 'Invested', sortable: true,
      sortValue: (r) => r.invested,
      render: (r) => <Money value={r.invested} />,
    },
    {
      key: 'current', label: 'Current', sortable: true,
      sortValue: (r) => r.current,
      dataBar: { value: (r) => r.current || null },
      render: (r) => <Money value={r.current} />,
    },
    {
      key: 'gain', label: 'Gain (₹)', sortable: true,
      sortValue: (r) => r.gain,
      dataBar: { value: (r) => r.gain, mode: 'diverging' },
      render: (r) => (
        <span className={`font-medium ${r.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
          {r.gain >= 0 ? '+' : ''}<Money value={r.gain} />
        </span>
      ),
    },
    {
      key: 'gainPct', label: 'Gain %', sortable: true,
      sortValue: (r) => r.gainPct ?? -Infinity,
      render: (r) => (
        <span className={`font-medium ${r.gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
          {r.gainPct !== null ? `${r.gain >= 0 ? '+' : ''}${r.gainPct.toFixed(1)}%` : '—'}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.instrument_id}
      defaultSortCol="gainPct"
      defaultSortDir="desc"
      searchPlaceholder="Search holdings…"
      minWidth="min-w-[640px]"
      emptyState="No holdings found"
    />
  )
}
