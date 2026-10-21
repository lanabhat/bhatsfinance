import { useState } from 'react'
import { Eye, Landmark, LineChart } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { accountsLink, holdingsLink } from '../../lib/deepLinks'
import { useMemberScope } from '../../context/MemberScopeContext'
import { Amount } from '../ui/Amount'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ClickHint } from '../ui/ClickHint'
import { DetailDrawer } from '../ui/DetailDrawer'
import { EmptyState } from '../ui/EmptyState'
import { MemberAvatar } from '../ui/MemberAvatar'
import { ProgressBar } from '../ui/ProgressBar'
import { SectionHeader } from '../ui/SectionHeader'
import { Skeleton } from '../ui/Skeleton'
import { MemberWealthBreakdown } from './MemberWealthBreakdown'
import type { AssetCategory, DashboardHolding, MemberAccount, MemberNetWorth, MutualFundDetails } from '../../types/domain'

type Props = {
  members: MemberNetWorth[]
  householdTotal: number
  holdingsByMember: Record<number, DashboardHolding[]>
  accountsByMember: Record<number, MemberAccount[]>
  categories: AssetCategory[]
  mfDetailsByInvestment: Map<number, MutualFundDetails>
}

const relationLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, ' ')

/** "By member": a card per member (avatar, net worth, share of household); a click opens their breakdown. */
export function MemberCards({ members, householdTotal, holdingsByMember, accountsByMember, categories, mfDetailsByInvestment }: Props) {
  const [openId, setOpenId] = useState<number | null>(null)
  const { setMemberId } = useMemberScope()
  const open = members.find((m) => m.member_id === openId) ?? null
  // The Owner filter on Investments/Accounts matches the app's member labels.
  const { members: memberOptions } = useApp()
  const ownerLabel = (m: MemberNetWorth) => memberOptions.find((o) => o.id === m.member_id)?.label ?? m.member_name
  const go = (href: string) => { setOpenId(null); window.location.hash = href.slice(1) }

  return (
    <section className="grid gap-4" aria-label="By member">
      <SectionHeader title="By member" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => {
          const value = parseFloat(m.networth)
          const share = householdTotal > 0 ? (value / householdTotal) * 100 : 0
          const excluded = !m.include_in_networth
          return (
            <button
              key={m.member_id}
              type="button"
              onClick={() => setOpenId(m.member_id)}
              title={`Open ${m.member_name}’s breakdown`}
              className="group/click relative grid min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:p-6"
            >
              <ClickHint />
              <span className="flex min-w-0 items-center justify-between gap-2 pr-6">
                <MemberAvatar name={m.member_name} photo={m.photo} size="lg" caption={relationLabel(m.relation_type)} />
                {excluded && <Badge tone="neutral" title="Not counted in the household net worth">Excluded</Badge>}
              </span>
              <Amount value={value} format="compact" className="text-xl font-semibold text-ink" />
              <ProgressBar value={excluded ? 0 : share} showPercent={false} />
              <span className="text-sm text-ink-muted">{excluded ? 'Not counted in household total' : `${share.toFixed(1)}% of household`}</span>
            </button>
          )
        })}
      </div>

      <DetailDrawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.member_name ?? ''}
        subtitle={open ? relationLabel(open.relation_type) : undefined}
        amount={open ? <Amount value={open.networth} format="full" /> : undefined}
        amountCaption={open && householdTotal > 0 ? `${((parseFloat(open.networth) / householdTotal) * 100).toFixed(1)}% of household net worth` : undefined}
        badges={open && !open.include_in_networth ? <Badge>Excluded from total</Badge> : undefined}
        actions={open ? (
          <>
            <Button variant="secondary" icon={<LineChart />} onClick={() => go(holdingsLink({ owner: [ownerLabel(open)] }))}>View investments</Button>
            <Button variant="secondary" icon={<Landmark />} onClick={() => go(accountsLink({ owner: [ownerLabel(open)] }))}>View accounts</Button>
            <Button variant="ghost" icon={<Eye />} onClick={() => { setMemberId(open.member_id); setOpenId(null) }}>
              View the app as {open.member_name}
            </Button>
          </>
        ) : undefined}
      >
        {open && (holdingsByMember[open.member_id] === undefined ? (
          <Skeleton variant="table" rows={4} />
        ) : (holdingsByMember[open.member_id].length === 0 && (accountsByMember[open.member_id] ?? []).length === 0) ? (
          <EmptyState title="Nothing recorded yet" description={`No holdings or accounts are recorded for ${open.member_name}.`} />
        ) : (
          <MemberWealthBreakdown
            memberName={open.member_name}
            holdings={holdingsByMember[open.member_id]}
            accounts={accountsByMember[open.member_id] ?? []}
            memberTotal={parseFloat(open.networth)}
            householdTotal={householdTotal}
            categories={categories}
            mfDetailsByInvestment={mfDetailsByInvestment}
          />
        ))}
      </DetailDrawer>
    </section>
  )
}
