import { useEffect, useState } from 'react'
import { getJson, toQueryString } from '../api/http'
import { CashFlowChart, type CashFlowPoint } from '../components/charts/CashFlowChart'
import { Money } from '../components/common/Money'
import { normalizeApiError } from '../hooks/errorUtils'

type Props = { householdId: number }

export function CashFlowPage({ householdId }: Props) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<CashFlowPoint[]>([])
  const [error, setError] = useState('')

  const load = async (hid: number, y: number) => {
    try {
      setError('')
      const q = toQueryString({ household_id: hid, year: y })
      const res = await getJson<{ cashflow: CashFlowPoint[] }>(`/api/cashflow?${q}`)
      setData(res.cashflow)
    } catch (e) {
      setError(normalizeApiError(e))
    }
  }

  useEffect(() => { void load(householdId, year) }, [householdId, year])

  const totalIncome = data.reduce((s, r) => s + r.income, 0)
  const totalExpense = data.reduce((s, r) => s + r.expense, 0)
  const totalInvestment = data.reduce((s, r) => s + r.investment, 0)
  const totalSavings = data.reduce((s, r) => s + r.savings, 0)
  const savingsRate = totalIncome > 0 ? ((totalSavings / totalIncome) * 100).toFixed(1) : 'N/A'
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <>
      <section className="cards">
        <article className="card">
          <h2>Income</h2>
          <strong><Money value={totalIncome} /></strong>
        </article>
        <article className="card">
          <h2>Expense</h2>
          <strong><Money value={totalExpense} /></strong>
        </article>
        <article className="card">
          <h2>Investment</h2>
          <strong><Money value={totalInvestment} /></strong>
        </article>
        <article className="card">
          <h2>Savings Rate</h2>
          <strong>{savingsRate}{totalIncome > 0 ? '%' : ''}</strong>
        </article>
      </section>

      <article className="panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Monthly Cash Flow</h3>
          <label>
            Year&nbsp;
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        {data.length === 0 ? (
          <p>No transactions found for {year}.</p>
        ) : (
          <CashFlowChart data={data} />
        )}
      </article>

      <article className="panel">
        <h3>Monthly Breakdown</h3>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Income</th>
              <th>Expense</th>
              <th>Investment</th>
              <th>Savings</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td><Money value={r.income} /></td>
                <td><Money value={r.expense} /></td>
                <td><Money value={r.investment} /></td>
                <td style={{ color: r.savings >= 0 ? '#10b981' : '#f43f5e' }}><Money value={r.savings} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  )
}
