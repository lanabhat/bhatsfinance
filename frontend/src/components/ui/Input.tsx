import { forwardRef, useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { CalendarRange, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { controlClass, DATE_PRESETS, describeAmountRange, describeDateRange } from './controls'
import type { AmountRange, DateRange } from './controls'

export type { AmountRange, DateRange } from './controls'

/** Label above the control, optional hint/error below. */
export function Field({ label, hint, error, children, htmlFor, className }: {
  label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; className?: string
}) {
  return (
    <div className={cn('grid min-w-0 gap-1', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-2">{label}</label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(controlClass, className)} {...props} />,
)
Input.displayName = 'Input'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <span className="relative block min-w-0">
      <select ref={ref} className={cn(controlClass, 'appearance-none pr-8', className)} {...props}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
    </span>
  ),
)
Select.displayName = 'Select'

/** The FilterBar's search box — always first, leftmost. */
export function SearchInput({ value, onChange, placeholder = 'Search…', className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <span className={cn('relative block min-w-0', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(controlClass, 'pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </span>
  )
}

/** Compact "Group by ▾" / "View ▾" / "Sort ▾" control for the right end of a FilterBar. */
export function ToolbarSelect({ label, value, options, onChange, className }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; className?: string
}) {
  const id = useId()
  return (
    <span className={cn('relative inline-flex min-w-0 items-center', className)}>
      <label htmlFor={id} className="pointer-events-none absolute left-3 text-sm text-ink-muted">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingLeft: `calc(${label.length * 0.5}em + 1.25rem)` }}
        className={cn(controlClass, 'w-auto appearance-none pr-8 font-medium')}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-ink-muted" aria-hidden />
    </span>
  )
}

/** The one date-range control: presets + from/to, in a popover-style panel. */
export function DateRangePicker({ value, onChange, label = 'Date' }: { value: DateRange; onChange: (r: DateRange) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const active = !!(value.from || value.to)
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={cn(controlClass, 'inline-flex w-auto items-center gap-2 font-medium', active && 'border-accent text-accent')}>
        <CalendarRange className="h-4 w-4" aria-hidden />
        <span className="truncate">{active ? describeDateRange(value) : label}</span>
        <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div role="dialog" aria-label={`${label} range`}
            className="absolute left-0 top-full z-40 mt-1 grid w-72 gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-3 shadow-[var(--shadow-modal)]">
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((p) => (
                <button key={p.key} type="button" onClick={() => { onChange(p.range()); setOpen(false) }}
                  className="h-8 rounded-full border border-line-strong px-3 text-sm text-ink-2 hover:bg-surface-2">{p.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From"><Input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></Field>
              <Field label="To"><Input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></Field>
            </div>
            <div className="flex justify-between">
              <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => { onChange({ from: '', to: '' }); setOpen(false) }}>Clear</button>
              <button type="button" className="text-sm font-medium text-accent" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </>
      )}
    </span>
  )
}

/** Min/max rupee range in one control. */
export function AmountRangeInput({ value, onChange, label = 'Amount' }: { value: AmountRange; onChange: (r: AmountRange) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const active = !!(value.min || value.max)
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={cn(controlClass, 'inline-flex w-auto items-center gap-2 font-medium', active && 'border-accent text-accent')}>
        <span className="truncate">{active ? describeAmountRange(value) : label}</span>
        <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div role="dialog" aria-label={`${label} range`}
            className="absolute left-0 top-full z-40 mt-1 grid w-64 gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-3 shadow-[var(--shadow-modal)]">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Min ₹"><Input type="number" min="0" inputMode="decimal" placeholder="0" value={value.min} onChange={(e) => onChange({ ...value, min: e.target.value })} /></Field>
              <Field label="Max ₹"><Input type="number" min="0" inputMode="decimal" placeholder="Any" value={value.max} onChange={(e) => onChange({ ...value, max: e.target.value })} /></Field>
            </div>
            <div className="flex justify-between">
              <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => { onChange({ min: '', max: '' }); setOpen(false) }}>Clear</button>
              <button type="button" className="text-sm font-medium text-accent" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </>
      )}
    </span>
  )
}
