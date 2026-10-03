type Option = { value: string; label: string }

type Props = {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  className?: string
}

/** Compact "Label [value ▾]" single-choice control for group / sort / view settings. */
export function LabeledSelect({ label, value, options, onChange, className }: Props) {
  return (
    <label className={`flex items-center gap-1.5 text-xs text-[var(--text-muted)] ${className ?? ''}`}>
      <span className="whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-medium text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}
