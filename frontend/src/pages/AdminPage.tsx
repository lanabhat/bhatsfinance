import { useEffect, useState } from 'react'
import { getJson, patchJson } from '../api/http'
import { useApp } from '../context/AppContext'

type UserProfile = {
  id: number
  email: string
  name: string
  google_picture: string
  role: 'super_admin' | 'admin' | 'viewer'
  status: 'pending' | 'approved' | 'denied'
  household: number | null
  created_at: string
}

function Avatar({ picture, name }: { picture: string; name: string }) {
  if (picture) {
    return <img src={picture} alt={name} className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" />
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-700',
}

export function AdminPage() {
  const { households } = useApp()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
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
      </div>

      {loading && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">{tab === 'pending' ? 'No pending users.' : 'No users found.'}</p>
      )}

      <div className="grid gap-3">
        {filtered.map(user => (
          <div key={user.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar picture={user.google_picture} name={user.name || user.email} />
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
                  className="flex-1 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
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
                  className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                >
                  Revoke
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
