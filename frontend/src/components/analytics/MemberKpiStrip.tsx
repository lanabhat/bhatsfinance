import { Money } from '../common/Money'
import type { MemberNetWorth, DashboardHolding } from '../../types/domain'

type Props = {
  members: MemberNetWorth[]
  holdingsByMember: Record<number, DashboardHolding[]>
  selectedMemberId: number | null
  onSelect: (id: number | null) => void
}

export function MemberKpiStrip({ members, holdingsByMember, selectedMemberId, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      {members.filter(m => m.include_in_networth).map(m => {
        const holdings = holdingsByMember[m.member_id] ?? []
        const invested = holdings.reduce((s, h) => s + parseFloat(h.net_invested), 0)
        const current = parseFloat(m.networth)
        const gain = current - invested
        const gainPct = invested > 0 ? (gain / invested) * 100 : null
        const positive = gain >= 0
        const active = selectedMemberId === m.member_id

        return (
          <button
            key={m.member_id}
            type="button"
            onClick={() => onSelect(active ? null : m.member_id)}
            className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition-all ${
              active
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-[var(--border)] bg-[var(--surface)] hover:border-primary-300'
            }`}
          >
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              {m.member_name}
              <span className="ml-1 normal-case font-normal">({m.relation_type})</span>
            </span>
            <span className="text-lg font-bold text-[var(--text)]"><Money value={current} /></span>
            {gainPct !== null && (
              <span className={`text-xs font-medium ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {positive ? '+' : ''}<Money value={gain} /> ({positive ? '+' : ''}{gainPct.toFixed(1)}%)
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
