import { useRef, useState } from 'react'
import { importApi } from '../../api/importApi'
import type { PpfConfirmedItem, PpfFilePreview, PpfFileResult } from '../../api/importApi'
import { Button } from '../ui/Button'

type Props = { householdId: number }

type Step = 'upload' | 'confirm' | 'result'

type FileRow = {
  filename: string
  error?: string
  preview?: PpfFilePreview
}

export function PpfStatementImportWizard({ householdId }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<FileRow[]>([])
  const [items, setItems] = useState<PpfConfirmedItem[]>([])
  const [results, setResults] = useState<PpfFileResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const allMembers = rows.find(r => r.preview?.members && r.preview.members.length > 0)?.preview?.members ?? []

  const handleFiles = async (selected: File[]) => {
    if (selected.length === 0) return
    setError('')
    setLoading(true)
    try {
      const previews = await importApi.previewPpfStatementFiles(householdId, selected)
      setRows(previews.map(p => ({ filename: p.filename, error: p.error, preview: p.error ? undefined : p })))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to preview files')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(f => /\.xlsx?$/i.test(f.name))
    handleFiles(dropped)
  }

  const proceedToConfirm = () => {
    const ready = rows.filter(r => r.preview)
    if (ready.length === 0) { setError('No files parsed successfully — check the errors above.'); return }
    setError('')
    // Statements must be applied oldest-first, same reasoning as EPF.
    const sorted = [...ready].sort((a, b) => a.preview!.statement_from.localeCompare(b.preview!.statement_from))
    setItems(sorted.map(r => {
      const p = r.preview!
      return {
        filename: p.filename,
        account_no: p.account_no,
        open_date: p.open_date,
        statement_from: p.statement_from,
        statement_to: p.statement_to,
        opening_balance: p.opening_balance,
        closing_balance: p.closing_balance,
        transactions: p.transactions,
        member_id: p.matched_member?.id ?? null,
        estimated_prior_principal: p.opening_balance,
      }
    }))
    setStep('confirm')
  }

  const updateItem = (filename: string, patch: Partial<PpfConfirmedItem>) => {
    setItems(prev => prev.map(i => i.filename === filename ? { ...i, ...patch } : i))
  }

  const handleImport = async () => {
    setError('')
    setLoading(true)
    try {
      const res: PpfFileResult[] = []
      for (const item of items) {
        const [single] = await importApi.applyPpfStatementImport(householdId, [item])
        res.push(single)
      }
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
    setRows([])
    setItems([])
    setResults([])
    setError('')
  }

  const cellInput = 'w-full min-w-[6rem] rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-1 text-xs text-[var(--text)]'

  if (step === 'upload') {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-[var(--text-2)]">
          Upload PPF account statement .xls files (from your bank's net banking — usually only
          covers a recent window, not the account's full history). If your bank can't provide
          older statements, you'll get a chance to estimate the pre-statement principal on the
          next step.
        </p>
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] p-10 text-center cursor-pointer hover:border-primary-400 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <span className="text-3xl">📄</span>
          <p className="text-sm font-medium text-[var(--text)]">Drop PPF statement .xls file(s) here</p>
          <p className="text-xs text-[var(--text-muted)]">or click to browse (.xls / .xlsx)</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            multiple
            className="hidden"
            onChange={e => handleFiles(Array.from(e.target.files ?? []))}
          />
        </div>
        {loading && <p className="text-sm text-[var(--text-muted)] text-center">Parsing files…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {rows.length > 0 && (
          <div className="grid gap-2">
            {rows.map(row => (
              <div key={row.filename} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-[var(--text)]" title={row.filename}>{row.filename}</span>
                  {row.preview && (
                    <span className="text-green-500 text-sm shrink-0">
                      ✓ {row.preview.statement_from} → {row.preview.statement_to}
                    </span>
                  )}
                </div>
                {row.error && <p className="text-xs text-red-500">{row.error}</p>}
                {row.preview && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {row.preview.holder_name} · A/C {row.preview.account_no} · Closing ₹
                    {parseFloat(row.preview.closing_balance).toLocaleString('en-IN')}
                  </p>
                )}
              </div>
            ))}
            <Button onClick={proceedToConfirm}>Continue</Button>
          </div>
        )}
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="grid gap-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text)]">Review & Confirm</h3>
          <button type="button" onClick={reset} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            ← Upload different files
          </button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">File / Period</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Opening (₹)</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Closing (₹)</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Deposits found</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Est. principal before this statement (₹)</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Member</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const preview = rows.find(r => r.filename === item.filename)?.preview
                const depositCount = item.transactions.filter(t => t.kind === 'deposit').length
                const opening = parseFloat(item.opening_balance)
                const estPrincipal = parseFloat(item.estimated_prior_principal || '0')
                const estInterest = Math.max(opening - estPrincipal, 0)
                return (
                  <tr key={item.filename} className="border-t border-[var(--border)] align-top">
                    <td className="px-2 py-1">
                      <span className="block max-w-[10rem] truncate font-mono text-[var(--text-muted)]" title={item.filename}>{item.filename}</span>
                      <span className="block font-semibold text-[var(--text)]">{item.statement_from} → {item.statement_to}</span>
                      {item.open_date && (
                        <span className="block text-[var(--text-muted)]">A/C opened {item.open_date}</span>
                      )}
                    </td>
                    <td className="px-2 py-1">{opening.toLocaleString('en-IN')}</td>
                    <td className="px-2 py-1">{parseFloat(item.closing_balance).toLocaleString('en-IN')}</td>
                    <td className="px-2 py-1">{depositCount}</td>
                    <td className="px-2 py-1">
                      <input
                        className={cellInput}
                        type="number"
                        value={item.estimated_prior_principal}
                        onChange={e => updateItem(item.filename, { estimated_prior_principal: e.target.value })}
                      />
                      {estInterest > 0 && (
                        <p className="mt-1 text-[10px] text-amber-500">
                          ≈₹{estInterest.toLocaleString('en-IN')} treated as prior interest (not counted as invested)
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <select
                        className={cellInput}
                        value={item.member_id ?? ''}
                        onChange={e => updateItem(item.filename, { member_id: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">— unassigned —</option>
                        {allMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      {preview?.matched_member && (
                        <span className={preview.matched_member.confidence >= 0.8 ? 'text-green-500' : 'text-amber-400'}>
                          {' '}{preview.matched_member.confidence >= 0.8 ? '✓' : '⚠'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Bank statements often only cover a recent window, not your full PPF history since account
          opening. "Est. principal before this statement" defaults to the full opening balance
          (assumes zero prior growth — understates real returns) — edit it down if you know roughly
          how much you'd actually deposited before this period; the difference is tracked as prior
          interest, not invested. Only the earliest imported statement uses this estimate.
        </p>

        <div className="flex gap-2">
          <Button onClick={handleImport} loading={loading}>Import {items.length} statement{items.length === 1 ? '' : 's'}</Button>
          <Button variant="secondary" onClick={reset}>Cancel</Button>
        </div>
      </div>
    )
  }

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
                  <p className="text-[var(--text-muted)]">Deposits added</p>
                  <p className="text-sm font-bold text-[var(--text)]">{r.contributions_created ?? 0}</p>
                </div>
                <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <p className="text-[var(--text-muted)]">Interest credits seen</p>
                  <p className="text-sm font-bold text-[var(--text)]">{r.interest_created ?? 0}</p>
                </div>
                {r.opening_balance_backfilled && (
                  <div className="col-span-2 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <p className="text-[var(--text-muted)]">Opening balance backfilled</p>
                    <p className="text-xs text-[var(--text)]">
                      Added a one-time entry for your estimated pre-statement principal
                      {r.estimated_prior_interest && parseFloat(r.estimated_prior_interest) > 0
                        ? ` (₹${parseFloat(r.estimated_prior_interest).toLocaleString('en-IN')} treated as unattributed prior interest, not invested).`
                        : '.'}
                    </p>
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
