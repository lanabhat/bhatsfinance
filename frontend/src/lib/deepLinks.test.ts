import { describe, expect, it } from 'vitest'
import { accountsLink, holdingsLink, readDeepLink } from './deepLinks'

describe('deep links', () => {
  it('round-trips filters, including repeated keys and awkward names', () => {
    const link = holdingsLink({ type: ['FD', 'Mutual Fund'], owner: ['Anushree L & Co'], category: ['(none)'] }, 'inv:12')
    expect(readDeepLink(['type', 'owner', 'category'], link)).toEqual({
      filters: { type: ['FD', 'Mutual Fund'], owner: ['Anushree L & Co'], category: ['(none)'] },
      open: 'inv:12',
    })
  })

  it('ignores keys the page does not filter on', () => {
    expect(readDeepLink(['type'], '#/holdings?type=FD&evil=1')).toEqual({ filters: { type: ['FD'] }, open: null })
  })

  it('returns null without a query, and builds a bare route without filters', () => {
    expect(readDeepLink(['type'], '#/accounts')).toBeNull()
    expect(accountsLink()).toBe('#/accounts')
    expect(accountsLink({}, 7)).toBe('#/accounts?open=7')
  })
})
