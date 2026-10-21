import { useMemo } from 'react'
import { Amount } from '../../ui/Amount'
import { Card } from '../../ui/Card'
import { DataTable } from '../../ui/DataTable'
import type { DataTableColumn } from '../../ui/DataTable'
import { Delta } from '../../ui/Delta'
import { MemberAvatar } from '../../ui/MemberAvatar'
import { pct } from './facts'
import type { Fact } from './facts'

type Props = {
  rows: Fact[]
  selected: Set<string>
  onToggle: (holding: string) => void
}

type Line = {
  holding: string; type: string; classification: string; members: string[]
  value: number; invested: number
}

/** Every holding in the current view (summed across the selected members); a row
 *  toggles it in the holding filter. Doubles as the table view of the charts. */
export function FactsTable({ rows, selected, onToggle }: Props) {
  const lines = useMemo(() => {
    const map = new Map<string, Line>()
    for (const r of rows) {
      const key = `${r.holding}|${r.type}`
      const l = map.get(key) ?? { holding: r.holding, type: r.type, classification: r.classification, members: [], value: 0, invested: 0 }
      l.value += r.value
      l.invested += r.invested
      if (!l.members.includes(r.member)) l.members.push(r.member)
      map.set(key, l)
    }
    return [...map.values()]
  }, [rows])
  const total = lines.reduce((s, l) => s + l.value, 0)
  const gainPct = (l: Line) => (l.invested > 0 ? ((l.value - l.invested) / l.invested) * 100 : null)

  const columns: DataTableColumn<Line>[] = [
    { key: 'holding', label: 'Holding', sortable: true, sortValue: (l) => l.holding.toLowerCase(), mobile: 'title',
      render: (l) => <span className="block max-w-[18rem] truncate text-ink">{l.holding}</span> },
    { key: 'type', label: 'Type · class', mobile: 'subtitle',
      render: (l) => <span className="text-ink-2">{l.type} <span className="text-ink-muted">· {l.classification}</span></span> },
    { key: 'members', label: 'Members', mobile: 'hide', render: (l) => <MemberAvatar name={l.members.join(', ')} /> },
    { key: 'value', label: 'Value', align: 'right', sortable: true, sortValue: (l) => l.value, mobile: 'value',
      render: (l) => <Amount value={l.value} format="compact" /> },
    { key: 'invested', label: 'Invested', align: 'right', sortable: true, sortValue: (l) => l.invested, mobile: 'hide',
      render: (l) => <Amount value={l.invested} format="compact" tone="muted" /> },
    { key: 'gain', label: 'Gain %', align: 'right', sortable: true, sortValue: gainPct, mobile: 'meta',
      render: (l) => <Delta value={gainPct(l)} /> },
    { key: 'share', label: 'Share', align: 'right', sortable: true, sortValue: (l) => l.value, mobile: 'hide',
      render: (l) => <span className="text-ink-muted">{pct(l.value, total).toFixed(1)}%</span> },
  ]

  return (
    <Card title={`Holdings in view (${lines.length})`} subtitle="Select a row to filter by it" flush>
      <div className="px-4 pb-4 md:px-6 md:pb-6">
        <DataTable
          ariaLabel="Holdings in view"
          columns={columns}
          rows={lines}
          rowKey={(l) => `${l.holding}|${l.type}`}
          defaultSortCol="value"
          defaultSortDir="desc"
          onRowClick={(l) => onToggle(l.holding)}
          rowClassName={(l) => (selected.has(l.holding) ? 'bg-accent-subtle' : '')}
          emptyState="Nothing in this view"
          maxHeight="32rem"
        />
      </div>
    </Card>
  )
}
