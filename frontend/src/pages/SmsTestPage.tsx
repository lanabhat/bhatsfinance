import { useState } from 'react'
import { Button } from '../components/ui/Button'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const SAMPLE_BODIES = [
  'Rs.500.00 debited from a/c XX1234 on 05-Jun-26 to VPA merchant@upi. UPI Ref 123456789012.',
  'Your a/c XX1234 is credited with Rs.25,000.00 on 05-Jun-26. Avl Bal: Rs.1,42,350.75.',
  'INR 1,200.00 spent on HDFC Bank Card XX5678 at AMAZON on 05-Jun-26.',
]

function nowAsLocalInput() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function SmsTestPage() {
  const [token, setToken] = useState('')
  const [sender, setSender] = useState('AX-HDFCBK')
  const [body, setBody] = useState(SAMPLE_BODIES[0])
  const [when, setWhen] = useState(nowAsLocalInput())

  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ status: number; body: unknown } | null>(null)
  const [error, setError] = useState('')

  const canSend = token.trim() !== '' && sender.trim() !== '' && body.trim() !== ''

  async function handleSend() {
    if (!canSend) return
    setSending(true)
    setError('')
    setResult(null)
    try {
      const timestampMillis = new Date(when).getTime()
      const response = await fetch(`${API_BASE}/api/sms/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token.trim()}`,
        },
        body: JSON.stringify({ sender: sender.trim(), body, timestamp: timestampMillis }),
      })
      const json = await response.json().catch(() => null)
      setResult({ status: response.status, body: json })
    } catch {
      setError('Request failed — check that the backend is reachable.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid gap-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">SMS Ingest — Test Sender</h2>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Manually POST a sample SMS to <code>/api/sms/ingest</code> using a device's API key —
          handy for testing the forwarder flow without a phone.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">Device API key</span>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste the full API key shown when you registered the device"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-mono"
          />
          <span className="text-[11px] text-[var(--text-muted)]">
            Only available at registration time — register a new device under SMS Devices if you don't have one saved.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">Sender</span>
            <input
              type="text"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">Received at</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">Message body</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
          />
          <span className="flex flex-wrap gap-1.5 mt-1">
            {SAMPLE_BODIES.map((sample, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setBody(sample)}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              >
                Sample {i + 1}
              </button>
            ))}
          </span>
        </label>

        <div className="flex items-center gap-3">
          <Button onClick={handleSend} loading={sending} disabled={!canSend}>
            Send test SMS
          </Button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      {result && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              result.status >= 200 && result.status < 300
                ? 'bg-emerald-50 dark:bg-emerald-900/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-300'
            }`}>
              {result.status}
            </span>
            <span className="text-sm font-medium text-[var(--text-2)]">
              {result.status === 201 ? 'Staged as new message' : result.status === 200 ? 'Matched an existing staged message (idempotent)' : 'Request failed'}
            </span>
          </div>
          <pre className="overflow-auto rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-3 text-xs text-[var(--text-2)]">
            {JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
