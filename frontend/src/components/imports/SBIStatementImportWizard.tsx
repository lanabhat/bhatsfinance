import { useRef, useState } from 'react'
import { importApi } from '../../api/importApi'
import type {
  SbiAccountMappingEntry,
  SbiConfirmedDeposit,
  SbiConfirmedSavingsAccount,
  SbiDepositResult,
  SbiExistingAccount,
  SbiMemberPreview,
  SbiSavingsAccountResult,
  SbiStatementFilePreview,
} from '../../api/importApi'
import { Button } from '../ui/Button'

type Props = { householdId: number }

type Step = 'upload' | 'map-accounts' | 'confirm' | 'result'

type FileRow = {
  filename: string
  status: 'pending' | 'unlocked' | 'needs_password'
  error?: string
  passwordInput: string
  savePassword: boolean
  preview?: SbiStatementFilePreview
}

type AccountMappingRow = {
  accountNumber: string
  mode: 'existing' | 'create'
  accountId: number | null
  newName: string
  memberId: number | null
}

const COMPOUNDING_OPTIONS = [
  { value: 'simple', label: 'Simple' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-Yearly' },
  { value: 'annually', label: 'Annually' },
]

export function SBIStatementImportWizard({ householdId }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<FileRow[]>([])
  const [mappingRows, setMappingRows] = useState<AccountMappingRow[]>([])
  const [savingsItems, setSavingsItems] = useState<SbiConfirmedSavingsAccount[]>([])
  const [depositItems, setDepositItems] = useState<SbiConfirmedDeposit[]>([])
  const [result, setResult] = useState<{ savings_accounts: SbiSavingsAccountResult[]; deposits: SbiDepositResult[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bulkFdMemberId, setBulkFdMemberId] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const allMembers: SbiMemberPreview[] =
    rows.find(r => r.preview?.members && r.preview.members.length > 0)?.preview?.members ?? []
  const existingAccounts: SbiExistingAccount[] =
    rows.find(r => r.preview?.existing_accounts && r.preview.existing_accounts.length > 0)?.preview?.existing_accounts ?? []

  const handleFiles = async (selected: File[]) => {
    if (selected.length === 0) return
    setFiles(selected)
    setError('')
    setLoading(true)
    try {
      const previews = await importApi.previewSBIStatementFiles(householdId, selected)
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
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xlsx'))
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
      const previews = await importApi.previewSBIStatementFiles(
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

  const proceedToMapAccounts = () => {
    const unlocked = rows.filter(r => r.status === 'unlocked' && r.preview)
    if (unlocked.length === 0) { setError('No files are ready — unlock at least one file first.'); return }
    setError('')

    // Only savings accounts and RD deposits need a real Account mapping —
    // apply_fd_advice_import has no account parameter, so FD account numbers
    // would otherwise force the user through a pointless mapping step for
    // every individual FD (this file can have dozens).
    const accountNumbers = Array.from(new Set(unlocked.flatMap(r => [
      ...r.preview!.savings_accounts.map(a => a.account_number),
      ...r.preview!.deposits.filter(d => d.doc_type === 'rd_statement').map(d => d.account_number),
    ])))
    setMappingRows(accountNumbers.map(accountNumber => {
      const existingMatch = existingAccounts.find(a => a.name.includes(accountNumber.slice(-4)))
      return {
        accountNumber,
        mode: existingMatch ? 'existing' : 'create',
        accountId: existingMatch?.id ?? null,
        newName: existingMatch ? '' : `SBI •••${accountNumber.slice(-4)}`,
        memberId: null,
      }
    }))
    setStep('map-accounts')
  }

  const updateMappingRow = (accountNumber: string, patch: Partial<AccountMappingRow>) => {
    setMappingRows(prev => prev.map(r => r.accountNumber === accountNumber ? { ...r, ...patch } : r))
  }

  const proceedToConfirm = () => {
    const incomplete = mappingRows.some(r =>
      r.mode === 'existing' ? !r.accountId : !r.newName.trim(),
    )
    if (incomplete) { setError('Map every account to an existing account or give it a name to create.'); return }
    setError('')

    const unlocked = rows.filter(r => r.status === 'unlocked' && r.preview)
    const memberFor = (accountNumber: string): number | null => {
      const mapping = mappingRows.find(m => m.accountNumber === accountNumber)
      return mapping?.memberId ?? null
    }

    setSavingsItems(unlocked.flatMap(r => r.preview!.savings_accounts.map(a => ({
      ...a,
      member_id: memberFor(a.account_number),
    }))))
    setDepositItems(unlocked.flatMap(r => r.preview!.deposits.map(d => ({
      ...d,
      member_id: memberFor(d.account_number),
      tenure_months: undefined,
    }))))
    setStep('confirm')
  }

  const updateSavingsItem = (accountNumber: string, patch: Partial<SbiConfirmedSavingsAccount>) => {
    setSavingsItems(prev => prev.map(i => i.account_number === accountNumber ? { ...i, ...patch } : i))
  }

  const updateDepositItem = (index: number, patch: Partial<SbiConfirmedDeposit>) => {
    setDepositItems(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  const applyMemberToAllFDs = (memberId: number) => {
    setDepositItems(prev => prev.map(item => item.doc_type === 'fd_advice' ? { ...item, member_id: memberId } : item))
  }

  const handleImport = async () => {
    const rdMissingTenure = depositItems.some(i => i.doc_type === 'rd_statement' && !i.tenure_months)
    if (rdMissingTenure) { setError('Enter tenure (months) for every RD deposit before importing.'); return }
    const rdMissingInstallment = depositItems.some(i => i.doc_type === 'rd_statement' && !i.installment_amount)
    if (rdMissingInstallment) { setError('Enter the installment amount for every RD deposit before importing.'); return }
    setError('')
    setLoading(true)
    try {
      const accountMapping: Record<string, SbiAccountMappingEntry> = {}
      for (const m of mappingRows) {
        accountMapping[m.accountNumber] = m.mode === 'existing'
          ? { account_id: m.accountId! }
          : { name: m.newName.trim(), member_id: m.memberId }
      }
      const res = await importApi.applySBIStatementImport(householdId, accountMapping, savingsItems, depositItems)
      setResult(res)
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
    setMappingRows([])
    setSavingsItems([])
    setDepositItems([])
    setResult(null)
    setError('')
  }

  const cellInput = 'w-full min-w-[6rem] rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-1 text-xs text-[var(--text)]'
  const th = 'px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]'
  const td = 'px-2 py-1'

  const memberSelect = (value: number | null, onChange: (v: number | null) => void) => (
    <select className={cellInput} value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">— select —</option>
      {allMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )

  if (step === 'upload') {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-[var(--text-2)]">
          Upload an SBI YONO "Account Summary" Excel export (.xlsx) — savings account balances and
          FD/RD deposits are imported together. Password-protected files are supported — if a saved
          password doesn't work, you'll be asked to enter one per file.
        </p>
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] p-10 text-center cursor-pointer hover:border-primary-400 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <span className="text-3xl">📊</span>
          <p className="text-sm font-medium text-[var(--text)]">Drop SBI Account Summary .xlsx here</p>
          <p className="text-xs text-[var(--text-muted)]">or click to browse (.xlsx only)</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
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
                        placeholder="Excel password"
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
            <Button onClick={proceedToMapAccounts}>Continue</Button>
          </div>
        )}
      </div>
    )
  }

  if (step === 'map-accounts') {
    return (
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text)]">Map Accounts</h3>
          <button type="button" onClick={reset} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            ← Upload different files
          </button>
        </div>
        <p className="text-sm text-[var(--text-2)]">
          Match each account number found in the statement to an existing account, or create a new one.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="grid gap-3">
          {mappingRows.map(row => (
            <div key={row.accountNumber} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 grid gap-2">
              <p className="text-sm font-mono text-[var(--text)]">Account •••{row.accountNumber.slice(-4)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <input
                    type="radio"
                    checked={row.mode === 'existing'}
                    onChange={() => updateMappingRow(row.accountNumber, { mode: 'existing' })}
                  />
                  Existing account
                </label>
                <select
                  className={cellInput}
                  disabled={row.mode !== 'existing'}
                  value={row.accountId ?? ''}
                  onChange={e => updateMappingRow(row.accountNumber, { accountId: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— select —</option>
                  {existingAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <input
                    type="radio"
                    checked={row.mode === 'create'}
                    onChange={() => updateMappingRow(row.accountNumber, { mode: 'create' })}
                  />
                  Create new account
                </label>
                <input
                  className={cellInput}
                  disabled={row.mode !== 'create'}
                  value={row.newName}
                  onChange={e => updateMappingRow(row.accountNumber, { newName: e.target.value })}
                  placeholder="Account name"
                />
              </div>
              <label className="grid gap-0.5 text-[10px] text-[var(--text-muted)] max-w-xs">
                Owner
                {memberSelect(row.memberId, v => updateMappingRow(row.accountNumber, { memberId: v }))}
              </label>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={proceedToConfirm}>Continue</Button>
          <Button variant="secondary" onClick={() => setStep('upload')}>Back</Button>
        </div>
      </div>
    )
  }

  if (step === 'confirm') {
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

        {savingsItems.length > 0 && (
          <div className="grid gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Savings Accounts ({savingsItems.length})</h4>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-2)]">
                  <tr>
                    <th className={th}>Account No.</th>
                    <th className={th}>Branch</th>
                    <th className={th}>ROI %</th>
                    <th className={th}>Balance</th>
                    <th className={th}>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {savingsItems.map(item => (
                    <tr key={item.account_number} className="border-t border-[var(--border)] align-top">
                      <td className={td}><span className="font-mono">•••{item.account_number.slice(-4)}</span></td>
                      <td className={td}>{item.branch}</td>
                      <td className={td}>{item.roi}</td>
                      <td className={td}><input className={cellInput} value={item.available_balance} onChange={e => updateSavingsItem(item.account_number, { available_balance: e.target.value })} /></td>
                      <td className={td}>{memberSelect(item.member_id, v => updateSavingsItem(item.account_number, { member_id: v }))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {depositItems.filter(i => i.doc_type === 'fd_advice').length > 0 && (
          <div className="grid gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Fixed Deposits ({depositItems.filter(i => i.doc_type === 'fd_advice').length})
            </h4>
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-[var(--surface-2)] p-2">
              <label className="grid gap-0.5 text-[10px] text-[var(--text-muted)]">
                Owner (all)
                <select className={cellInput} value={bulkFdMemberId} onChange={e => setBulkFdMemberId(e.target.value)}>
                  <option value="">— select —</option>
                  {allMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <Button size="sm" onClick={() => { if (bulkFdMemberId) applyMemberToAllFDs(Number(bulkFdMemberId)) }}>
                Apply to all FDs
              </Button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-2)]">
                  <tr>
                    <th className={th}>Account No.</th>
                    <th className={th}>Principal</th>
                    <th className={th}>Rate %</th>
                    <th className={th}>Invest Date</th>
                    <th className={th}>Maturity Date</th>
                    <th className={th}>Maturity Value</th>
                    <th className={th}>Compounding</th>
                    <th className={th}>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {depositItems.map((item, index) => item.doc_type !== 'fd_advice' ? null : (
                    <tr key={`${item.account_number}-${index}`} className="border-t border-[var(--border)] align-top">
                      <td className={td}><span className="font-mono">•••{item.account_number.slice(-4)}</span></td>
                      <td className={td}><input className={cellInput} value={item.principal ?? ''} onChange={e => updateDepositItem(index, { principal: e.target.value })} /></td>
                      <td className={td}><input className={cellInput} value={item.annual_rate} onChange={e => updateDepositItem(index, { annual_rate: e.target.value })} /></td>
                      <td className={td}><input type="date" className={cellInput} value={item.investment_date} onChange={e => updateDepositItem(index, { investment_date: e.target.value })} /></td>
                      <td className={td}><input type="date" className={cellInput} value={item.maturity_date} onChange={e => updateDepositItem(index, { maturity_date: e.target.value })} /></td>
                      <td className={td}><input className={cellInput} value={item.maturity_value ?? ''} onChange={e => updateDepositItem(index, { maturity_value: e.target.value })} /></td>
                      <td className={td}>{compoundingSelect(item.compounding, v => updateDepositItem(index, { compounding: v as SbiConfirmedDeposit['compounding'] }))}</td>
                      <td className={td}>{memberSelect(item.member_id, v => updateDepositItem(index, { member_id: v }))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {depositItems.filter(i => i.doc_type === 'rd_statement').length > 0 && (
          <div className="grid gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Recurring Deposits ({depositItems.filter(i => i.doc_type === 'rd_statement').length})
            </h4>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-2)]">
                  <tr>
                    <th className={th}>Account No.</th>
                    <th className={th}>Current Balance</th>
                    <th className={th}>Installment *</th>
                    <th className={th}>Rate %</th>
                    <th className={th}>Open Date</th>
                    <th className={th}>Tenure (mo) *</th>
                    <th className={th}>Compounding</th>
                    <th className={th}>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {depositItems.map((item, index) => item.doc_type !== 'rd_statement' ? null : (
                    <tr key={`${item.account_number}-${index}`} className="border-t border-[var(--border)] align-top">
                      <td className={td}><span className="font-mono">•••{item.account_number.slice(-4)}</span></td>
                      <td className={td}><input className={cellInput} value={item.current_balance ?? ''} onChange={e => updateDepositItem(index, { current_balance: e.target.value })} /></td>
                      <td className={td}><input className={cellInput} value={item.installment_amount ?? ''} onChange={e => updateDepositItem(index, { installment_amount: e.target.value })} /></td>
                      <td className={td}><input className={cellInput} value={item.annual_rate} onChange={e => updateDepositItem(index, { annual_rate: e.target.value })} /></td>
                      <td className={td}><input type="date" className={cellInput} value={item.investment_date} onChange={e => updateDepositItem(index, { investment_date: e.target.value })} /></td>
                      <td className={td}><input type="number" min={1} className={cellInput} value={item.tenure_months ?? ''} onChange={e => updateDepositItem(index, { tenure_months: e.target.value ? Number(e.target.value) : undefined })} /></td>
                      <td className={td}>{compoundingSelect(item.compounding, v => updateDepositItem(index, { compounding: v as SbiConfirmedDeposit['compounding'] }))}</td>
                      <td className={td}>{memberSelect(item.member_id, v => updateDepositItem(index, { member_id: v }))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              * Not present in the statement — enter the installment amount and tenure to complete the RD import.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleImport} loading={loading}>
            Import {savingsItems.length + depositItems.length} item{savingsItems.length + depositItems.length === 1 ? '' : 's'}
          </Button>
          <Button variant="secondary" onClick={() => setStep('map-accounts')}>Back</Button>
        </div>
      </div>
    )
  }

  // result step
  const savingsErrors = result?.savings_accounts.filter(r => r.error).length ?? 0
  const depositErrors = result?.deposits.filter(r => r.error).length ?? 0
  const totalErrors = savingsErrors + depositErrors

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
        {result?.savings_accounts.map(r => (
          <div key={`sa-${r.account_number}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 grid gap-2">
            <p className="text-sm font-semibold text-[var(--text)]">{r.account_name || `Account •••${r.account_number.slice(-4)}`}</p>
            {r.error ? (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">{r.error}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <p className="text-[var(--text-muted)]">Balance recorded</p>
                  <p className="text-sm font-bold text-[var(--text)]">₹{r.balance}</p>
                </div>
              </div>
            )}
          </div>
        ))}
        {result?.deposits.map((r, i) => (
          <div key={`dep-${r.account_number}-${i}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 grid gap-2">
            <p className="text-sm font-semibold text-[var(--text)]">{r.instrument_name || `Account •••${r.account_number.slice(-4)}`}</p>
            {r.error ? (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">{r.error}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <p className="text-[var(--text-muted)]">Status</p>
                  <p className="text-sm font-bold text-[var(--text)]">{r.created ? 'Created' : 'Updated'}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <Button variant="secondary" onClick={reset}>Import More Files</Button>
    </div>
  )
}
