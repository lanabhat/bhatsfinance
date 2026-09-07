import { useState } from 'react'
import { diversificationApi } from '../../api/diversificationApi'
import type { Instrument } from '../../types/domain'

type Props = {
  instruments: Instrument[]
  onSave: () => void
  onCancel: () => void
}

export function UploadHoldingsSheet({ instruments, onSave, onCancel }: Props) {
  const [instrumentId, setInstrumentId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [asOfDate, setAsOfDate] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inp = 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  const save = async () => {
    if (!instrumentId) { setError('Select a fund.'); return }
    if (!file) { setError('Choose a .xlsx file.'); return }
    setSaving(true)
    setError('')
    try {
      await diversificationApi.uploadHoldings(Number(instrumentId), file, asOfDate || undefined, sourceUrl || undefined)
      onSave()
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'detail' in e ? String((e as { detail: unknown }).detail) : 'Failed to upload.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs text-[var(--text-muted)]">
        Upload the AMC's monthly portfolio disclosure (.xlsx) for this fund — download it from{' '}
        <a href="https://www.amfiindia.com/investor-corner/online-center/PortfolioDisclosure.html" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
          AMFI's portfolio disclosure page
        </a>{' '}
        or the AMC's own statutory disclosures page.
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Fund</label>
        <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} className={inp}>
          <option value="">— Select —</option>
          {instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Portfolio file (.xlsx)</label>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={inp} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">As-of date (optional — defaults to today)</label>
        <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className={inp} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Source URL (optional — for next time)</label>
        <input type="url" placeholder="https://…" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className={inp} />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">
          Cancel
        </button>
        <button type="button" disabled={saving} onClick={save} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </div>
  )
}
