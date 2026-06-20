import { useState } from 'react'

export type DeleteEntity =
  | 'transaction'
  | 'valuation'
  | 'fd_details'
  | 'instrument'
  | 'account'
  | 'instrument_ownership'
  | 'account_ownership'
  | 'household'
  | 'member'
  | 'sms_message'
  | 'sip_mandate'
  | 'tax_record'
  | 'tax_projection'
  | 'bulk_delete_instruments'

const STORAGE_KEY = 'delete_permissions'

const DEFAULTS: Record<DeleteEntity, boolean> = {
  transaction: true,
  valuation: true,
  fd_details: true,
  instrument: true,
  account: true,
  instrument_ownership: true,
  account_ownership: true,
  household: true,
  member: true,
  sms_message: true,
  sip_mandate: true,
  tax_record: true,
  tax_projection: true,
  bulk_delete_instruments: false,
}

function load(): Record<DeleteEntity, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULTS }
}

function save(config: Record<DeleteEntity, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function useDeleteConfig() {
  const [config, setConfig] = useState<Record<DeleteEntity, boolean>>(load)

  const toggle = (entity: DeleteEntity) => {
    const next = { ...config, [entity]: !config[entity] }
    setConfig(next)
    save(next)
  }

  const canDelete = (entity: DeleteEntity) => config[entity]

  return { config, toggle, canDelete }
}
