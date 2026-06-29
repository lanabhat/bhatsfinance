import { useEffect, useRef, useState } from 'react'
import { importApi } from '../api/importApi'
import { normalizeApiError } from '../hooks/errorUtils'
import type {
  ImportApplyPayload,
  ImportFieldDef,
  ImportResult,
  ImportRowError,
  ImportSchema,
} from '../types/domain'

type Props = {
  householdId: number
  memberOptions: Array<{ id: number; label: string }>
  accountOptions: Array<{ id: number; label: string }>
  instrumentOptions: Array<{ id: number; label: string }>
}

type Step = 'upload' | 'map' | 'result'

const IMPORT_TYPES = [
  { key: 'valuations', label: 'Valuations / Holdings' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'instruments', label: 'Instruments' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'members', label: 'Members' },
  { key: 'insurance_policies', label: 'Insurance Policies' },
]

function downloadErrorCsv(errors: ImportRowError[]) {
  if (!errors.length) return
  const cols = ['row', 'reason', ...Object.keys(errors[0].data)]
  const lines = [cols.join(',')]
  for (const e of errors) {
    const vals = [e.row, `"${e.reason.replace(/"/g, '""')}"`, ...cols.slice(2).map((c) => `"${(e.data[c] ?? '').replace(/"/g, '""')}"`)]
    lines.push(vals.join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'import_errors.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function ImportWizard({ householdId, memberOptions, accountOptions, instrumentOptions }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [importType, setImportType] = useState('valuations')
  const [columns, setColumns] = useState<string[]>([])
  const [allRows, setAllRows] = useState<Record<string, string>[]>([])
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [schemas, setSchemas] = useState<Record<string, ImportSchema>>({})
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [userDefaults, setUserDefaults] = useState<Record<string, string>>({})
  const [showOptional, setShowOptional] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    importApi.getSchemas().then(setSchemas).catch(() => null)
  }, [])

  const schema: ImportSchema | null = schemas[importType] ?? null

  const handleFile = async (f: File) => {
    setFile(f)
    setError('')
    setUploading(true)
    try {
      const res = await importApi.previewFile(f)
      setColumns(res.columns)
      setPreview(res.preview)
      setAllRows(res.all_rows)
      setTotalRows(res.total_rows)
      // auto-map: try to match column names to field keys/labels
      if (schema) {
        const allFields = [...schema.required, ...schema.optional]
        const autoMap: Record<string, string> = {}
        for (const field of allFields) {
          const match = res.columns.find(
            (c) => c.toLowerCase().replace(/[^a-z0-9]/g, '') ===
              field.key.toLowerCase().replace(/[^a-z0-9]/g, '') ||
              c.toLowerCase().replace(/[^a-z0-9]/g, '') ===
              field.label.toLowerCase().replace(/[^a-z0-9]/g, '')
          )
          if (match) autoMap[field.key] = match
        }
        setMapping(autoMap)
      }
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) void handleFile(f)
  }

  const handleApply = async () => {
    if (!schema) return
    setApplying(true)
    setError('')
    try {
      const defaults: Record<string, string | number> = { ...schema.system_defaults, ...userDefaults }
      const payload: ImportApplyPayload = {
        household_id: householdId,
        import_type: importType,
        rows: allRows,
        mapping,
        defaults,
      }
      const res = await importApi.applyImport(payload)
      setResult(res)
      setStep('result')
    } catch (e) {
      setError(normalizeApiError(e))
    } finally {
      setApplying(false)
    }
  }

  const reset = () => {
    setStep('upload')
    setFile(null)
    setColumns([])
    setAllRows([])
    setPreview([])
    setTotalRows(0)
    setMapping({})
    setUserDefaults({})
    setResult(null)
    setError('')
    setShowOptional(false)
  }

  const fkOptions = (type: ImportFieldDef['type']) => {
    if (type === 'fk_account') return accountOptions
    if (type === 'fk_member') return memberOptions
    if (type === 'fk_instrument') return instrumentOptions
    return []
  }

  const renderDefaultInput = (field: ImportFieldDef) => {
    const val = userDefaults[field.key] ?? schema?.system_defaults[field.key] ?? ''
    const set = (v: string) => setUserDefaults((p) => ({ ...p, [field.key]: v }))

    if (field.type === 'fk_account' || field.type === 'fk_member' || field.type === 'fk_instrument') {
      const opts = fkOptions(field.type)
      return (
        <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm" value={val} onChange={(e) => set(e.target.value)}>
          <option value="">— select —</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )
    }
    if (field.type === 'choice' && field.choices) {
      return (
        <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm" value={val} onChange={(e) => set(e.target.value)}>
          <option value="">— select —</option>
          {field.choices.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )
    }
    return (
      <input
        type={field.type === 'date' ? 'date' : 'text'}
        className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm w-40"
        value={val}
        onChange={(e) => set(e.target.value)}
        placeholder={`default ${field.label}`}
      />
    )
  }

  const renderFieldRow = (field: ImportFieldDef) => {
    const col = mapping[field.key] ?? ''
    const usingDefault = !col

    return (
      <tr key={field.key} className="border-b border-[var(--border)]">
        <td className="py-2 pr-3 text-sm font-medium text-[var(--text-2)]">
          {field.label}
          {field.note ? <span className="ml-1 text-xs text-[var(--text-muted)]">({field.note})</span> : null}
        </td>
        <td className="py-2 pr-3">
          <select
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
            value={col}
            onChange={(e) => setMapping((p) => ({ ...p, [field.key]: e.target.value }))}
          >
            <option value="">(use default)</option>
            {columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </td>
        <td className="py-2">
          {usingDefault ? renderDefaultInput(field) : (
            <span className="text-xs text-[var(--text-muted)]">← from file</span>
          )}
        </td>
      </tr>
    )
  }

  // live preview: apply mapping to first 5 rows
  const previewResolved = preview.map((row) => {
    const resolved: Record<string, string> = {}
    const allFields = schema ? [...schema.required, ...schema.optional] : []
    for (const field of allFields) {
      const col = mapping[field.key]
      if (col && row[col] !== undefined) {
        resolved[field.key] = row[col]
      } else {
        resolved[field.key] = userDefaults[field.key] ?? schema?.system_defaults[field.key] ?? ''
      }
    }
    return resolved
  })

  return (
    <section className="grid single-col">
      <article className="panel">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="mb-0">Import Data</h2>
            <p className="muted mt-0.5">Upload any CSV, Excel, JSON, or PDF file and map columns to app fields.</p>
          </div>
          {step !== 'upload' && (
            <button type="button" className="secondary-btn" onClick={reset}>Start Over</button>
          )}
        </div>

        {/* Step indicators */}
        <div className="mb-5 flex items-center gap-2 text-xs font-medium">
          {(['upload', 'map', 'result'] as Step[]).map((s, i) => (
            <span key={s} className={`flex items-center gap-2 ${step === s ? 'text-primary-600' : 'text-[var(--text-muted)]'}`}>
              {i > 0 && <span className="text-slate-200">›</span>}
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === s ? 'bg-primary-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>{i + 1}</span>
              {s === 'upload' ? 'Upload' : s === 'map' ? 'Map Columns' : 'Results'}
            </span>
          ))}
        </div>

        {error ? <div className="error mb-3">{error}</div> : null}

        {/* ── Step 1: Upload ── */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-2)]">What are you importing?</label>
              <select
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={importType}
                onChange={(e) => setImportType(e.target.value)}
              >
                {IMPORT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              {schema && <p className="muted mt-1">{schema.description}</p>}
            </div>

            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] p-8 text-center transition-colors hover:border-primary-400 hover:bg-primary-50"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <svg className="h-8 w-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className="text-sm text-[var(--text-2)]">
                {uploading ? 'Parsing file…' : 'Drag & drop or click to select'}
              </p>
              <p className="text-xs text-[var(--text-muted)]">CSV, Excel (.xlsx), JSON, PDF</p>
              {file && !uploading && <p className="text-xs font-medium text-primary-600">{file.name}</p>}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json,.pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
              />
            </div>

            {columns.length > 0 && (
              <>
                <p className="text-sm text-[var(--text-2)]">
                  Found <strong>{totalRows}</strong> rows with <strong>{columns.length}</strong> columns.
                </p>
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i}>{columns.map((c) => <td key={c}>{row[c]}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row-actions">
                  <button type="button" className="h-11 rounded-lg bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700" onClick={() => setStep('map')}>
                    Continue to Mapping →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 2: Map columns ── */}
        {step === 'map' && schema && (
          <div className="space-y-5">
            <p className="text-sm text-[var(--text-2)]">
              Map each app field to a column from your file, or set a default value.
            </p>

            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>App Field</th>
                    <th>File Column</th>
                    <th>Default Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colSpan={3} className="pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Required</td></tr>
                  {schema.required.map(renderFieldRow)}

                  {schema.optional.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={3} className="pb-1 pt-3">
                          <button
                            type="button"
                            className="text-xs font-medium text-primary-600 hover:text-primary-700"
                            onClick={() => setShowOptional((p) => !p)}
                          >
                            {showOptional ? '▾ Hide optional fields' : '▸ Show optional fields'}
                          </button>
                        </td>
                      </tr>
                      {showOptional && (
                        <>
                          <tr><td colSpan={3} className="pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Optional</td></tr>
                          {schema.optional.map(renderFieldRow)}
                        </>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Live preview */}
            {previewResolved.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Preview (resolved values)</h4>
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        {[...schema.required, ...(showOptional ? schema.optional : [])].map((f) => (
                          <th key={f.key}>{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewResolved.map((row, i) => (
                        <tr key={i}>
                          {[...schema.required, ...(showOptional ? schema.optional : [])].map((f) => (
                            <td key={f.key}>{row[f.key] || <span className="text-[var(--text-faint)]">—</span>}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="row-actions">
              <button type="button" className="secondary-btn" onClick={() => setStep('upload')}>← Back</button>
              <button
                type="button"
                className="h-11 rounded-lg bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                onClick={() => void handleApply()}
                disabled={applying}
              >
                {applying ? 'Importing…' : `Import ${totalRows} rows`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Results ── */}
        {step === 'result' && result && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/15 p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{result.created}</p>
                <p className="text-xs text-emerald-600">Created</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
                <p className="text-2xl font-bold text-[var(--text-2)]">{result.skipped}</p>
                <p className="text-xs text-[var(--text-muted)]">Skipped (already exists)</p>
              </div>
              <div className={`rounded-xl border p-4 text-center ${result.errors.length ? 'border-red-200 bg-red-50 dark:bg-red-900/15' : 'border-[var(--border)] bg-[var(--surface-2)]'}`}>
                <p className={`text-2xl font-bold ${result.errors.length ? 'text-red-600' : 'text-[var(--text-2)]'}`}>{result.errors.length}</p>
                <p className={`text-xs ${result.errors.length ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>Errors</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-red-700 dark:text-red-300">Error Details</h4>
                  <button type="button" className="secondary-btn text-xs" onClick={() => downloadErrorCsv(result.errors)}>
                    Download errors CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr><th>Row</th><th>Reason</th></tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e) => (
                        <tr key={e.row}>
                          <td>{e.row}</td>
                          <td className="text-red-600">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="row-actions">
              <button type="button" className="h-11 rounded-lg bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700" onClick={reset}>
                Import Another File
              </button>
            </div>
          </div>
        )}
      </article>
    </section>
  )
}
