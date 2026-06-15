import { useState } from 'react'
import { useMaskedFmt } from '../common/Money'

type Props = {
  name: string
  color: string
  totalValue?: string
  children: React.ReactNode
  defaultOpen?: boolean
}


export function CategorySection({ name, color, totalValue, children, defaultOpen = true }: Props) {
  const fmtINR = useMaskedFmt()
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between py-2"
        onClick={() => setOpen((p) => !p)}
      >
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{name}</span>
          {totalValue && <span className="text-xs text-[var(--text-muted)]">· {fmtINR(totalValue)}</span>}
        </div>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="grid gap-2 pb-2">{children}</div>}
    </div>
  )
}
