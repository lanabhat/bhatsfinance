import { useState } from 'react'
import { Button } from '../ui/Button'

type Props = {
  onDelete: () => Promise<void>
  disabled?: boolean
  label?: string
}

export function DeleteButton({ onDelete, disabled, label = 'Delete' }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (disabled) return null

  if (!confirming) {
    return (
      <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); setConfirming(true) }}>
        {label}
      </Button>
    )
  }

  return (
    <span className="inline-flex gap-1">
      <Button
        size="sm"
        variant="danger"
        loading={busy}
        onClick={async (e) => {
          e.stopPropagation()
          setBusy(true)
          try {
            await onDelete()
            setConfirming(false)
          } finally {
            setBusy(false)
          }
        }}
      >
        Confirm
      </Button>
      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setConfirming(false) }}>
        Cancel
      </Button>
    </span>
  )
}
