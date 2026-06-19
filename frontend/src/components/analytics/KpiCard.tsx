type Sub = { label: string; value: string; positive?: boolean }

type Props = {
  label: string
  value: string
  sub?: Sub[]
  loading?: boolean
}

export function KpiCard({ label, value, sub, loading }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-28 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      ) : (
        <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)]">{value}</p>
      )}
      {sub && sub.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
          {sub.map((s, i) => (
            <span
              key={i}
              className={`text-xs font-medium ${
                s.positive === true
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : s.positive === false
                  ? 'text-rose-500 dark:text-rose-400'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {s.label && <span className="text-[var(--text-muted)]">{s.label} </span>}
              {s.value}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
