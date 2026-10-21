import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { X } from 'lucide-react'
import { expenseApi } from '../api/expenseApi'
import { ledgerApi } from '../api/ledgerApi'
import { getJson, toQueryString } from '../api/http'
import { normalizeApiError } from '../hooks/errorUtils'
import { CashFlowChart, type CashFlowBucket, type CashFlowPoint } from '../components/charts/CashFlowChart'
import { ChartCard } from '../components/charts/ChartCard'
import { useChartTheme, ChartTooltip } from '../components/charts/chartTheme'
import { useMaskedFmt } from '../components/common/Money'
import { TxFormFields } from '../components/ledger/TransactionEditForm'
import { blankTxForm, txFormFromTransaction } from '../components/ledger/txForm'
import { Amount } from '../components/ui/Amount'
import { Card } from '../components/ui/Card'
import { DataTable } from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import { DateText } from '../components/ui/DateText'
import { EmptyState } from '../components/ui/EmptyState'
import { FilterBar } from '../components/ui/FilterBar'
import { IconButton } from '../components/ui/Button'
import { ToolbarSelect } from '../components/ui/Input'
import { Notice } from '../components/ui/Notice'
import { PageLayout } from '../components/ui/PageLayout'
import { Sheet } from '../components/ui/Sheet'
import { Skeleton } from '../components/ui/Skeleton'
import { StatCard } from '../components/ui/StatCard'
import { Tabs } from '../components/ui/Tabs'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useMemberScope } from '../context/MemberScopeContext'
import { useErrorToast } from '../hooks/useErrorToast'
import { fmtDateShort, fmtMonth, fmtMonthAxis } from '../lib/fmt'
import { CASHFLOW_COLOR, CASHFLOW_SERIES, FLOW_COLOR, spendCategoryColor } from '../lib/palette'
import type { SpendAnalytics, Transaction } from '../types/domain'

type Props = { householdId: number }

type TrendsTab = 'trends' | 'cashflow'
const TRENDS_TAB_KEY = 'trends:activeTab'
const NO_CASHFLOW: CashFlowPoint[] = []

function loadTrendsTab(): TrendsTab {
  try { return localStorage.getItem(TRENDS_TAB_KEY) === 'cashflow' ? 'cashflow' : 'trends' } catch { return 'trends' }
}

type Granularity = 'day' | 'week' | 'month'

const RANGE_OPTIONS: Record<Granularity, { value: number; label: string }[]> = {
  day: [{ value: 7, label: 'Last 7 days' }, { value: 14, label: 'Last 14 days' }, { value: 30, label: 'Last 30 days' }],
  week: [{ value: 4, label: 'Last 4 weeks' }, { value: 8, label: 'Last 8 weeks' }, { value: 12, label: 'Last 12 weeks' }],
  month: [{ value: 3, label: 'Last 3 months' }, { value: 6, label: 'Last 6 months' }, { value: 12, label: 'Last 12 months' }, { value: 24, label: 'Last 24 months' }],
}
const DEFAULT_PERIODS: Record<Granularity, number> = { day: 30, week: 8, month: 12 }

const SERIES = [
  { key: 'spend', label: 'Spend' },
  { key: 'income', label: 'Income' },
  { key: 'internal_transfer', label: 'Transfer' },
  { key: 'tracking', label: 'Tracking' },
]

// One active drill-down filter for the transaction table below the charts.
type DrillDown =
  | { kind: 'period'; period: string; category?: string; label: string }
  | { kind: 'category'; category: string; label: string }
  | { kind: 'member'; memberId: number | null; label: string }

