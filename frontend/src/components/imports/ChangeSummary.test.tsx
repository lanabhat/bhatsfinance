import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PrivacyProvider } from '../../context/PrivacyContext'
import { ChangeSummary } from './ChangeSummary'
import type { ChangeItem, ChangeSummary as Summary } from '../../api/importApi'

const item = (over: Partial<ChangeItem>): ChangeItem => ({
  key: over.name ?? 'k', kind: 'holding', name: 'X', type: 'mutual_fund', member: 'Anushree L', status: 'changed',
  value_before: '0', value_after: '0', change: '0', units_before: null, units_after: null, last_valued_before: null, ...over,
})

const summary = (items: ChangeItem[], unchanged = 0): Summary => {
  const before = items.reduce((s, i) => s + Number(i.value_before), 0)
  const after = items.reduce((s, i) => s + Number(i.value_after), 0)
  return { items, unchanged_count: unchanged, total_before: String(before), total_after: String(after), net_change: String(after - before) }
}

const renderSummary = (s: Summary, fileDate?: string) =>
  render(<PrivacyProvider><ChangeSummary summary={s} fileDate={fileDate} /></PrivacyProvider>)

describe('ChangeSummary', () => {
  it('shows each change with before → after, units, badges and the unchanged count', () => {
    renderSummary(summary([
      item({ name: 'Parag Parikh Flexi Cap', value_before: '100000', value_after: '112000', change: '12000', units_before: '1000', units_after: '1100' }),
      item({ name: 'ZEROD NIRL ETF', type: 'etf', status: 'new', value_after: '52180', change: '52180', units_after: '450' }),
      item({ name: 'SBI FD 4549', type: 'fd', status: 'closed', value_before: '100000', change: '-100000' }),
    ], 12))
    expect(screen.getByText('Parag Parikh Flexi Cap')).toBeInTheDocument()
    expect(screen.getByText(/units 1,000 → 1,100/)).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByText('12 other holdings and accounts unchanged')).toBeInTheDocument()
    expect(screen.getByText(/across 3 items/)).toBeInTheDocument()
  })

  it('flags holdings already valued after the file date', () => {
    renderSummary(summary([item({ name: 'ITC', value_before: '1', value_after: '2', change: '1', last_valued_before: '2026-10-09' })]), '2026-10-01')
    expect(screen.getByText(/Already valued on 2026-10-09/)).toBeInTheDocument()
  })

  it('says so when nothing changes, and folds long lists', async () => {
    const { unmount } = renderSummary(summary([], 40))
    expect(screen.getByText('No holding or account values change.')).toBeInTheDocument()
    unmount()

    const many = Array.from({ length: 35 }, (_, i) => item({ name: `Fund ${i}`, key: `k${i}`, value_before: '1', value_after: '2', change: '1' }))
    renderSummary(summary(many))
    expect(screen.queryByText('Fund 34')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all 35' }))
    expect(screen.getByText('Fund 34')).toBeInTheDocument()
  })
})
