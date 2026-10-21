import { X } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import {
  TagsIcon, LedgerIcon, ValuationIcon, ExpensesIcon, MutualFundsIcon,
  AlertsIcon, TaxIcon, InsuranceIcon, ReportsIcon, FamilyIcon, ImportIcon,
  MailIcon, MessageIcon, SettingsIcon, HelpIcon, UsersIcon, InvestmentsIcon, NetWorthIcon,
  AccountsIcon,
} from '../icons'

type SecondaryRoute = {
  key: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

type RouteGroup = {
  label: string
  items: SecondaryRoute[]
}

const BASE_GROUPS: RouteGroup[] = [
  {
    label: 'Portfolio',
    items: [
      { key: 'accounts', label: 'Accounts', icon: AccountsIcon },
      { key: 'instruments', label: 'Instruments', icon: TagsIcon },
      { key: 'ledger', label: 'Ledger', icon: LedgerIcon },
      { key: 'valuation', label: 'Valuation', icon: ValuationIcon },
      { key: 'allocation', label: 'Asset Allocation', icon: InvestmentsIcon },
      { key: 'diversification', label: 'Diversification', icon: NetWorthIcon },
      { key: 'fund-performance', label: 'Fund Performance', icon: MutualFundsIcon },
      { key: 'spend-trends', label: 'Spend Trends', icon: ExpensesIcon },
      { key: 'analytics', label: 'Analytics', icon: MutualFundsIcon },
      { key: 'alerts', label: 'Alerts', icon: AlertsIcon },
      { key: 'tax', label: 'Tax', icon: TaxIcon },
      { key: 'insurance', label: 'Insurance', icon: InsuranceIcon },
      { key: 'reports', label: 'Reports', icon: ReportsIcon },
    ],
  },
  {
    label: 'Setup',
    items: [
      { key: 'household', label: 'Household & Members', icon: FamilyIcon },
      { key: 'import', label: 'Import', icon: ImportIcon },
      { key: 'gmail', label: 'Gmail', icon: MailIcon },
      { key: 'sms', label: 'SMS', icon: MessageIcon },
    ],
  },
  {
    label: 'Account',
    items: [
      { key: 'settings', label: 'Settings', icon: SettingsIcon },
      { key: 'help', label: 'Help', icon: HelpIcon },
    ],
  },
]

type Props = {
  open: boolean
  onClose: () => void
  onNavigate: (route: string) => void
  currentRoute: string
  role?: string
}

export function MoreSheet({ open, onClose, onNavigate, currentRoute, role }: Props) {
  if (!open) return null

  const groups = role === 'super_admin'
    ? [...BASE_GROUPS, { label: 'Admin', items: [{ key: 'admin', label: 'User Management', icon: UsersIcon }] }]
    : BASE_GROUPS

  return (
    <>
      {/* Backdrop — only covers the content area on desktop (click to dismiss); full screen on mobile */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Desktop: overlay panel that takes over the sidebar's position exactly ── */}
      <div
        className={`fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-line bg-surface shadow-[var(--shadow-modal)] md:flex`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <p className="text-sm font-semibold text-ink">More</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Close"
          ><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-3 text-xs font-semibold text-ink-muted">{group.label}</p>
              <div className="grid gap-1">
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors ${
                      currentRoute === item.key
                        ? 'bg-accent-subtle text-accent'
                        : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                    }`}
                    onClick={() => { onNavigate(item.key); onClose() }}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile: full-screen panel that takes over the entire viewport (replaces bottom nav view) ── */}
      <div className="fixed inset-0 z-50 flex flex-col bg-surface md:hidden">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <p className="text-base font-semibold text-ink">More</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Close"
          ><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-4 pb-24">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-xs font-semibold text-ink-muted">{group.label}</p>
              <div className="grid gap-1">
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors ${
                      currentRoute === item.key
                        ? 'bg-accent-subtle text-accent'
                        : 'text-ink-2 hover:bg-surface-2'
                    }`}
                    onClick={() => { onNavigate(item.key); onClose() }}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
