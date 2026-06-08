import { Button } from '../ui/Button'

type Props = {
  onSubmit: () => void
  onReset?: () => void
  saving?: boolean
  submitLabel?: string
  disabled?: boolean
  resetDisabled?: boolean
}

export function FormActions({ onSubmit, onReset, saving, submitLabel = 'Save', disabled, resetDisabled }: Props) {
  return (
    <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
      <Button type="button" variant="primary" size="md" loading={saving} disabled={disabled} onClick={onSubmit}>
        {submitLabel}
      </Button>
      {onReset && (
        <Button type="button" variant="ghost" size="md" disabled={resetDisabled} onClick={onReset}>
          Reset
        </Button>
      )}
    </div>
  )
}
