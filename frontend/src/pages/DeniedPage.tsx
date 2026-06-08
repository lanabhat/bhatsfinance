import { useAuth } from '../context/AuthContext'

export function DeniedPage() {
  const { logout } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-100 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <span className="text-2xl">🚫</span>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Access Denied</h2>
        <p className="mt-2 text-sm text-slate-500">
          Your access request has been denied. Contact an administrator if you believe this is a mistake.
        </p>
        <button
          type="button"
          onClick={logout}
          className="mt-6 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
