import { useEffect, useRef, useState } from 'react'
import { importApi } from '../../api/importApi'
import { portfolioApi } from '../../api/portfolioApi'
import type { NpsConfirmedItem, NpsFilePreview, NpsFileResult } from '../../api/importApi'
import type { Account } from '../../types/domain'
import { Button } from '../ui/Button'

type Props = { householdId: number }

type Step = 'upload' | 'confirm' | 'result'

type FileRow = {
  filename: string
  error?: string
  preview?: NpsFilePreview
}

export function NpsImportWizard({ householdId }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<FileRow[]>([])
  const [items, setItems] = useState<NpsConfirmedItem[]>([])
  const [results, setResults] = useState<NpsFileResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    portfolioApi.listAccounts(householdId).then(setAccounts).catch(() => {})
  }, [householdId])

  const allMembers = rows.find(r => r.preview?.members && r.preview.members.length > 0)?.preview?.members ?? []

  const handleFiles = async (selected: File[]) => {
    if (selected.length === 0) return
    setError('')
    setLoading(true)
    try {
      const previews = await importApi.previewNpsFiles(householdId, selected)
      setRows(previews.map(p => ({ filename: p.filename, error: p.error, preview: p.error ? undefined : p })))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to preview files')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.csv'))
    handleFiles(dropped)
  }

  const proceedToConfirm = () => {
    const ready = rows.filter(r => r.preview)
    if (ready.length === 0) { setError('No files parsed successfully — check the errors above.'); return }
    setError('')
    setItems(ready.map(r => {
      const p = r.preview!
      return {
        filename: p.filename,
        pran: p.pran,
        tier: p.tier,
        statement_date: p.statement_date,
        total_value: p.total_value,
        total_contribution: p.total_contribution,
        schemes: p.schemes,
        member_id: p.matched_member?.id ?? null,
        account_id: null,
        affects_balance: false,
      }
    }))
    setStep('confirm')
  }

  const updateItem = (filename: string, patch: Partial<NpsConfirmedItem>) => {
    setItems(prev => prev.map(i => i.filename === filename ? { ...i, ...patch } : i))
  }

  const handleImport = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await importApi.applyNpsImport(householdId, items)
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
          Upload NPS transaction statement CSVs (Tier I and/or Tier II — export from the CRA/CAMS
          portal). Contributions are salary-deducted, so by default they're recorded against the
          NPS holding without touching any bank account balance.
        </p>
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] p-10 text-center cursor-pointer hover:border-primary-400 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <span className="text-3xl">📄</span>
          <p className="text-sm font-medium text-[var(--text)]">Drop NPS statement CSV(s) here</p>
          <p className="text-xs text-[var(--text-muted)]">or click to browse (.csv only)</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
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
                      ✓ Tier {row.preview.tier}
                    </span>
                  )}
                </div>
                {row.error && <p className="text-xs text-red-500">{row.error}</p>}
                {row.preview && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {row.preview.subscriber_name} · PRAN {row.preview.pran} · Value ₹{row.preview.total_value}
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
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">File / Tier</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Value (₹)</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Contributions</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Fee deductions</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Member</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Tag account (optional)</th>
                <th className="px-2 py-1.5 text-left font-semibold text-[var(--text-muted)]">Deduct from balance</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const preview = rows.find(r => r.filename === item.filename)?.preview
                const contributionCount = item.schemes.reduce(
                  (n, s) => n + s.transactions.filter(t => t.kind === 'contribution').length, 0,
                )
                const billingCount = item.schemes.reduce(
                  (n, s) => n + s.transactions.filter(t => t.kind === 'billing').length, 0,
                )
                return (
                  <tr key={item.filename} className="border-t border-[var(--border)] align-top">
                    <td className="px-2 py-1">
                      <span className="block max-w-[10rem] truncate font-mono text-[var(--text-muted)]" title={item.filename}>{item.filename}</span>
                      <span className="block font-semibold text-[var(--text)]">Tier {item.tier}</span>
                    </td>
                    <td className="px-2 py-1">{item.total_value}</td>
                    <td className="px-2 py-1">{contributionCount}</td>
                    <td className="px-2 py-1">{billingCount}</td>
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
                    <td className="px-2 py-1">
                      <select
                        className={cellInput}
                        value={item.account_id ?? ''}
                        onChange={e => updateItem(item.filename, { account_id: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">— none —</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        disabled={!item.account_id}
                        checked={item.account_id ? item.affects_balance : false}
                        onChange={e => updateItem(item.filename, { affects_balance: e.target.checked })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Contributions are deducted from your salary before it reaches any tracked account, so
          "Deduct from balance" stays off by default even if you tag an account for reference —
          turn it on only if this account's tracked balance genuinely needs to reflect the debit.
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
                  <p className="text-[var(--text-muted)]">Contributions added</p>
                  <p className="text-sm font-bold text-[var(--text)]">{r.contributions_created ?? 0}</p>
                </div>
                <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <p className="text-[var(--text-muted)]">Fee deductions added</p>
                  <p className="text-sm font-bold text-[var(--text)]">{r.fees_created ?? 0}</p>
                </div>
                {r.opening_contribution_backfilled && (
                  <div className="col-span-2 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                    <p className="text-[var(--text-muted)]">Prior-years contribution backfilled</p>
                    <p className="text-xs text-[var(--text)]">Added a one-time opening entry so gain reflects your full contribution history, not just this statement's period.</p>
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
