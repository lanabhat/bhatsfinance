import { useEffect, useRef, useState } from 'react'
import { importApi } from '../../api/importApi'
import { portfolioApi } from '../../api/portfolioApi'
import type { FDAdviceConfirmedItem, FDAdviceFilePreview, FDAdviceFileResult, FDAdviceMemberPreview } from '../../api/importApi'
import type { Account } from '../../types/domain'
import { Button } from '../ui/Button'

type Props = { householdId: number }

type Step = 'upload' | 'confirm' | 'result'

type FileRow = {
  filename: string
  status: 'pending' | 'unlocked' | 'needs_password'
  error?: string
  passwordInput: string
  savePassword: boolean
  preview?: FDAdviceFilePreview
}

const COMPOUNDING_OPTIONS = [
  { value: 'simple', label: 'Simple' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-Yearly' },
  { value: 'annually', label: 'Annually' },
]

export function FDAdviceImportWizard({ householdId }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<FileRow[]>([])
  const [items, setItems] = useState<FDAdviceConfirmedItem[]>([])
  const [results, setResults] = useState<FDAdviceFileResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [bulkFdCompounding, setBulkFdCompounding] = useState('')
  const [bulkFdMemberId, setBulkFdMemberId] = useState('')
  const [bulkRdAccountId, setBulkRdAccountId] = useState('')
  const [bulkRdTenure, setBulkRdTenure] = useState('')
  const [bulkRdCompounding, setBulkRdCompounding] = useState('')
  const [bulkRdMemberId, setBulkRdMemberId] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    portfolioApi.listAccounts(householdId).then(setAccounts).catch(() => {})
  }, [householdId])

  const bankAccounts = accounts.filter(a => a.account_type === 'bank')

  const allMembers: FDAdviceMemberPreview[] =
    rows.find(r => r.preview?.members && r.preview.members.length > 0)?.preview?.members ?? []

  const handleFiles = async (selected: File[]) => {
    if (selected.length === 0) return
    setFiles(selected)
    setError('')
    setLoading(true)
    try {
      const previews = await importApi.previewFDAdviceFiles(householdId, selected)
      setRows(previews.map(p => ({
        filename: p.filename,
        status: p.error_code === 'bad_password' ? 'needs_password' : p.error ? 'pending' : 'unlocked',
        error: p.error,
        passwordInput: '',
        savePassword: true,
        preview: p.error ? undefined : p,
      })))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to preview files')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'))
    handleFiles(dropped)
  }

  const setRowPasswordInput = (filename: string, value: string) => {
    setRows(prev => prev.map(r => r.filename === filename ? { ...r, passwordInput: value } : r))
  }

  const setRowSavePassword = (filename: string, value: boolean) => {
    setRows(prev => prev.map(r => r.filename === filename ? { ...r, savePassword: value } : r))
  }

  const retryPassword = async (filename: string) => {
    const row = rows.find(r => r.filename === filename)
    const file = files.find(f => f.name === filename)
    if (!row || !file) return
    setRows(prev => prev.map(r => r.filename === filename ? { ...r, status: 'pending', error: undefined } : r))
    try {
      const previews = await importApi.previewFDAdviceFiles(
        householdId,
        [file],
        { [filename]: row.passwordInput },
        { [filename]: row.savePassword },
      )
      const p = previews[0]
      setRows(prev => prev.map(r => r.filename === filename ? {
        ...r,
        status: p.error_code === 'bad_password' ? 'needs_password' : p.error ? 'needs_password' : 'unlocked',
        error: p.error,
        preview: p.error ? undefined : p,
      } : r))
    } catch (e: unknown) {
      setRows(prev => prev.map(r => r.filename === filename ? {
        ...r, status: 'needs_password', error: e instanceof Error ? e.message : 'Retry failed',
      } : r))
    }
  }

  const proceedToConfirm = () => {
    const unlocked = rows.filter(r => r.status === 'unlocked' && r.preview)
    if (unlocked.length === 0) { setError('No files are ready — unlock at least one file first.'); return }
    setError('')
    setItems(unlocked.map(r => {
      const p = r.preview!
      const base: FDAdviceConfirmedItem = {
        filename: p.filename,
        doc_type: (p.doc_type || 'fd_advice') as 'fd_advice' | 'rd_statement',
        member_id: p.matched_member?.id ?? null,
        bank_name: p.bank_name,
        account_number: p.account_number,
        annual_rate: p.annual_rate,
        investment_date: p.investment_date,
        compounding: p.compounding || 'quarterly',
      }
      if (p.doc_type === 'rd_statement') {
        base.installment_amount = p.installment_amount
        base.current_balance = p.current_balance
        base.installment_count_observed = p.installment_count_observed
        base.tenure_months = undefined
      } else {
        base.principal = p.principal
        base.maturity_date = p.maturity_date
        base.maturity_value = p.maturity_value
      }
      return base
    }))
    setStep('confirm')
  }

  const updateItem = (filename: string, patch: Partial<FDAdviceConfirmedItem>) => {
    setItems(prev => prev.map(i => i.filename === filename ? { ...i, ...patch } : i))
  }

  const applyToAll = (docType: 'fd_advice' | 'rd_statement', patch: Partial<FDAdviceConfirmedItem>) => {
    setItems(prev => prev.map(i => i.doc_type === docType ? { ...i, ...patch } : i))
  }

  const handleImport = async () => {
    const rdMissingTenure = items.some(i => i.doc_type === 'rd_statement' && !i.tenure_months)
    if (rdMissingTenure) { setError('Enter tenure (months) for every RD statement before importing.'); return }
    const rdMissingAccount = items.some(i => i.doc_type === 'rd_statement' && !i.account_id)
    if (rdMissingAccount) { setError('Select the account future installments will be paid from for every RD statement before importing.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await importApi.applyFDAdviceImport(householdId, items)
      setResults(res)
      setStep('result')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep('upload')
    setFiles([])
    setRows([])
    setItems([])
    setResults([])
    setError('')
  }

  if (step === 'upload') {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-[var(--text-2)]">
          Upload FD advice letters or RD statements (.pdf). Password-protected files are supported —
          if a saved password doesn't work, you'll be asked to enter one per file.
        </p>
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] p-10 text-center cursor-pointer hover:border-primary-400 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <span className="text-3xl">📄</span>
          <p className="text-sm font-medium text-[var(--text)]">Drop FD/RD PDF statements here</p>
          <p className="text-xs text-[var(--text-muted)]">or click to browse (.pdf only)</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={e => handleFiles(Array.from(e.target.files ?? []))}
          />
        </div>
        {loading && <p className="text-sm text-[var(--text-muted)] text-center">Analysing files…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {rows.length > 0 && (
          <div className="grid gap-2">
            {rows.map(row => (
              <div key={row.filename} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-[var(--text)]" title={row.filename}>{row.filename}</span>
                  {row.status === 'unlocked' && <span className="text-green-500 text-sm shrink-0">✓ Unlocked</span>}
                </div>
                {row.status === 'needs_password' && (
                  <div className="grid gap-2">
                    {row.error && <p className="text-xs text-red-500">{row.error}</p>}
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        value={row.passwordInput}
                        onChange={e => setRowPasswordInput(row.filename, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') retryPassword(row.filename) }}
                        placeholder="PDF password"
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]"
                      />
                      <Button size="sm" onClick={() => retryPassword(row.filename)}>Try password</Button>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <input
                        type="checkbox"
                        checked={row.savePassword}
                        onChange={e => setRowSavePassword(row.filename, e.target.checked)}
                      />
                      Save this password for next time
                    </label>
                  </div>
                )}
                {row.status === 'pending' && row.error && <p className="text-xs text-red-500">{row.error}</p>}
              </div>
            ))}
            <Button onClick={proceedToConfirm}>Continue</Button>
          </div>
        )}
      </div>
    )
  }

  if (step === 'confirm') {
    const fdItems = items.filter(i => i.doc_type === 'fd_advice')
    const rdItems = items.filter(i => i.doc_type === 'rd_statement')
    const cellInput = 'w-full min-w-[6rem] rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-1 text-xs text-[var(--text)]'
    const th = 'px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]'
    const td = 'px-2 py-1'

    const memberSelect = (value: number | null, onChange: (v: number | null) => void, matched?: FDAdviceFilePreview['matched_member']) => (
      <div className="flex items-center gap-1">
        <select className={cellInput} value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— select —</option>
          {allMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {matched && (
          <span className={matched.confidence >= 0.8 ? 'text-green-500' : 'text-amber-400'} title={`${Math.round(matched.confidence * 100)}% match`}>
            {matched.confidence >= 0.8 ? '✓' : '⚠'}
          </span>
        )}
      </div>
    )

    const compoundingSelect = (value: string, onChange: (v: string) => void) => (
      <select className={cellInput} value={value} onChange={e => onChange(e.target.value)}>
        {COMPOUNDING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )

    return (
      <div className="grid gap-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text)]">Review & Confirm</h3>
          <button type="button" onClick={reset} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            ← Upload different files
          </button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}

        {fdItems.length > 0 && (
          <div className="grid gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">FD Advices ({fdItems.length})</h4>
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-[var(--surface-2)] p-2">
              <label className="grid gap-0.5 text-[10px] text-[var(--text-muted)]">
                Compounding (all)
                {compoundingSelect(bulkFdCompounding, setBulkFdCompounding)}
              </label>
              <label className="grid gap-0.5 text-[10px] text-[var(--text-muted)]">
                Member (all)
                <select className={cellInput} value={bulkFdMemberId} onChange={e => setBulkFdMemberId(e.target.value)}>
                  <option value="">— select —</option>
                  {allMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <Button size="sm" onClick={() => {
                const patch: Partial<FDAdviceConfirmedItem> = {}
                if (bulkFdCompounding) patch.compounding = bulkFdCompounding
                if (bulkFdMemberId) patch.member_id = Number(bulkFdMemberId)
                if (Object.keys(patch).length > 0) applyToAll('fd_advice', patch)
              }}>Apply to all FDs</Button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-2)]">
                  <tr>
                    <th className={th}>File</th>
                    <th className={th}>Bank</th>
                    <th className={th}>Account No.</th>
                    <th className={th}>Principal</th>
                    <th className={th}>Rate %</th>
                    <th className={th}>Invest Date</th>
                    <th className={th}>Maturity Date</th>
                    <th className={th}>Maturity Value</th>
                    <th className={th}>Compounding</th>
                    <th className={th}>Member</th>
                  </tr>
                </thead>
                <tbody>
                  {fdItems.map(item => {
                    const preview = rows.find(r => r.filename === item.filename)?.preview
                    return (
                      <tr key={item.filename} className="border-t border-[var(--border)] align-top">
                        <td className={td} title={item.filename}>
                          <span className="block max-w-[8rem] truncate font-mono text-[var(--text-muted)]">{item.filename}</span>
                          {preview?.warnings && preview.warnings.length > 0 && (
                            <span className="block text-amber-600 dark:text-amber-400" title={preview.warnings.join(' ')}>⚠ {preview.warnings.length} warning(s)</span>
                          )}
                        </td>
                        <td className={td}><input className={cellInput} value={item.bank_name} onChange={e => updateItem(item.filename, { bank_name: e.target.value })} /></td>
                        <td className={td}><input className={cellInput} value={item.account_number} onChange={e => updateItem(item.filename, { account_number: e.target.value })} /></td>
                        <td className={td}><input className={cellInput} value={item.principal ?? ''} onChange={e => updateItem(item.filename, { principal: e.target.value })} /></td>
                        <td className={td}><input className={cellInput} value={item.annual_rate} onChange={e => updateItem(item.filename, { annual_rate: e.target.value })} /></td>
                        <td className={td}><input type="date" className={cellInput} value={item.investment_date} onChange={e => updateItem(item.filename, { investment_date: e.target.value })} /></td>
                        <td className={td}><input type="date" className={cellInput} value={item.maturity_date ?? ''} onChange={e => updateItem(item.filename, { maturity_date: e.target.value })} /></td>
                        <td className={td}><input className={cellInput} value={item.maturity_value ?? ''} onChange={e => updateItem(item.filename, { maturity_value: e.target.value })} /></td>
                        <td className={td}>{compoundingSelect(item.compounding, v => updateItem(item.filename, { compounding: v }))}</td>
                        <td className={td}>{memberSelect(item.member_id, v => updateItem(item.filename, { member_id: v }), preview?.matched_member)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {rdItems.length > 0 && (
          <div className="grid gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">RD Statements ({rdItems.length})</h4>
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-[var(--surface-2)] p-2">
              <label className="grid gap-0.5 text-[10px] text-[var(--text-muted)]">
                Pay future installments from (all)
                <select className={cellInput} value={bulkRdAccountId} onChange={e => setBulkRdAccountId(e.target.value)}>
                  <option value="">— select account —</option>
                  {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="grid gap-0.5 text-[10px] text-[var(--text-muted)]">
                Tenure months (all)
                <input type="number" min={1} className={cellInput} value={bulkRdTenure} onChange={e => setBulkRdTenure(e.target.value)} />
              </label>
              <label className="grid gap-0.5 text-[10px] text-[var(--text-muted)]">
                Compounding (all)
                {compoundingSelect(bulkRdCompounding, setBulkRdCompounding)}
              </label>
              <label className="grid gap-0.5 text-[10px] text-[var(--text-muted)]">
                Member (all)
                <select className={cellInput} value={bulkRdMemberId} onChange={e => setBulkRdMemberId(e.target.value)}>
                  <option value="">— select —</option>
                  {allMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <Button size="sm" onClick={() => {
                const patch: Partial<FDAdviceConfirmedItem> = {}
                if (bulkRdAccountId) patch.account_id = Number(bulkRdAccountId)
                if (bulkRdTenure) patch.tenure_months = Number(bulkRdTenure)
                if (bulkRdCompounding) patch.compounding = bulkRdCompounding
                if (bulkRdMemberId) patch.member_id = Number(bulkRdMemberId)
                if (Object.keys(patch).length > 0) applyToAll('rd_statement', patch)
              }}>Apply to all RDs</Button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-2)]">
                  <tr>
                    <th className={th}>File</th>
                    <th className={th}>Bank</th>
                    <th className={th}>Account No.</th>
                    <th className={th}>Installment</th>
                    <th className={th}>Rate %</th>
                    <th className={th}>Open Date</th>
                    <th className={th}>Tenure (mo) *</th>
                    <th className={th}>Pay from *</th>
                    <th className={th}>Compounding</th>
                    <th className={th}>Member</th>
                  </tr>
                </thead>
                <tbody>
                  {rdItems.map(item => {
                    const preview = rows.find(r => r.filename === item.filename)?.preview
                    return (
                      <tr key={item.filename} className="border-t border-[var(--border)] align-top">
                        <td className={td} title={item.filename}>
                          <span className="block max-w-[8rem] truncate font-mono text-[var(--text-muted)]">{item.filename}</span>
                          {(preview?.installment_count_observed ?? 0) > 0 && (
                            <span className="block text-[var(--text-muted)]">{preview?.installment_count_observed} installments found</span>
                          )}
                          {preview?.warnings && preview.warnings.length > 0 && (
                            <span className="block text-amber-600 dark:text-amber-400" title={preview.warnings.join(' ')}>⚠ {preview.warnings.length} warning(s)</span>
                          )}
                        </td>
                        <td className={td}><input className={cellInput} value={item.bank_name} onChange={e => updateItem(item.filename, { bank_name: e.target.value })} /></td>
                        <td className={td}><input className={cellInput} value={item.account_number} onChange={e => updateItem(item.filename, { account_number: e.target.value })} /></td>
                        <td className={td}><input className={cellInput} value={item.installment_amount ?? ''} onChange={e => updateItem(item.filename, { installment_amount: e.target.value })} /></td>
                        <td className={td}><input className={cellInput} value={item.annual_rate} onChange={e => updateItem(item.filename, { annual_rate: e.target.value })} /></td>
                        <td className={td}><input type="date" className={cellInput} value={item.investment_date} onChange={e => updateItem(item.filename, { investment_date: e.target.value })} /></td>
                        <td className={td}><input type="number" min={1} className={cellInput} value={item.tenure_months ?? ''} onChange={e => updateItem(item.filename, { tenure_months: e.target.value ? Number(e.target.value) : undefined })} /></td>
                        <td className={td}>
                          <select className={cellInput} value={item.account_id ?? ''} onChange={e => updateItem(item.filename, { account_id: e.target.value ? Number(e.target.value) : undefined })}>
                            <option value="">— select —</option>
                            {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </td>
                        <td className={td}>{compoundingSelect(item.compounding, v => updateItem(item.filename, { compounding: v }))}</td>
                        <td className={td}>{memberSelect(item.member_id, v => updateItem(item.filename, { member_id: v }), preview?.matched_member)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              "Pay future installments from" only affects installments due after today — historical ones (already backfilled from the statement) won't touch that account's balance.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleImport} loading={loading}>Import {items.length} item{items.length === 1 ? '' : 's'}</Button>
          <Button variant="secondary" onClick={reset}>Cancel</Button>
        </div>
      </div>
    )
  }

  // result step
  const totalErrors = results.filter(r => r.error).length

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{totalErrors === 0 ? '✅' : '⚠️'}</span>
        <div>
          <p className="font-semibold text-[var(--text)]">Import complete</p>
          {totalErrors > 0 && <p className="text-sm text-amber-500">{totalErrors} errors — see details below</p>}
        </div>
      </div>
      <div className="grid gap-3">
        {results.map(r => (
          <div key={r.filename} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 grid gap-2">
            <p className="text-sm font-semibold text-[var(--text)]">{r.instrument_name || r.filename}</p>
            <p className="text-xs text-[var(--text-muted)] font-mono">{r.filename}</p>
            {r.error ? (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">{r.error}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <p className="text-[var(--text-muted)]">Status</p>
                  <p className="text-sm font-bold text-[var(--text)]">{r.created ? 'Created' : 'Updated'}</p>
                </div>
                {r.installments_backfilled !== undefined && (
                  <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <p className="text-[var(--text-muted)]">Installments backfilled</p>
                    <p className="text-sm font-bold text-[var(--text)]">{r.installments_backfilled}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <Button variant="secondary" onClick={reset}>Import More Files</Button>
    </div>
  )
}