function periodDateRange(period: string, granularity: Granularity): { start: string; end: string } {
  if (granularity === 'month') {
    const [y, m] = period.split('-').map(Number)
    return { start: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
  }
  if (granularity === 'week') {
    const end = new Date(period + 'T00:00:00Z')
    end.setUTCDate(end.getUTCDate() + 6)
    return { start: period, end: end.toISOString().slice(0, 10) }
  }
  return { start: period, end: period }
}

function periodLabel(period: string, granularity: Granularity): string {
  if (granularity === 'month') return fmtMonth(period)
  if (granularity === 'week') { const { start, end } = periodDateRange(period, granularity); return `${fmtDateShort(start)} – ${fmtDateShort(end)}` }
  return fmtDateShort(period)
}

export function SpendTrendsPage({ householdId }: Props) {
  const [activeTab, setActiveTab] = useState<TrendsTab>(loadTrendsTab)
  const changeTab = (tab: TrendsTab) => {
    setActiveTab(tab)
    try { localStorage.setItem(TRENDS_TAB_KEY, tab) } catch { /* ignore */ }
  }
  const tabs = <Tabs label="Trends view" active={activeTab} onChange={changeTab} tabs={[{ key: 'trends', label: 'Trends' }, { key: 'cashflow', label: 'Cash flow' }]} />
  return activeTab === 'cashflow'
    ? <CashFlowSection householdId={householdId} tabs={tabs} />
    : <TrendsSection householdId={householdId} tabs={tabs} />
}

function TrendsSection({ householdId, tabs }: { householdId: number; tabs: React.ReactNode }) {
  const fmt = useMaskedFmt()
  const ct = useChartTheme()
  const { memberId: scopeMemberId, memberName } = useMemberScope()
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [periods, setPeriods] = useState(DEFAULT_PERIODS.month)
  const analytics = useQuery({
    queryKey: ['spend-analytics', householdId, granularity, periods],
    queryFn: () => expenseApi.fetchSpendAnalytics(householdId, periods, undefined, granularity, periods),
    placeholderData: keepPreviousData,
  })
  const data: SpendAnalytics | null = analytics.data ?? null
  const loading = analytics.isFetching && !data
  const error = analytics.error ? normalizeApiError(analytics.error) : ''
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null)

  const changeGranularity = (g: Granularity) => { setGranularity(g); setPeriods(DEFAULT_PERIODS[g]); setDrillDown(null) }

  // One row per period, a column per classification.
  const chartRows = useMemo(() => {
    if (!data) return []
    const periodSet = new Set(data.by_month_category.map((r) => r.month))
    data.by_month.forEach((r) => periodSet.add(r.month))
    return Array.from(periodSet).sort().map((period) => {
      const row: Record<string, number | string> = { month: period }
      SERIES.forEach((s) => { row[s.key] = data.by_month_category.find((r) => r.month === period && r.category === s.key)?.amount ?? 0 })
      return row
    })
  }, [data])

  const byCls = useMemo(() => Object.fromEntries((data?.by_category ?? []).map((r) => [r.category, r.amount])) as Record<string, number>, [data])
  const totalIncome = byCls.income ?? 0
  const totalSpend = byCls.spend ?? 0
  const netFlow = totalIncome - totalSpend
  const granularityLabel = granularity === 'day' ? 'Daily' : granularity === 'week' ? 'Weekly' : 'Monthly'

  return (
    <PageLayout
      title="Trends"
      description={data ? <>{fmtDateShort(data.window.start)} – {fmtDateShort(data.window.end)}</> : undefined}
      summary={(
        <>
          <StatCard label="Income" loading={loading} value={<Amount value={totalIncome} format="compact" />} />
          <StatCard label="Spend" loading={loading} value={<Amount value={totalSpend} format="compact" />} />
          <StatCard label="Net flow" loading={loading} value={<Amount value={netFlow} format="compact" signed tone="gain" />} subtitle="Income − spend" />
          <StatCard label="Transfers" loading={loading} value={<Amount value={byCls.internal_transfer ?? 0} format="compact" />} subtitle="Between your accounts" />
        </>
      )}
      notices={(
        <>
          {error && <Notice tone="danger" title="Couldn’t load trends">{error}</Notice>}
          {memberName && scopeMemberId !== null && <Notice title={`Showing the whole household`}>Trends aren’t split by member — use “By member” below for {memberName}’s spend.</Notice>}
        </>
      )}
      toolbar={(
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          {tabs}
          <FilterBar
            className="min-w-0 flex-1 md:flex-none"
            controls={(
              <>
                <ToolbarSelect label="View" value={granularity}
                  options={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]}
                  onChange={(v) => changeGranularity(v as Granularity)} />
                <ToolbarSelect label="Range" value={String(periods)}
                  options={RANGE_OPTIONS[granularity].map((o) => ({ value: String(o.value), label: o.label }))}
                  onChange={(v) => { setPeriods(Number(v)); setDrillDown(null) }} />
              </>
            )}
          />
        </div>
      )}
    >
      <ChartCard
        title={`${granularityLabel} breakdown`}
        subtitle="Select a bar to see its transactions"
        loading={loading}
        empty={!loading && chartRows.length === 0 ? { title: 'No transactions in this window' } : null}
        legend={SERIES.map((s) => ({ key: s.key, label: s.label, color: FLOW_COLOR[s.key], value: byCls[s.key] ?? 0 }))}
      >
        <ResponsiveContainer width="100%" height={300} minWidth={0}>
          <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={2}>
            <CartesianGrid {...ct.gridProps} />
            <XAxis dataKey="month" {...ct.xAxis} tickFormatter={(p: string) => (granularity === 'month' ? fmtMonthAxis(p) : fmtDateShort(p))} />
            <YAxis {...ct.yAxisINR} />
            <Tooltip cursor={{ fill: ct.grid, opacity: 0.3 }} content={(p) => <ChartTooltip {...p} fmt={fmt} labelFmt={(l) => periodLabel(l, granularity)} />} />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={FLOW_COLOR[s.key]}
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                isAnimationActive={false}
                onClick={(entry: unknown) => {
                  const row = entry as { month?: string }
                  if (row?.month) setDrillDown({ kind: 'period', period: row.month, category: s.key, label: `${s.label} · ${periodLabel(row.month, granularity)}` })
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SpendCategoryBreakdown householdId={householdId} granularity={granularity} periods={periods}
          onSelectCategory={(category, label) => setDrillDown({ kind: 'category', category, label })} />

        {data && data.by_member.length > 0 && (
          <Card title="Spend by member" subtitle="Select a member to see their spends">
            <BarList
              rows={data.by_member.map((r) => ({ key: String(r.member_id ?? 'none'), label: r.name, value: r.amount, highlight: r.member_id === scopeMemberId }))}
              total={data.total}
              onSelect={(key, label) => setDrillDown({ kind: 'member', memberId: key === 'none' ? null : Number(key), label })}
            />
          </Card>
        )}
      </div>

      {drillDown && data && (
        <DrillDownTable
          householdId={householdId}
          drillDown={drillDown}
          granularity={granularity}
          windowStart={data.window.start}
          windowEnd={data.window.end}
          onClose={() => setDrillDown(null)}
        />
      )}
    </PageLayout>
  )
}

/** Ranked horizontal bars: label · bar · amount · %. Single hue — the labels carry identity. */
function BarList({ rows, total, onSelect, colorOf }: {
  rows: { key: string; label: string; value: number; highlight?: boolean }[]
  total: number
  onSelect: (key: string, label: string) => void
  colorOf?: (key: string) => string
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="m-0 grid list-none gap-1 p-0">
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" onClick={() => onSelect(r.key, r.label)}
            className="grid min-h-11 w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-[var(--radius-md)] px-2 text-left hover:bg-surface-2 sm:grid-cols-[minmax(0,11rem)_1fr_auto_3rem]">
            <span className={r.highlight ? 'truncate text-sm font-semibold text-ink' : 'truncate text-sm text-ink-2'}>{r.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: colorOf?.(r.key) ?? 'var(--primary)' }} />
            </span>
            <Amount value={r.value} format="compact" className="text-right text-sm font-medium text-ink" />
            <span className="hidden text-right text-sm tabular-nums text-ink-muted sm:block">{total > 0 ? `${((r.value / total) * 100).toFixed(1)}%` : '—'}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

const txColumns = (showClassification: boolean): DataTableColumn<Transaction>[] => [
  { key: 'date', label: 'Date', mobile: 'meta', render: (t) => <DateText value={t.tx_date} format="short" className="whitespace-nowrap text-ink-2" /> },
  { key: 'description', label: 'Description', mobile: 'title',
    render: (t) => <span className="block max-w-[24rem] truncate text-ink" title={t.description || t.external_reference}>{t.description || t.external_reference || '—'}</span> },
  { key: 'type', label: 'Type', mobile: 'subtitle', render: (t) => <span className="capitalize text-ink-2">{t.transaction_type.replace(/_/g, ' ')}</span> },
  ...(showClassification ? [{ key: 'classification', label: 'Classification', mobile: 'hide' as const,
    render: (t: Transaction) => <span className="capitalize text-ink-2">{t.classification ? t.classification.replace(/_/g, ' ') : '—'}</span> }] : []),
  { key: 'amount', label: 'Amount', align: 'right', mobile: 'value',
    render: (t) => <Amount value={t.direction === 'outflow' ? -Number(t.amount) : Number(t.amount)} signed tone={t.direction === 'outflow' ? 'debit' : 'credit'} className="font-semibold" /> },
]

// Transactions behind a clicked bar / category / member.
function DrillDownTable({ householdId, drillDown, granularity, windowStart, windowEnd, onClose }: {
  householdId: number
  drillDown: DrillDown
  granularity: Granularity
  windowStart: string
  windowEnd: string
  onClose: () => void
}) {
  const query = useQuery({
    queryKey: ['spend-drilldown', householdId, drillDown, granularity, windowStart, windowEnd],
    queryFn: () => {
      const params: Parameters<typeof ledgerApi.listTransactionsPage>[0] = {
        householdId, page: 1, pageSize: 100, ordering: '-tx_date', txDateAfter: windowStart, txDateBefore: windowEnd,
      }
      if (drillDown.kind === 'period') {
        const { start, end } = periodDateRange(drillDown.period, granularity)
        params.txDateAfter = start
        params.txDateBefore = end
        if (drillDown.category) params.classification = drillDown.category
      } else if (drillDown.kind === 'category') {
        params.classification = 'spend'
        params.spendCategory = drillDown.category
      } else if (drillDown.kind === 'member' && drillDown.memberId !== null) {
        params.member = drillDown.memberId
      }
      return ledgerApi.listTransactionsPage(params)
    },
  })
  const rows = query.data?.results ?? []
  const count = query.data?.count ?? 0
  return (
    <Card title={drillDown.label} subtitle={count > rows.length ? `Showing ${rows.length} of ${count} — narrow the range for more detail` : undefined}
      actions={<IconButton label="Close" icon={<X />} onClick={onClose} />}>
      <DataTable
        ariaLabel={drillDown.label}
        columns={txColumns(false)}
        rows={rows}
        rowKey={(t) => t.id}
        loading={query.isPending}
        error={query.error ? { message: normalizeApiError(query.error), onRetry: () => void query.refetch() } : null}
        emptyState="No transactions found"
        maxHeight="28rem"
      />
    </Card>
  )
}

// Cash flow tab — yearly income / expense / investment / savings.
function CashFlowSection({ householdId, tabs }: { householdId: number; tabs: React.ReactNode }) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const cashflow = useQuery({
    queryKey: ['cashflow', householdId, year],
    queryFn: async () => (await getJson<{ cashflow: CashFlowPoint[] }>(`/api/cashflow?${toQueryString({ household_id: householdId, year })}`)).cashflow,
  })
  const data: CashFlowPoint[] = cashflow.data ?? NO_CASHFLOW
  const loading = cashflow.isPending
  const error = cashflow.error ? normalizeApiError(cashflow.error) : ''
  const [cfDrillDown, setCfDrillDown] = useState<{ month: string; bucket: CashFlowBucket } | null>(null)

  const total = (k: CashFlowBucket) => data.reduce((s, r) => s + r[k], 0)
  const totalIncome = total('income')
  const savingsRate = totalIncome > 0 ? (total('savings') / totalIncome) * 100 : null
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  const cell = (r: CashFlowPoint, bucket: CashFlowBucket) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); setCfDrillDown({ month: r.month, bucket }) }}
      className="hover:underline underline-offset-4" aria-label={`${bucket} in ${fmtMonth(r.month)}`}>
      <Amount value={r[bucket]} tone={bucket === 'savings' ? 'gain' : 'default'} />
    </button>
  )

  return (
    <PageLayout
      title="Trends"
      description={`Cash flow in ${year}`}
      summary={(
        <>
          <StatCard label="Income" loading={loading} value={<Amount value={totalIncome} format="compact" />} />
          <StatCard label="Expense" loading={loading} value={<Amount value={total('expense')} format="compact" />} />
          <StatCard label="Investment" loading={loading} value={<Amount value={total('investment')} format="compact" />} />
          <StatCard label="Savings rate" loading={loading} value={savingsRate === null ? '—' : `${savingsRate.toFixed(1)}%`}
            subtitle={<>Saved <Amount value={total('savings')} format="compact" /></>} />
        </>
      )}
      notices={error ? <Notice tone="danger" title="Couldn’t load cash flow">{error}</Notice> : undefined}
      toolbar={(
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          {tabs}
          <FilterBar className="min-w-0 flex-1 md:flex-none" controls={(
            <ToolbarSelect label="Year" value={String(year)} options={years.map((y) => ({ value: String(y), label: String(y) }))}
              onChange={(v) => { setYear(Number(v)); setCfDrillDown(null) }} />
          )} />
        </div>
      )}
    >
      <ChartCard
        title="Monthly cash flow"
        subtitle="Select a bar to see its transactions"
        loading={loading}
        empty={!loading && data.length === 0 ? { title: `No transactions in ${year}` } : null}
        legend={CASHFLOW_SERIES.map((s) => ({ key: s.key, label: s.label, color: CASHFLOW_COLOR[s.key], value: total(s.key) }))}
      >
        <CashFlowChart data={data} onSelect={(month, bucket) => setCfDrillDown({ month, bucket })} />
      </ChartCard>

      <Card title="Monthly breakdown" subtitle="Select a figure to see the transactions behind it" flush>
        <div className="px-4 pb-4 md:px-6 md:pb-6">
          {loading ? <Skeleton variant="table" rows={6} /> : (
            <DataTable
              ariaLabel="Monthly cash flow"
              maxHeight="none"
              columns={[
                { key: 'month', label: 'Month', mobile: 'title', render: (r) => <span className="font-medium text-ink">{fmtMonth(r.month)}</span> },
                ...CASHFLOW_SERIES.map((s) => ({
                  key: s.key, label: s.label, align: 'right' as const,
                  mobile: (s.key === 'savings' ? 'value' : s.key === 'income' ? 'meta' : 'hide') as 'value' | 'meta' | 'hide',
                  render: (r: CashFlowPoint) => cell(r, s.key),
                })),
              ]}
              rows={data}
              rowKey={(r) => r.month}
              emptyState={<EmptyState title={`No transactions in ${year}`} />}
            />
          )}
        </div>
      </Card>

      {cfDrillDown && (
        <CashFlowDrillDown householdId={householdId} month={cfDrillDown.month} bucket={cfDrillDown.bucket} onClose={() => setCfDrillDown(null)} />
      )}
    </PageLayout>
  )
}

