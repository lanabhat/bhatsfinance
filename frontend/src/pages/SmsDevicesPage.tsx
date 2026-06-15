import { useEffect, useState } from 'react'
import type { SmsApiKey } from '../types/domain'
import { smsApi } from '../api/smsApi'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { DeleteButton } from '../components/common/DeleteButton'

type Props = {
  householdId: number
}

function formatDateTime(value: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function SmsDevicesPage({ householdId }: Props) {
  const { user } = useAuth()
  const canWrite = user.authenticated && (user.role === 'admin' || user.role === 'super_admin')

  const [keys, setKeys] = useState<SmsApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // The freshly-created key, including its plaintext token — shown once, then discarded
  const [revealedKey, setRevealedKey] = useState<SmsApiKey | null>(null)
  const [copied, setCopied] = useState(false)

  function load() {
    if (!householdId) return
    setLoading(true)
    setError('')
    smsApi.listApiKeys(householdId)
      .then(setKeys)
      .catch(() => setError('Failed to load SMS devices.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [householdId])

  async function handleCreate() {
    if (!label.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const created = await smsApi.createApiKey({ household: householdId, label: label.trim() })
      setKeys((prev) => [created, ...prev])
      setRevealedKey(created)
      setShowCreate(false)
      setLabel('')
    } catch {
      setCreateError('Failed to register device.')
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleActive(key: SmsApiKey) {
    try {
      const updated = await smsApi.updateApiKey(key.id, { is_active: !key.is_active })
      setKeys((prev) => prev.map((k) => (k.id === key.id ? updated : k)))
    } catch {
      setError('Failed to update device.')
    }
  }

  async function handleDelete(key: SmsApiKey) {
    await smsApi.deleteApiKey(key.id)
    setKeys((prev) => prev.filter((k) => k.id !== key.id))
  }

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API unavailable — user can still select & copy manually
    }
  }

  if (!householdId) {
    return <p className="text-sm text-[var(--text-muted)]">Select a household to manage SMS devices.</p>
  }

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading…</p>
  }

  return (
    <div className="grid gap-6 max-w-2xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">SMS Devices</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Register a phone to forward bank SMS to this household. Each device gets its own API key
            to authenticate with the forwarder app.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => { setShowCreate(true); setCreateError('') }} disabled={showCreate}>
            + Register phone
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showCreate && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Register a new phone</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <span className="text-xs font-medium text-[var(--text-muted)]">Label</span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Dad's Phone"
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <Button size="sm" onClick={handleCreate} loading={creating} disabled={!label.trim()}>
              Generate API key
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setShowCreate(false); setLabel('') }}>
              Cancel
            </Button>
          </div>
          {createError && <p className="mt-2 text-xs text-red-600">{createError}</p>}
        </div>
      )}

      {keys.length === 0 && !showCreate && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">No devices registered yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Register a phone to get an API key for the SMS forwarder app.
          </p>
        </div>
      )}

      {keys.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-2.5">Label</th>
                <th className="px-4 py-2.5">API key</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Last used</th>
                {canWrite && <th className="px-4 py-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--text)]">{key.label || 'SMS device'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-muted)]">{key.token}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${key.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
                      {key.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">{formatDateTime(key.last_used_at)}</td>
                  {canWrite && (
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => handleToggleActive(key)}>
                          {key.is_active ? 'Revoke' : 'Reactivate'}
                        </Button>
                        <DeleteButton onDelete={() => handleDelete(key)} label="Remove" />
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {revealedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[var(--surface,white)] p-6 shadow-xl">
            <h2 className="mb-1 text-base font-semibold text-[var(--text)]">Device registered</h2>
            <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ This API key is shown only once. Copy it into the forwarder app now — you won't be able to view it again.
            </p>

            <div className="space-y-3 text-sm">
              <div>
                <span className="block text-xs font-medium text-[var(--text-muted)] mb-1">Label</span>
                <p className="text-[var(--text)]">{revealedKey.label || 'SMS device'}</p>
              </div>
              <div>
                <span className="block text-xs font-medium text-[var(--text-muted)] mb-1">API key</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs">
                    {revealedKey.token}
                  </code>
                  <Button size="sm" variant="secondary" onClick={() => handleCopy(revealedKey.token)}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              <div>
                <span className="block text-xs font-medium text-[var(--text-muted)] mb-1">Endpoint</span>
                <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs">
                  POST {window.location.origin}/api/sms/ingest
                </code>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Send <code>Authorization: Bearer &lt;API key&gt;</code> with each request.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button size="sm" onClick={() => { setRevealedKey(null); setCopied(false) }}>
                Done — I've saved the key
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
