import { useRef, useState } from 'react'
import { importApi } from '../../api/importApi'
import type { EpfConfirmedItem, EpfFilePreview, EpfFileResult } from '../../api/importApi'
import { Button } from '../ui/Button'

type Props = { householdId: number }

type Step = 'upload' | 'confirm' | 'result'

type FileRow = {
  filename: string
  error?: string
  preview?: EpfFilePreview
}

export function EpfPassbookImportWizard({ householdId }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<FileRow[]>([])
  const [items, setItems] = useState<EpfConfirmedItem[]>([])
  const [results, setResults] = useState<EpfFileResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const allMembers = rows.find(r => r.preview?.members && r.preview.members.length > 0)?.preview?.members ?? []

  const handleFiles = async (selected: File[]) => {
    if (selected.length === 0) return
    setError('')
    setLoading(true)
    try {
      const previews = await importApi.previewEpfPassbookFiles(householdId, selected)
      setRows(previews.map(p => ({ filename: p.filename, error: p.error, preview: p.error ? undefined : p })))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to preview files')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    handleFiles(dropped)
  }

  const proceedToConfirm = () => {
    const ready = rows.filter(r => r.preview)
    if (ready.length === 0) { setError('No files parsed successfully — check the errors above.'); return }
    setError('')
    // Passbooks must be imported oldest-financial-year-first (the backend
    // rejects an opening balance dated earlier than history already
    // imported), so sort here rather than relying on upload order.
    const sorted = [...ready].sort((a, b) => (a.preview!.fy_start_year) - (b.preview!.fy_start_year))
    setItems(sorted.map(r => {
      const p = r.preview!
      return {
        filename: p.filename,
        uan: p.uan,
        opening_date: p.opening_date,
        opening_employee: p.opening_employee,
        opening_employer: p.opening_employer,
        opening_pension: p.opening_pension,
        closing_date: p.closing_date,
        closing_employee: p.closing_employee,
        closing_employer: p.closing_employer,
        closing_pension: p.closing_pension,
        transactions: p.transactions,
        member_id: p.matched_member?.id ?? null,
      }
    }))
    setStep('confirm')
  }

  const updateItem = (filename: string, patch: Partial<EpfConfirmedItem>) => {
    setItems(prev => prev.map(i => i.filename === filename ? { ...i, ...patch } : i))
  }

  const handleImport = async () => {
    setError('')
    setLoading(true)
    try {
      // Apply sequentially (not Promise.all) — order matters: each year's
      // opening-balance backfill depends on the prior year already existing.
      const res: EpfFileResult[] = []
      for (const item of items) {
        const [single] = await importApi.applyEpfPassbookImport(householdId, [item])
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
          Upload EPFO Member Passbook PDFs (one per financial year — download from the EPFO member
          portal). Contributions are salary-deducted, so they're recorded against the EPF holding
          without touching any bank account balance. If uploading multiple years, they're sorted
          and imported oldest-first automatically.
        </p>
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] p-10 text-center cursor-pointer hover:border-primary-400 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <span className="text-3xl">📄</span>
          <p className="text-sm font-medium text-[var(--text)]">Drop EPF passbook PDF(s) here</p>
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
                      ✓ FY {row.preview.fy_start_year}-{row.preview.fy_end_year}
                    </span>
                  )}
                </div>
                {row.error && <p className="text-xs text-red-500">{row.error}</p>}
                {row.preview && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {row.preview.member_name} · UAN {row.preview.uan} · Closing ₹
                    {(parseFloat(row.preview.closing_employee) + parseFloat(row.preview.closing_employer) + parseFloat(row.preview.closing_pension)).toLocaleString('en-IN')}
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
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">File / FY</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Opening (₹)</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Closing (₹)</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Months</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Member</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const preview = rows.find(r => r.filename === item.filename)?.preview
                const opening = parseFloat(item.opening_employee) + parseFloat(item.opening_employer) + parseFloat(item.opening_pension)
                const closing = parseFloat(item.closing_employee) + parseFloat(item.closing_employer) + parseFloat(item.closing_pension)
                return (
                  <tr key={item.filename} className="border-t border-[var(--border)] align-top">
                    <td className="px-2 py-1">
                      <span className="block max-w-[10rem] truncate font-mono text-[var(--text-muted)]" title={item.filename}>{item.filename}</span>
                      <span className="block font-semibold text-[var(--text)]">FY {preview?.fy_start_year}-{preview?.fy_end_year}</span>
                    </td>
                    <td className="px-2 py-1">{opening.toLocaleString('en-IN')}</td>
                    <td className="px-2 py-1">{closing.toLocaleString('en-IN')}</td>
                    <td className="px-2 py-1">{item.transactions.length}</td>
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
          Only the earliest imported year seeds an opening-balance entry — later years' passbooks
          restate the prior year's closing balance as their own "opening balance," so importing
          them all would otherwise double-count. Files are applied oldest-first automatically.
        </p>

        <div className="flex gap-2">
          <Button onClick={handleImport} loading={loading}>Import {items.length} passbook{items.length === 1 ? '' : 's'}</Button>
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
                  <p className="text-[var(--text-muted)]">Contribution rows added</p>
                  <p className="text-sm font-bold text-[var(--text)]">{r.contributions_created ?? 0}</p>
                </div>
                {r.opening_balance_backfilled && (
                  <div className="col-span-2 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <p className="text-[var(--text-muted)]">Opening balance backfilled</p>
                    <p className="text-xs text-[var(--text)]">Added a one-time opening entry so gain reflects your full contribution history, not just this passbook's period.</p>
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
