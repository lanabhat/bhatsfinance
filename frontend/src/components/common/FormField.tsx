import type { OptionItem } from '../../types/domain'
import { cn } from '../../lib/cn'
import { HelpTooltip } from './HelpTooltip'

const inputClass = [
  'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]',
  'placeholder:text-[var(--text-muted)]',
  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  'transition-shadow duration-150',
].join(' ')

type FieldWrapProps = {
  label: string
  children: React.ReactNode
  helpTooltip?: string
  error?: string
  className?: string
}

function FieldWrap({ label, children, helpTooltip, error, className }: FieldWrapProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="flex items-center gap-1 text-sm font-medium text-[var(--text-2)]">
        <span>{label}</span>
        {helpTooltip && <HelpTooltip text={helpTooltip} />}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}

type InputProps = {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  min?: number | string
  step?: number | string
  helpTooltip?: string
  error?: string
  className?: string
}

export function TextField({ label, value, onChange, type = 'text', min, step, helpTooltip, error, className }: InputProps) {
  return (
    <FieldWrap label={label} helpTooltip={helpTooltip} error={error} className={className}>
      <input
        type={type}
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, error && 'border-red-300 focus:ring-red-500')}
      />
    </FieldWrap>
  )
}

export function MoneyInput(props: Omit<InputProps, 'type'>) {
  return <TextField {...props} type="number" min="0" step="0.01" />
}

export function PercentageInput(props: Omit<InputProps, 'type'>) {
  return <TextField {...props} type="number" min="0" step="0.01" />
}

export function DateField(props: Omit<InputProps, 'type'>) {
  return <TextField {...props} type="date" />
}

type TextAreaProps = {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  helpTooltip?: string
  error?: string
  className?: string
}

export function TextAreaField({ label, value, onChange, rows = 4, helpTooltip, error, className }: TextAreaProps) {
  return (
    <FieldWrap label={label} helpTooltip={helpTooltip} error={error} className={className}>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, 'resize-y', error && 'border-red-300 focus:ring-red-500')}
      />
    </FieldWrap>
  )
}

type SelectProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: OptionItem[]
  placeholder?: string
  helpTooltip?: string
  error?: string
  className?: string
}

export function SelectField({ label, value, onChange, options, placeholder = 'Select', helpTooltip, error, className }: SelectProps) {
  return (
    <FieldWrap label={label} helpTooltip={helpTooltip} error={error} className={className}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, 'cursor-pointer', error && 'border-red-300 focus:ring-red-500')}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  )
}

type AsyncSelectProps = SelectProps & {
  loading?: boolean
}

export function AsyncSelect({ loading, ...props }: AsyncSelectProps) {
  return <SelectField {...props} placeholder={loading ? 'Loading...' : props.placeholder} />
}
