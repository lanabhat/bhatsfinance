import { useState } from 'react'
import { FAQ_GUIDES, GETTING_STARTED_STEPS, PAGE_GUIDES } from '../data/helpContent'

export function HelpPage() {
  const [tab, setTab] = useState<'guide' | 'faq'>('guide')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <section className="grid single-col">
      <article className="panel">
        <h2 style={{ marginBottom: '0.75rem' }}>Help &amp; Guide</h2>

        {/* Tab buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            onClick={() => setTab('guide')}
            style={{ background: tab === 'guide' ? '#4f46e5' : '#1e293b' }}
          >
            Getting Started
          </button>
          <button
            type="button"
            onClick={() => setTab('faq')}
            style={{ background: tab === 'faq' ? '#4f46e5' : '#1e293b' }}
          >
            FAQ
          </button>
        </div>

        {tab === 'guide' && (
          <>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>How to get started</h3>
            <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.8, marginBottom: '1.5rem' }}>
              {GETTING_STARTED_STEPS.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>

            <h3 style={{ marginBottom: '0.5rem' }}>What each page does</h3>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Page</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {PAGE_GUIDES.map(({ page, description }) => (
                  <tr key={page}>
                    <td><strong>{page}</strong></td>
                    <td style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'faq' && (
          <>
            <p style={{ color: '#6b7280', fontSize: '0.88rem', marginTop: 0, marginBottom: '1rem' }}>
              Click a question to see the step-by-step guide.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
              {FAQ_GUIDES.map(({ title, steps }, i) => (
                <li key={i} style={{ border: '1px solid #dbe1ea', borderRadius: '8px', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: openFaq === i ? '#f0fdf4' : '#f8fafc',
                      color: '#0f172a',
                      border: 'none',
                      borderRadius: 0,
                      padding: '0.65rem 0.9rem',
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{title}</span>
                    <span style={{ color: '#64748b', fontWeight: 400, fontSize: '1rem' }}>
                      {openFaq === i ? '▲' : '▼'}
                    </span>
                  </button>
                  {openFaq === i && (
                    <ol style={{ padding: '0.75rem 1.25rem', margin: 0, lineHeight: 1.8, fontSize: '0.87rem', background: 'var(--surface-2)' }}>
                      {steps.map((step, j) => (
                        <li key={j} style={{ marginBottom: '0.25rem', whiteSpace: 'pre-wrap' }}>{step}</li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </section>
  )
}
