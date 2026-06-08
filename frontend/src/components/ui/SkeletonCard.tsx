type Props = {
  rows?: number
  height?: string
}

export function SkeletonCard({ rows = 3, height = 'h-4' }: Props) {
  return (
    <div className="card space-y-3">
      <div className="skeleton h-3 w-20 rounded" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`skeleton rounded ${height} ${i === 0 ? 'w-3/4' : i === 1 ? 'w-1/2' : 'w-2/3'}`} />
      ))}
    </div>
  )
}

export function SkeletonTable({ cols = 4, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex gap-4 border-b border-[var(--border)] px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton h-3 flex-1 rounded" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className={`skeleton h-4 flex-1 rounded ${c === 0 ? 'max-w-[40%]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  )
}
