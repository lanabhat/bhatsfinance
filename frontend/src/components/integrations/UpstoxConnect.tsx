import { useEffect, useState } from 'react'
import { getJson, postJson } from '../../api/http'
import { Button } from '../ui/Button'
import type { OptionItem } from '../../types/domain'

type ConnectedAccount = {
  id: number
  label: string
  email: string
  member_id: number | null
  member_name: string | null
}

type StatusResponse = {
  client_configured: boolean
  connected_accounts: ConnectedAccount[]
}

type Props = {
  memberOptions: OptionItem[]
}

export function UpstoxConnect({ memberOptions }: Props) {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<number | null>(null)
  const [syncResult, setSyncResult] = useState<string>('')
  const [error, setError] = useState('')
  const [connectMemberId, setConnectMemberId] = useState<string>('')

  const load = () => {
    setLoading(true)
    getJson<StatusResponse>('/api/upstox/status')
      .then(setStatus)
      .catch(() => setError('Failed to load Upstox status'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleConnect = () => {
    const params = connectMemberId ? `?member_id=${connectMemberId}` : ''
    window.location.href = `/api/upstox/connect${params}`
  }

  const handleSync = async (credId: number) => {
    setSyncing(credId)
    setSyncResult('')
    setError('')
    try {
      const results = await postJson<{ label: string; holdings_synced?: number; new_instruments?: number; error?: string }[]>(
        '/api/upstox/sync',
        { credential_id: credId },
      )
      const r = results[0]
      if (r.error) {
        setError(r.error)
      } else {
        setSyncResult(`Synced ${r.holdings_synced} holdings (${r.new_instruments} new instruments)`)
        load()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(null)
    }
  }

  const handleDisconnect = async (credId: number) => {
    setError('')
    try {
      await postJson('/api/upstox/disconnect', { credential_id: credId })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Disconnect failed')
    }
  }

  const handleMemberChange = async (credId: number, memberId: string) => {
    try {
      await fetch(`/api/upstox/credentials/${credId}/member`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ member_id: memberId ? Number(memberId) : null }),
      })
      load()
    } catch {
      setError('Failed to update member')
    }
  }

  if (loading) return <p className="text-sm text-[var(--text-muted)]">Loading…</p>

  const configured = status?.client_configured
  const accounts = status?.connected_accounts ?? []

  return (
    <div className="grid gap-4">
      {!configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/15 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Upstox not configured</p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
            Add <code className="font-mono">UPSTOX_CLIENT_ID</code> and <code className="font-mono">UPSTOX_CLIENT_SECRET</code> to your <code className="font-mono">.env</code> file.
            Register a free developer app at <strong>developer.upstox.com</strong> to get these credentials.
          </p>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="grid gap-2">
          {accounts.map(acc => (
            <div key={acc.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text)]">{acc.label}</p>
                {acc.email && <p className="text-xs text-[var(--text-muted)]">{acc.email}</p>}
              </div>
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text)]"
                value={acc.member_id ?? ''}
                onChange={e => handleMemberChange(acc.id, e.target.value)}
              >
                <option value="">No member</option>
                {memberOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <Button
                size="sm"
                loading={syncing === acc.id}
                onClick={() => handleSync(acc.id)}
              >
                Sync Now
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleDisconnect(acc.id)}
              >
                Disconnect
              </Button>
            </div>
          ))}
        </div>
      )}

      {syncResult && (
        <p className="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm text-green-700 dark:text-green-300">
          ✓ {syncResult}
        </p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {configured && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-[var(--text-muted)]">Member for new connection</label>
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)]"
              value={connectMemberId}
              onChange={e => setConnectMemberId(e.target.value)}
            >
              <option value="">— select member —</option>
              {memberOptions.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleConnect}>
            Connect Upstox Account
          </Button>
        </div>
      )}
    </div>
  )
}

function getCsrf(): string {
  const name = 'csrftoken='
  for (const part of document.cookie.split(';')) {
    const p = part.trim()
    if (p.startsWith(name)) return decodeURIComponent(p.slice(name.length))
  }
  return ''
}
