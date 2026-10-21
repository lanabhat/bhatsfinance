import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarClock, CheckCircle2, ClipboardCheck, Coins, Link2, Mail, MessageSquare, Repeat, ShieldAlert, Umbrella } from 'lucide-react'
import { getJson, toQueryString } from '../../api/http'
import { useAuth } from '../../context/AuthContext'
import { fmtCount } from '../../lib/fmt'
import { FundMatchSheet } from '../allocation/FundMatchSheet'
import { Amount } from '../ui/Amount'
import { Badge } from '../ui/Badge'
import type { BadgeTone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { DateText } from '../ui/DateText'
import { EmptyState } from '../ui/EmptyState'
import { SectionLink } from '../ui/SectionHeader'
import { Sheet } from '../ui/Sheet'
import { buildAttentionItems } from './attentionItems'
import { BondCouponsCard } from './BondCouponsCard'
import { MaturingBondsCard } from './MaturingBondsCard'
import { MaturingFDsCard } from './MaturingFDsCard'
import { MissedPremiumsCard } from './MissedPremiumsCard'
import { MissedRDsCard } from './MissedRDsCard'
import { MissedSipsCard } from './MissedSipsCard'
import type {
  AttentionCounts, BondCouponDue, InsuranceSummary, MaturingBond, MaturingFD,
  MissedPremiumAlert, MissedRDAlert, MissedSipAlert, OptionItem,
} from '../../types/domain'

type Props = {
  householdId: number
  onNavigate: (route: string) => void
  /** Re-fetch the dashboard after something was marked paid/received/linked. */
  onChanged: () => void | Promise<void>
  accountOptions: OptionItem[]
  maturingFDs: MaturingFD[]
  maturingBonds: MaturingBond[]
  maturingWindowDays: number
  bondCouponsDue: BondCouponDue[]
  onCouponsChanged: () => void | Promise<void>
  missedSip: MissedSipAlert[]
  missedRD: MissedRDAlert[]
  missedPremiums: MissedPremiumAlert[]
  insurance: InsuranceSummary | null
}

type Row = {
  key: string
  icon: ReactNode
  text: ReactNode
  detail?: ReactNode
  count: number
  tone: BadgeTone
  onReview: () => void
}

type SheetKey = 'maturing' | 'coupons' | 'sips' | 'rds' | 'premiums' | 'renewals' | 'funds' | null

const sum = <T,>(xs: T[], get: (x: T) => string | null | undefined) => xs.reduce((s, x) => s + parseFloat(get(x) || '0'), 0)

/**
 * Everything that needs the user, in one list at the top of Home: data to fix, reviews
 * waiting, deposits maturing, payments missed and renewals due. Each row opens the
 * full list (with its mark-paid / ignore actions) in a sheet.
 */
export function ActionItemsCard(p: Props) {
  const { canWrite } = useAuth()
  const [counts, setCounts] = useState<AttentionCounts | null>(null)
  const [open, setOpen] = useState<SheetKey>(null)

  const loadCounts = useCallback(() => {
    getJson<AttentionCounts>(`/api/attention?${toQueryString({ household_id: p.householdId })}`)
      .then(setCounts)
      .catch(() => setCounts(null))
  }, [p.householdId])
  useEffect(() => { loadCounts() }, [loadCounts])

  const attention = counts
    ? buildAttentionItems(counts, { onNavigate: p.onNavigate, openFundMatch: () => setOpen('funds'), canWrite })
    : []
  const attentionIcon = (key: string) =>
    key === 'funds' ? <Link2 /> : key.startsWith('sms') ? <MessageSquare /> : key === 'gmail' ? <Mail /> : <ClipboardCheck />

  const maturing = [...p.maturingFDs.map((f) => f.days_remaining), ...p.maturingBonds.map((b) => b.days_remaining)]
  const soonest = maturing.length ? Math.min(...maturing) : null
  const renewals = p.insurance?.upcoming_renewals ?? []

  const rows: Row[] = [
    ...(p.missedPremiums.length ? [{
      key: 'premiums', icon: <ShieldAlert />, count: p.missedPremiums.length, tone: 'danger' as const,
      text: `${fmtCount(p.missedPremiums.length)} insurance premium${p.missedPremiums.length === 1 ? '' : 's'} missed`,
      detail: <>Total <Amount value={sum(p.missedPremiums, (x) => x.premium_amount)} format="compact" /></>,
      onReview: () => setOpen('premiums'),
    }] : []),
    ...(p.missedSip.length ? [{
      key: 'sips', icon: <Repeat />, count: p.missedSip.length, tone: 'danger' as const,
      text: `${fmtCount(p.missedSip.length)} SIP instalment${p.missedSip.length === 1 ? '' : 's'} not recorded`,
      detail: <>Total <Amount value={sum(p.missedSip, (x) => x.expected_amount)} format="compact" /></>,
      onReview: () => setOpen('sips'),
    }] : []),
    ...(p.missedRD.length ? [{
      key: 'rds', icon: <Repeat />, count: p.missedRD.length, tone: 'danger' as const,
      text: `${fmtCount(p.missedRD.length)} RD instalment${p.missedRD.length === 1 ? '' : 's'} not recorded`,
      detail: <>Total <Amount value={sum(p.missedRD, (x) => x.expected_amount)} format="compact" /></>,
      onReview: () => setOpen('rds'),
    }] : []),
    ...(maturing.length ? [{
      key: 'maturing', icon: <CalendarClock />, count: maturing.length, tone: (soonest !== null && soonest <= 30 ? 'warning' : 'neutral') as BadgeTone,
      text: `${fmtCount(maturing.length)} deposit${maturing.length === 1 ? '' : 's'} maturing in the next ${p.maturingWindowDays} days`,
      detail: soonest !== null ? (soonest === 0 ? 'First one matures today' : `First one in ${soonest} day${soonest === 1 ? '' : 's'}`) : undefined,
      onReview: () => setOpen('maturing'),
    }] : []),
    ...(p.bondCouponsDue.length ? [{
      key: 'coupons', icon: <Coins />, count: p.bondCouponsDue.length, tone: 'neutral' as const,
      text: `${fmtCount(p.bondCouponsDue.length)} bond coupon${p.bondCouponsDue.length === 1 ? '' : 's'} to confirm`,
      detail: <>Total <Amount value={sum(p.bondCouponsDue, (x) => x.coupon_amount)} format="compact" /></>,
      onReview: () => setOpen('coupons'),
    }] : []),
    ...(renewals.length ? [{
      key: 'renewals', icon: <Umbrella />, count: renewals.length, tone: 'neutral' as const,
      text: `${fmtCount(renewals.length)} insurance renewal${renewals.length === 1 ? '' : 's'} in the next 60 days`,
      detail: <>Next on <DateText value={renewals[0].due_date} format="short" /></>,
      onReview: () => setOpen('renewals'),
    }] : []),
    ...attention.map((a) => ({
      key: a.key, icon: attentionIcon(a.key), count: a.count, tone: 'neutral' as const, text: a.text,
      detail: a.days && a.days.length > 0 ? (
        <span className="mt-1 flex flex-wrap gap-2">
          {a.days.map((d) => (
            <Chip key={d.date} size="sm" onClick={d.onClick} title={`Review the SMS from that day`}>
              <DateText value={d.date} format="short" /> · {d.count}
            </Chip>
          ))}
        </span>
      ) : a.detail,
      onReview: a.onReview,
    })),
  ]

  const refreshAll = async () => { loadCounts(); await p.onChanged() }
  const close = () => setOpen(null)

  return (
    <Card title="Action items" subtitle={rows.length ? undefined : 'Nothing needs you right now.'}
      actions={rows.length ? <Badge tone="neutral">{rows.length}</Badge> : undefined} flush={rows.length > 0}>
      {rows.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title="You’re all caught up" description="Missed payments, maturities and items to review will show up here." />
      ) : (
        <ul className="m-0 list-none divide-y divide-line p-0">
          {rows.map((r) => (
            <li key={r.key} className="flex min-w-0 items-start gap-3 px-4 py-3 md:px-6">
              <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-muted [&>svg]:h-4 [&>svg]:w-4" aria-hidden>{r.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{r.text}</p>
                {r.detail && <div className="mt-1 text-sm text-ink-muted">{r.detail}</div>}
              </div>
              <Badge tone={r.tone} className="mt-1">{fmtCount(r.count)}</Badge>
              <Button variant="ghost" size="sm" onClick={r.onReview} className="text-accent">Review</Button>
            </li>
          ))}
        </ul>
      )}

      {open === 'maturing' && (
        <Sheet title="Maturing soon" subtitle={`Next ${p.maturingWindowDays} days`} onClose={close} wide>
          <div className="grid gap-6">
            {p.maturingFDs.length > 0 && <MaturingFDsCard embedded items={p.maturingFDs} windowDays={p.maturingWindowDays} />}
            {p.maturingBonds.length > 0 && <MaturingBondsCard embedded items={p.maturingBonds} windowDays={p.maturingWindowDays} />}
          </div>
        </Sheet>
      )}
      {open === 'coupons' && (
        <Sheet title="Bond coupons to confirm" onClose={close} wide>
          <BondCouponsCard embedded items={p.bondCouponsDue} accountOptions={p.accountOptions} onReceived={p.onCouponsChanged} />
        </Sheet>
      )}
      {open === 'sips' && (
        <Sheet title="Missed SIPs" onClose={close} wide>
          <MissedSipsCard embedded items={p.missedSip} accountOptions={p.accountOptions} onPaid={p.onChanged} />
        </Sheet>
      )}
      {open === 'rds' && (
        <Sheet title="Missed RD instalments" onClose={close} wide>
          <MissedRDsCard embedded items={p.missedRD} accountOptions={p.accountOptions} onPaid={p.onChanged} />
        </Sheet>
      )}
      {open === 'premiums' && (
        <Sheet title="Missed insurance premiums" onClose={close} wide>
          <MissedPremiumsCard embedded items={p.missedPremiums} accountOptions={p.accountOptions} onPaid={p.onChanged} />
        </Sheet>
      )}
      {open === 'renewals' && (
        <Sheet title="Insurance renewals" subtitle="Next 60 days" onClose={close} footer={<SectionLink href="#/insurance">All policies</SectionLink>}>
          <ul className="m-0 list-none divide-y divide-line p-0">
            {renewals.map((r) => (
              <li key={r.policy_id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.policy_name}</p>
                  <p className="truncate text-sm text-ink-muted">{r.insurer_name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Amount value={r.premium_amount} className="text-sm font-semibold" />
                  <p className="text-xs text-ink-muted">Due <DateText value={r.due_date} format="short" /></p>
                </div>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      {open === 'funds' && (
        <Sheet title="Link funds to daily NAV" onClose={close} wide>
          <FundMatchSheet householdId={p.householdId} onDone={async () => { close(); await refreshAll() }} onCancel={close} />
        </Sheet>
      )}
    </Card>
  )
}
