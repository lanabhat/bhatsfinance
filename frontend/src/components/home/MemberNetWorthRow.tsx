import { useMaskedFmt } from '../common/Money'
import type { MemberNetWorth } from '../../types/domain'


const RELATION_COLOR: Record<string, string> = {
  self: 'bg-indigo-100 text-indigo-700',
  spouse: 'bg-violet-100 text-violet-700',
  child: 'bg-sky-100 text-sky-700',
  parent: 'bg-amber-100 text-amber-700',
  other: 'bg-slate-100 text-slate-600',
}

type Props = {
  member: MemberNetWorth
  householdTotal?: number
}

export function MemberNetWorthRow({ member, householdTotal }: Props) {
  const fmtINR = useMaskedFmt()
  const colorClass = RELATION_COLOR[member.relation_type] ?? RELATION_COLOR.other
  const initials = member.member_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const excluded = !member.include_in_networth
  const memberValue = parseFloat(member.networth)
  const sharePct = householdTotal && householdTotal > 0
    ? (memberValue / householdTotal) * 100
    : null

  return (
    <div className={`flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm ${excluded ? 'opacity-50 grayscale' : ''}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{member.member_name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${colorClass}`}>
            {member.relation_type}
          </span>
          {excluded && (
            <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              excluded
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-base font-bold text-slate-900">{fmtINR(member.networth)}</p>
        {sharePct !== null && (
          <p className="text-xs text-slate-400">{sharePct.toFixed(1)}% of household</p>
        )}
      </div>
    </div>
  )
}
