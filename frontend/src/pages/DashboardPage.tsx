import { AllocationPieChart } from '../components/charts/AllocationPieChart'
import { NetWorthTrendChart } from '../components/charts/NetWorthTrendChart'
import { HelpTooltip } from '../components/common/HelpTooltip'
import { TOOLTIPS } from '../data/helpContent'
import type { DashboardPayload } from '../types/domain'

type Props = {
  data: DashboardPayload
}

export function DashboardPage({ data }: Props) {
  const topThree = data.holdings.slice(0, 3)
  const networthNum = parseFloat(data.networth)

  return (
    <>
      <section className="cards">
        <article className="card">
          <h2 style={{ display: 'inline-flex', alignItems: 'center' }}>Net Worth <HelpTooltip text={TOOLTIPS.net_worth} /></h2>
          <strong>₹{networthNum.toLocaleString('en-IN')}</strong>
        </article>
        <article className="card">
          <h2 style={{ display: 'inline-flex', alignItems: 'center' }}>XIRR <HelpTooltip text={TOOLTIPS.xirr} /></h2>
          <strong>{data.xirr === null ? 'N/A' : `${(data.xirr * 100).toFixed(2)}%`}</strong>
        </article>
        <article className="card">
          <h2>Holdings</h2>
          <strong>{data.holdings.length}</strong>
        </article>
        <article className="card">
          <h2>Missed SIP</h2>
          <strong>{data.missedSip.length}</strong>
        </article>
      </section>

      <section className="grid two-col">
        <article className="panel">
          <h3>Net Worth Trend</h3>
          <NetWorthTrendChart data={data.networthHistory} />
        </article>

        <article className="panel">
          <h3>Asset Allocation</h3>
          {data.allocation.length > 0 ? (
            <AllocationPieChart data={data.allocation} />
          ) : (
            <p>No allocation data.</p>
          )}
        </article>
      </section>

      <section className="grid two-col">
        <article className="panel">
          <h3>Top Holdings</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {topThree.map((h) => (
                <tr key={h.instrument_id}>
                  <td>{h.instrument_name}</td>
                  <td>{h.instrument_type}</td>
                  <td>{h.quantity}</td>
                  <td>₹{parseFloat(h.market_value).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="panel">
          <h3>Allocation Breakdown</h3>
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Value</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {data.allocation.map((x) => (
                <tr key={x.instrument_type}>
                  <td>{x.instrument_type}</td>
                  <td>₹{parseFloat(x.market_value).toLocaleString('en-IN')}</td>
                  <td>{x.allocation_percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </>
  )
}
