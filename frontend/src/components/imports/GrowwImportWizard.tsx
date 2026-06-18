import { useRef, useState } from 'react'
import { importApi } from '../../api/importApi'
import type { GrowwFilePreview, GrowwFileResult, GrowwMemberPreview } from '../../api/importApi'
import { Button } from '../ui/Button'

type Props = { householdId: number }

type Assignment = { filename: string; member_id: number | null }

type Step = 'upload' | 'confirm' | 'result'

export function GrowwImportWizard({ householdId }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<GrowwFilePreview[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [results, setResults] = useState<GrowwFileResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const allMembers: GrowwMemberPreview[] =
    previews.find(p => p.members && p.members.length > 0)?.members ?? []

  const handleFiles = async (selected: File[]) => {
    if (selected.length === 0) return
    setFiles(selected)
    setError('')
    setLoading(true)
    try {
      const result = await importApi.previewGrowwFiles(householdId, selected)
      setPreviews(result)
      setAssignments(result.map(p => ({
        filename: p.filename,
        member_id: p.matched_member?.id ?? null,
      })))
      setStep('confirm')
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

  const setMember = (filename: string, memberId: number) => {
    setAssignments(prev => prev.map(a => a.filename === filename ? { ...a, member_id: memberId } : a))
  }

  const handleImport = async () => {
    const valid = assignments.filter(a => a.member_id !== null) as { filename: string; member_id: number }[]
    if (valid.length === 0) { setError('Assign at least one member before importing'); return }
    setError('')
    setLoading(true)
    try {
      const res = await importApi.applyGrowwImport(householdId, files, valid)
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
    setPreviews([])
    setAssignments([])
    setResults([])
    setError('')
  }

  if (step === 'upload') {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-[var(--text-2)]">
          Upload Groww or Upstox portfolio Excel exports (.xlsx). The investor name in each file
          is automatically matched to a household member — upload files for multiple members at once.
        </p>
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] p-10 text-center cursor-pointer hover:border-primary-400 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <span className="text-3xl">📂</span>
          <p className="text-sm font-medium text-[var(--text)]">Drop Groww or Upstox Excel files here</p>
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
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text)]">Review & Confirm Members</h3>
          <button type="button" onClick={reset} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            ← Upload different files
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Verify the member matched to each file. You can change the assignment using the dropdown.
        </p>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2.5">File</th>
                <th className="w-40 px-3 py-2.5">Detected Name</th>
                <th className="w-48 px-3 py-2.5">Member</th>
                <th className="w-20 px-3 py-2.5 text-right">Holdings</th>
              </tr>
            </thead>
            <tbody>
              {previews.map(p => {
                const asn = assignments.find(a => a.filename === p.filename)
                const confidence = p.matched_member?.confidence ?? 0
                const isUpstox = p.source === 'upstox'
                const holdingCount = isUpstox
                  ? (p.holdings_count ?? 0)
                  : (p.stocks_count + p.mf_count)
                const holdingLabel = isUpstox
                  ? `${holdingCount} equity`
                  : `${p.stocks_count}S · ${p.mf_count}MF`
                return (
                  <tr key={p.filename} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="block truncate text-xs text-[var(--text-2)]" title={p.filename}>
                          {p.filename}
                        </span>
                        <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium bg-[var(--surface-2)] text-[var(--text-muted)]">
                          {isUpstox ? 'Upstox' : 'Groww'}
                        </span>
                      </div>
                      {p.error && <span className="text-xs text-red-500">{p.error}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs text-[var(--text)]">{p.investor_name || '—'}</p>
                      {p.matched_member && (
                        <p className="text-[10px] text-[var(--text-muted)]">
                          → {p.matched_member.name}
                          {p.matched_member.relation ? ` (${p.matched_member.relation})` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <select
                          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text)]"
                          value={asn?.member_id ?? ''}
                          onChange={e => setMember(p.filename, Number(e.target.value))}
                        >
                          <option value="">— select —</option>
                          {allMembers.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name}{m.relation ? ` (${m.relation})` : ''}
                            </option>
                          ))}
                        </select>
                        {p.matched_member ? (
                          <span
                            className={confidence >= 0.8 ? 'text-green-500' : 'text-amber-400'}
                            title={`${Math.round(confidence * 100)}% name match`}
                          >
                            {confidence >= 0.8 ? '✓' : '⚠'}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]" title="No match found">?</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-[var(--text-muted)]">
                      {holdingLabel}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={handleImport} loading={loading}>
            Import
          </Button>
          <Button variant="secondary" onClick={reset}>Cancel</Button>
        </div>
      </div>
    )
  }

  // result step — handle both Groww (stocks_created/mf_created) and Upstox (holdings_created)
  type ExtendedResult = GrowwFileResult & { source?: string; holdings_created?: number; holdings_updated?: number; stocks_parsed?: number; mf_parsed?: number }
  const totalErrors = results.reduce((s, r) => s + (r.errors?.length ?? 0) + (r.error ? 1 : 0), 0)

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
        {results.map(r => {
          const er = r as ExtendedResult
          const isUpstox = er.source === 'upstox'
          return (
            <div key={r.filename} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 grid gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[var(--text)]">{r.member_name || r.filename}</p>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--surface-2)] text-[var(--text-muted)]">
                  {isUpstox ? 'Upstox' : 'Groww'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono">{r.filename}</p>
              {r.error ? (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">{r.error}</p>
              ) : isUpstox ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <p className="text-[var(--text-muted)]">New instruments</p>
                    <p className="text-lg font-bold text-[var(--text)]">{er.holdings_created ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <p className="text-[var(--text-muted)]">Updated</p>
                    <p className="text-lg font-bold text-[var(--text)]">{er.holdings_updated ?? 0}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <p className="text-[var(--text-muted)]">Stocks created</p>
                    <p className="text-lg font-bold text-[var(--text)]">{r.stocks_created ?? 0}</p>
                    {(er.stocks_parsed !== undefined) && <p className="text-[10px] text-[var(--text-muted)]">of {er.stocks_parsed} in file</p>}
                  </div>
                  <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <p className="text-[var(--text-muted)]">MFs created</p>
                    <p className="text-lg font-bold text-[var(--text)]">{r.mf_created ?? 0}</p>
                    {(er.mf_parsed !== undefined) && <p className="text-[10px] text-[var(--text-muted)]">of {er.mf_parsed} in file</p>}
                  </div>
                  <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <p className="text-[var(--text-muted)]">Valuations</p>
                    <p className="text-lg font-bold text-[var(--text)]">{r.valuations_created ?? 0}</p>
                  </div>
                </div>
              )}
              {r.errors && r.errors.length > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 grid gap-1">
                  {r.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-500">
                      Row {err.row} — {err.name}: {err.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Button variant="secondary" onClick={reset}>Import More Files</Button>
    </div>
  )
}
