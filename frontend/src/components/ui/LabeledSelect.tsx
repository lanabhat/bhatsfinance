import { ToolbarSelect } from './Input'

type Option = { value: string; label: string }

type Props = {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  className?: string
}

/** Older name for <ToolbarSelect> — "Label [value ▾]" for group / sort / view settings. */
export function LabeledSelect(props: Props) {
  return <ToolbarSelect {...props} />
}
