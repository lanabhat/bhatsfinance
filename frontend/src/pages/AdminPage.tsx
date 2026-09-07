import { useEffect, useState } from 'react'
import { getJson, patchJson } from '../api/http'
import { integrationCredentialApi } from '../api/integrationCredentialApi'
import type { IntegrationCredential } from '../api/integrationCredentialApi'
import { useApp } from '../context/AppContext'
import { Avatar } from '../components/common/Avatar'

type UserProfile = {
  id: number
  email: string
  name: string
  google_picture: string
  photo: string
  role: 'super_admin' | 'admin' | 'viewer'
  status: 'pending' | 'approved' | 'denied'
  household: number | null
  created_at: string
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:text-amber-300',
  approved: 'bg-green-100 text-green-700 dark:text-green-300',
  denied: 'bg-red-100 text-red-700 dark:text-red-300',
}

// ── integration credentials (e.g. GEMINI_API_KEY) ─────────────────────────
function CredentialsTab() {
  const [credentials, setCredentials] = useState<IntegrationCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [key, setKey] = useState('GEMINI_API_KEY')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedJustNow, setSavedJustNow] = useState(false)

  const load = () => {
    setLoading(true)
    integrationCredentialApi.list()
      .then((rows) => setCredentials(rows.filter((c) => c.scope === 'global')))
      .catch(() => setError('Failed to load credentials.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const existing = credentials.find((c) => c.key === key)

  const save = async () => {
    if (!key.trim() || !value.trim()) { setError('Key and value are both required.'); return }
    setSaving(true)
    setError('')
    setSavedJustNow(false)
    try {
      if (existing) {
        await integrationCredentialApi.update(existing.id, { value, description })
      } else {
        await integrationCredentialApi.create({ key: key.trim(), scope: 'global', value, description })
      }
      setValue('')
      setSavedJustNow(true)
      load()
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'detail' in e ? String((e as { detail: unknown }).detail) : 'Failed to save.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Remove this credential? Anything using it will stop working until a new one is added.')) return
    await integrationCredentialApi.delete(id)
    load()
  }

  const inp = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="mb-1 text-sm font-semibold text-[var(--text)]">Add / update a global API key</p>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Stored encrypted at rest and never shown again after saving — to change a key, just enter a new value here.
          For the AI-assisted features (fund classification, returns comparison, rebalancing explanation), use
          key <code className="rounded bg-[var(--surface-2)] px-1">GEMINI_API_KEY</code> — get a free key from{' '}
          <span className="font-medium">aistudio.google.com/apikey</span>.
        </p>
        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Key</label>
            <input value={key} onChange={(e) => setKey(e.target.value)} className={inp} placeholder="e.g. GEMINI_API_KEY" />
            {existing && <p className="mt-1 text-xs text-amber-600">A credential for this key already exists — saving will replace its value.</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Value</label>
            <input type="password" value={value} onChange={(e) => setValue(e.target.value)} className={inp} placeholder="AIza…" autoComplete="off" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} placeholder="e.g. Gemini API key for AI insights" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {savedJustNow && <p className="text-xs text-emerald-600">Saved.</p>}
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : existing ? 'Update key' : 'Save key'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="mb-3 text-sm font-semibold text-[var(--text)]">Global credentials</p>
        {loading ? (
          <p className="text-xs text-[var(--text-muted)]">Loading…</p>
        ) : credentials.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No global credentials configured yet.</p>
        ) : (
          <div className="grid gap-2">
            {credentials.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{c.key}</p>
                  {c.description && <p className="truncate text-xs text-[var(--text-muted)]">{c.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.has_value ? 'bg-emerald-100 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:text-amber-300'}`}>
                    {c.has_value ? 'Set' : 'Empty'}
                  </span>
                  <button type="button" onClick={() => remove(c.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function AdminPage() {
  const { households } = useApp()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'all' | 'credentials'>('pending')
  const [saving, setSaving] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    getJson<{ results: UserProfile[] } | UserProfile[]>('/api/admin/users/')
      .then(data => setUsers(Array.isArray(data) ? data : data.results))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const patch = async (id: number, payload: Partial<Pick<UserProfile, 'role' | 'status' | 'household'>>) => {
    setSaving(id)
    try {
      const updated = await patchJson<UserProfile>(`/api/admin/users/${id}/`, payload)
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updated } : u))
    } catch {
      // TODO: surface error
    } finally {
      setSaving(null)
    }
  }

  const defaultHouseholdId = households[0]?.id ?? null

  const filtered = tab === 'pending' ? users.filter(u => u.status === 'pending') : users

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'pending' ? 'bg-primary-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
          }`}
        >
          Pending ({users.filter(u => u.status === 'pending').length})
        </button>
        <button
          type="button"
          onClick={() => setTab('all')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'all' ? 'bg-primary-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
          }`}
        >
          All Users ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('credentials')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'credentials' ? 'bg-primary-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'
          }`}
        >
          API Keys
        </button>
      </div>

      {tab === 'credentials' ? (
        <CredentialsTab />
      ) : (
        <>
          {loading && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}

          {!loading && filtered.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">{tab === 'pending' ? 'No pending users.' : 'No users found.'}</p>
          )}

          <div className="grid gap-3">
        {filtered.map(user => (
          <div key={user.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar photo={user.photo || user.google_picture} name={user.name || user.email} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text)]">{user.name || '—'}</p>
                <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[user.status]}`}>
                {user.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Role</label>
                <select
                  value={user.role}
                  disabled={saving === user.id}
                  onChange={e => patch(user.id, { role: e.target.value as UserProfile['role'] })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">Household</label>
                <select
                  value={user.household ?? ''}
                  disabled={saving === user.id}
                  onChange={e => patch(user.id, { household: e.target.value ? Number(e.target.value) : null })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"
                >
                  <option value="">— none —</option>
                  {households.map(h => (
                    <option key={h.id} value={h.id}>{h.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {user.status !== 'approved' && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={saving === user.id}
                  onClick={() => patch(user.id, { status: 'approved', household: user.household ?? defaultHouseholdId })}
                  className="flex-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={saving === user.id}
                  onClick={() => patch(user.id, { status: 'denied' })}
                  className="flex-1 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-200 disabled:opacity-50 transition-colors"
                >
                  Deny
                </button>
              </div>
            )}
            {user.status === 'approved' && (
              <div className="mt-3">
                <button
                  type="button"
                  disabled={saving === user.id}
                  onClick={() => patch(user.id, { status: 'denied' })}
                  className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-200 disabled:opacity-50 transition-colors"
                >
                  Revoke
                </button>
              </div>
            )}
          </div>
        ))}
          </div>
        </>
      )}
    </div>
  )
}
