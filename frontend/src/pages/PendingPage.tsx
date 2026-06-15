import { useAuth } from '../context/AuthContext'

export function PendingPage() {
  const { logout } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-2)] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-8 shadow-lg ring-1 ring-[var(--border)] text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <span className="text-2xl">⏳</span>
        </div>
        <h2 className="text-lg font-semibold text-[var(--text)]">Pending Approval</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Your account is awaiting approval from an administrator. You'll get access once approved.
        </p>
        <button
          type="button"
          onClick={logout}
          className="mt-6 w-full rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
