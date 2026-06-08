import { useEffect, useRef, useState } from 'react'

type Props = {
  text: string
}

export function HelpTooltip({ text }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <span className="relative inline-flex items-center" ref={wrapRef}>
      <button
        type="button"
        className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-400 text-[10px] font-bold leading-none text-white transition-colors hover:bg-primary-700"
        aria-label="Help"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 w-max max-w-[280px] min-w-[180px] -translate-y-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-800 shadow-md max-[700px]:left-auto max-[700px]:right-[calc(100%+8px)]"
        >
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-[6px] border-transparent border-r-slate-200 max-[700px]:left-full max-[700px]:right-auto max-[700px]:border-r-transparent max-[700px]:border-l-slate-200" />
          <span className="absolute right-[calc(100%-1px)] top-1/2 -translate-y-1/2 border-[6px] border-transparent border-r-white max-[700px]:left-[calc(100%-1px)] max-[700px]:right-auto max-[700px]:border-r-transparent max-[700px]:border-l-white" />
          {text}
        </span>
      )}
    </span>
  )
}
