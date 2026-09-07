import { getJson, postJson, toQueryString } from './http'
import type { BondCouponDue, MaturingBond } from '../types/domain'

export const bondDetailsApi = {
  async listMaturing(householdId: number, days = 180): Promise<MaturingBond[]> {
    const q = toQueryString({ household_id: householdId, days })
    const data = await getJson<{ maturing: MaturingBond[] }>(`/api/bond-details/maturing?${q}`)
    return data.maturing
  },
  async listCouponsDue(householdId: number, asOf?: string): Promise<BondCouponDue[]> {
    const q = toQueryString({ household_id: householdId, ...(asOf ? { as_of: asOf } : {}) })
    const data = await getJson<{ as_of: string; due: BondCouponDue[] }>(`/api/alerts/bond-coupons-due?${q}`)
    return data.due
  },
  async markCouponReceived(bondId: number, payload: {
    due_date: string
    received_on?: string
    account_id?: number
    amount?: string
    deduct: boolean
    note?: string
  }) {
    return postJson<{
      transaction_id?: number
      ack_id?: number
      cleared_due_date: string
      mode: 'transaction' | 'ack'
    }>(`/api/bond-details/${bondId}/mark-coupon-received/`, payload)
  },
}