// Transactions behind a cash-flow figure, using the same cashflow_bucket filter as
// insights.services.compute_cashflow so the list matches the figure. A row opens the
// same edit form as the Ledger.
function CashFlowDrillDown({ householdId, month, bucket, onClose }: {
  householdId: number
  month: string
  bucket: CashFlowBucket
  onClose: () => void
}) {
  const { members, accounts, instruments } = useApp()
  const { canWrite } = useAuth()
  const [rows, setRows] = useState<Transaction[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(blankTxForm())
  const [formError, setFormError] = useState('')

  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const res = await ledgerApi.listTransactionsPage({
        householdId, page: 1, pageSize: 100, ordering: '-amount', txDateAfter: start, txDateBefore: end, cashflowBucket: bucket,
      })
      setRows(res.results); setCount(res.count)
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [householdId, month, bucket])

  const openEdit = (t: Transaction) => { setEditingId(t.id); setEditForm(txFormFromTransaction(t)); setFormError('') }

  const saveEdit = async () => {
    if (editingId === null) return
    try {
      setFormError('')
      await ledgerApi.updateTransaction(editingId, {
        member: editForm.member ? Number(editForm.member) : null,
        account: editForm.account ? Number(editForm.account) : null,
        instrument: editForm.instrument ? Number(editForm.instrument) : null,
        tx_date: editForm.tx_date,
        amount: editForm.amount,
        quantity: editForm.quantity || null,
        price_per_unit: editForm.price_per_unit || null,
        direction: 'outflow',
        transaction_type: editForm.transaction_type as Transaction['transaction_type'],
        external_reference: editForm.external_reference,
        classification: editForm.classification as Transaction['classification'],
      })
      setEditingId(null)
      await load()
    } catch (e) {
      setFormError(normalizeApiError(e))
    }
  }

  const label = CASHFLOW_SERIES.find((s) => s.key === bucket)?.label ?? bucket
  return (
    <Card title={`${label} · ${fmtMonth(month)}`} subtitle={count > rows.length ? `Showing ${rows.length} of ${count}` : 'Select a transaction to edit it'}
      actions={<IconButton label="Close" icon={<X />} onClick={onClose} />}>
      <DataTable
        ariaLabel={`${label} transactions`}
        columns={txColumns(true)}
        rows={rows}
        rowKey={(t) => t.id}
        loading={loading}
        error={error ? { message: error, onRetry: () => void load() } : null}
        emptyState="No transactions found"
        onRowClick={canWrite ? openEdit : undefined}
        maxHeight="28rem"
      />
      {editingId !== null && (
        <Sheet title="Edit transaction" onClose={() => setEditingId(null)}>
          <TxFormFields
            form={editForm} onChange={setEditForm}
            accountOptions={accounts} memberOptions={members} instrumentOptions={instruments}
            error={formError} submitLabel="Update" canWrite={canWrite}
            onSubmit={saveEdit}
            onCancel={() => setEditingId(null)}
          />
        </Sheet>
      )}
    </Card>
  )
}

// Spend by category (classification=spend).
function SpendCategoryBreakdown({ householdId, granularity, periods, onSelectCategory }: {
  householdId: number; granularity: Granularity; periods: number; onSelectCategory: (category: string, label: string) => void
}) {
  const [data, setData] = useState<SpendAnalytics | null>(null)
  const errorToast = useErrorToast()
  useEffect(() => {
    let active = true
    expenseApi.fetchSpendAnalytics(householdId, periods, 'spend', granularity, periods)
      .then((r) => { if (active) setData(r) })
      .catch((e) => { if (active) errorToast('Couldn’t load spend analytics')(e) })
    return () => { active = false }
  }, [householdId, granularity, periods, errorToast])

  if (!data) return <Skeleton variant="card" />
  return (
    <Card title="Spend by category" subtitle="Select a category to see its spends">
      {data.by_category.length === 0 ? <EmptyState title="No spends in this window" /> : (
        <BarList
          rows={data.by_category.map((r) => ({ key: r.category, label: r.label || r.category || 'Uncategorised', value: r.amount }))}
          total={data.total}
          onSelect={onSelectCategory}
          colorOf={spendCategoryColor}
        />
      )}
    </Card>
  )
}
