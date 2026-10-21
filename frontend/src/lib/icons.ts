/**
 * The one icon map. Every page draws asset types, account types and spend categories
 * with these lucide line icons — never emoji (data the user typed, like a custom spend
 * category's emoji, is shown only where they edit it).
 */
import {
  Banknote, Building2, Car, CircleDollarSign, Coins, CreditCard, FileText, GraduationCap,
  HandCoins, HeartPulse, Home, Landmark, Layers, LineChart, Lightbulb, PiggyBank, Receipt,
  Repeat, ShieldCheck, ShoppingBag, Shuffle, Tag, TrendingUp, Clapperboard, Utensils, Wallet,
  Umbrella, AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ASSET_TYPE_ICON: Record<string, LucideIcon> = {
  mutual_fund: LineChart, sip: Repeat, equity: TrendingUp, etf: Layers,
  fd: Landmark, rd: PiggyBank, bond: FileText, lending: HandCoins,
  epf: ShieldCheck, ppf: ShieldCheck, nps: ShieldCheck, insurance: Umbrella,
  gold: Coins, real_estate: Home, vehicle: Car,
  cash: Banknote, savings: Wallet,
  liability: AlertTriangle, liability_cc: CreditCard,
}

const ACCOUNT_TYPE_ICON: Record<string, LucideIcon> = {
  bank: Landmark, broker: TrendingUp, pf: ShieldCheck, loan: Building2,
  credit_card: CreditCard, insurance: Umbrella, cash: Banknote,
}

const SPEND_CATEGORY_ICON: Record<string, LucideIcon> = {
  food: Utensils, transport: Car, shopping: ShoppingBag, utilities: Lightbulb,
  health: HeartPulse, entertainment: Clapperboard, education: GraduationCap,
  rent: Home, emi: Landmark, transfer: Shuffle, income: CircleDollarSign,
}

export const assetTypeIcon = (type: string): LucideIcon => ASSET_TYPE_ICON[type] ?? Wallet
export const accountTypeIcon = (type: string): LucideIcon => ACCOUNT_TYPE_ICON[type] ?? Wallet
export const spendCategoryIcon = (key: string): LucideIcon => SPEND_CATEGORY_ICON[key] ?? Tag
export const receiptIcon: LucideIcon = Receipt
