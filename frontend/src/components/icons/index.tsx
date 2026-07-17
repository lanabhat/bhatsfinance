import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function NetWorthIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="13" width="3" height="7" rx="1" />
      <rect x="10.5" y="9" width="3" height="11" rx="1" />
      <rect x="17" y="5" width="3" height="15" rx="1" />
    </svg>
  )
}

export function InvestmentsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 15 L9 11 L13 13 L20 6" />
      <path d="M15 6 H20 V11" />
    </svg>
  )
}

export function SavingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6.5 12 h.01" />
      <path d="M17.5 12 h.01" />
    </svg>
  )
}

export function ExpensesIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3 h12 v18 l-2 -1.6 l-2 1.6 l-2 -1.6 l-2 1.6 l-2 -1.6 l-2 1.6 Z" />
      <path d="M9 8.5 h6" />
      <path d="M9 12.5 h6" />
    </svg>
  )
}

export function AccountsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 9 L12 4 L21 9" />
      <path d="M5 10 V18" />
      <path d="M9.5 10 V18" />
      <path d="M14.5 10 V18" />
      <path d="M19 10 V18" />
      <path d="M4 20 H20" />
    </svg>
  )
}

export function InsuranceIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 L20 6 V11 C20 16 16.5 19 12 21 C7.5 19 4 16 4 11 V6 Z" />
      <path d="M9 12 l2 2 l4 -4" />
    </svg>
  )
}

export function GoldIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="13" width="8" height="6" rx="1" />
      <rect x="13" y="13" width="8" height="6" rx="1" />
      <rect x="8" y="5.5" width="8" height="6" rx="1" />
    </svg>
  )
}

export function RealEstateIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 11 L12 4 L21 11" />
      <path d="M6 10 V20 H18 V10" />
      <path d="M10 20 V15 H14 V20" />
    </svg>
  )
}

export function MutualFundsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12 V4" />
      <path d="M12 12 L18.9 16" />
    </svg>
  )
}

export function FamilyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="6" r="2.5" />
      <path d="M4 20 v-5 a4 4 0 0 1 8 0 v5" />
      <circle cx="16.5" cy="9" r="2" />
      <path d="M13.5 20 v-3.5 a3 3 0 0 1 6 0 v3.5" />
    </svg>
  )
}

export function TagsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M11.6 3.5 H19 a1.5 1.5 0 0 1 1.5 1.5 V12.4 a1.5 1.5 0 0 1 -.44 1.06 l-6.5 6.5 a1.5 1.5 0 0 1 -2.12 0 l-6.9 -6.9 a1.5 1.5 0 0 1 0 -2.12 l6.5 -6.5 a1.5 1.5 0 0 1 1.06 -.44 Z" />
      <circle cx="16.3" cy="7.7" r="1.3" />
    </svg>
  )
}

export function LedgerIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5 H16.5 L19 6 V20.5 H6 Z" />
      <path d="M16.5 3.5 V6 H19" />
      <path d="M9 11 H15" />
      <path d="M9 14.5 H15" />
      <path d="M9 18 H13" />
    </svg>
  )
}

export function ValuationIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 19 H20" />
      <path d="M4 19 V6" />
      <path d="M4 15 L9.5 9.5 L13 12.5 L20 5.5" />
      <path d="M15 5.5 H20 V10.5" />
    </svg>
  )
}

export function TaxIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5 H14 L18 7.5 V20.5 H6 Z" />
      <path d="M14 3.5 V7.5 H18" />
      <path d="M9.5 13.5 H14.5" />
      <path d="M12 11.5 V16" />
      <path d="M9.5 17 H14.5" />
    </svg>
  )
}

export function ReportsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 15 V11" />
      <path d="M12 15 V8" />
      <path d="M16 15 V12.5" />
    </svg>
  )
}

export function AlertsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 10 a6 6 0 0 1 12 0 c0 4 1.5 5.5 1.5 5.5 H4.5 S6 14 6 10 Z" />
      <path d="M10 19.5 a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function ImportIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 V15" />
      <path d="M7.5 10.5 L12 15 L16.5 10.5" />
      <path d="M4.5 18 V19.5 A1 1 0 0 0 5.5 20.5 H18.5 A1 1 0 0 0 19.5 19.5 V18" />
    </svg>
  )
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4.5 7 L12 12.5 L19.5 7" />
    </svg>
  )
}

export function MessageIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 5.5 H19.5 V16 H9.5 L6 19 V16 H4.5 Z" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.5 V6 M12 18 V20.5 M20.5 12 H18 M6 12 H3.5 M17.6 6.4 L15.9 8.1 M8.1 15.9 L6.4 17.6 M17.6 17.6 L15.9 15.9 M8.1 8.1 L6.4 6.4" />
    </svg>
  )
}

export function HelpIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.3 a2.5 2.5 0 1 1 3.7 2.2 c-.9 .5 -1.2 1 -1.2 1.9" />
      <path d="M12 17 h.01" />
    </svg>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20 v-2 a5.5 5.5 0 0 1 11 0 v2" />
      <circle cx="17.5" cy="9.5" r="2.2" />
      <path d="M14.8 20 v-1.5 a4 4 0 0 1 8 0 V20" />
    </svg>
  )
}
