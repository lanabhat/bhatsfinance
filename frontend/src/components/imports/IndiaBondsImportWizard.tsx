import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { importApi } from '../../api/importApi'
import type {
  ChangeSummary as ChangeSummaryData, IndiaBondsAction, IndiaBondsApplyResult, IndiaBondsExtras, IndiaBondsFieldDiff,
  IndiaBondsFilePreview, IndiaBondsItem, IndiaBondsStatus, ValuationIssue,
} from '../../api/importApi'
import { portfolioApi } from '../../api/portfolioApi'
import { useApp } from '../../context/AppContext'
import { apiErrorText } from '../../hooks/errorUtils'
import { useChangePreview } from '../../hooks/useChangePreview'
import { useErrorToast } from '../../hooks/useErrorToast'
import type { Account } from '../../types/domain'
import { Amount } from '../ui/Amount'
import { Badge } from '../ui/Badge'
import type { BadgeTone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { controlClass } from '../ui/controls'
import { DateText } from '../ui/DateText'
import { Field, Input, Select } from '../ui/Input'
import { Notice } from '../ui/Notice'
import { Tabs } from '../ui/Tabs'
import { ChangePreviewPanel } from './ChangePreviewPanel'
import { ChangeSummary } from './ChangeSummary'

/** What each action does — shown under the action picker. Mirrors ingestion/indiabonds.py. */
const ACTION_HELP: Record<IndiaBondsAction, string> = {
  create: 'Adds this bond: a new bond entry with these terms and a buy for the settlement amount.',
  append: 'Applies every value from the deal sheet to the existing entry automatically. Credit rating, grace days and maturity value are kept; the redemption schedule is added to your notes. The buy is corrected if its amount or date differs.',
  edit: 'Choose, field by field, whether to keep the current value or take the deal sheet’s — or type your own. Only what you choose is written.',
  replace: 'Deletes the existing entry and its buy, then creates a fresh one from this deal sheet. The holding, its owner, past valuations and coupon-received history are kept.',
  skip: 'Changes nothing.',
}
const ACTION_LABELS: Record<IndiaBondsAction, string> = { create: 'Create', append: 'Append', edit: 'Edit', replace: 'Replace', skip: 'Skip' }

const STATUS: Record<IndiaBondsStatus, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'accent' },
  matched_changed: { label: 'Differs from your entry', tone: 'warning' },
  matched_same: { label: 'No changes', tone: 'success' },
  already_imported: { label: 'Already imported', tone: 'neutral' },
  duplicate: { label: 'Duplicate in this upload', tone: 'neutral' },
}

const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-yearly' }, { value: 'annual', label: 'Annual' },
  { value: 'cumulative', label: 'Cumulative (paid at maturity)' },
]
const BOND_TYPES = [
  { value: 'government', label: 'Government' }, { value: 'corporate', label: 'Corporate' },
  { value: 'tax_free', label: 'Tax-free' }, { value: 'sgb', label: 'Sovereign Gold Bond' },
  { value: 'ncd', label: 'NCD' }, { value: 'other', label: 'Other' },
]
const MONEY_FIELDS = new Set(['amount', 'price_per_unit', 'face_value'])
const DATE_FIELDS = new Set(['first_coupon_date', 'maturity_date', 'investment_date', 'tx_date'])
const NUMBER_FIELDS = new Set(['coupon_rate', 'quantity', ...MONEY_FIELDS])

type DealCard = {
  preview: IndiaBondsFilePreview
  action: IndiaBondsAction
  member_id: number | null
  account_id: number | null
  /** Edit: which side each field takes ('custom' once typed over). */
  choice: Record<string, 'current' | 'file' | 'custom'>
  /** The value each field will be written with (Edit / Create / Replace). */
  final: Record<string, string>
  extras: Pick<IndiaBondsExtras, 'credit_rating' | 'maturity_value' | 'notes'> & { grace_days: string }
  refresh_snapshot: boolean
  showAll: boolean
}

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v))

function actionsFor(p: IndiaBondsFilePreview): IndiaBondsAction[] {
  if (p.status === 'duplicate') return ['skip']
  if (p.deal.side === 'sell') return p.status === 'already_imported' ? ['skip'] : ['create', 'skip']
  return p.match ? ['append', 'edit', 'replace', 'skip'] : ['create', 'skip']
}

function defaultAction(p: IndiaBondsFilePreview): IndiaBondsAction {
  if (p.status === 'duplicate' || p.status === 'already_imported' || p.status === 'matched_same') return 'skip'
  return p.match ? 'append' : 'create'
}

function initialCard(p: IndiaBondsFilePreview): DealCard {
  const final: Record<string, string> = {}
  const choice: DealCard['choice'] = {}
  for (const d of p.diff) {
    final[d.field] = str(d.changed || d.current === null ? d.file ?? d.current : d.current)
    choice[d.field] = d.changed ? 'file' : 'current'
  }
  return {
    preview: p, action: defaultAction(p), choice, final,
    member_id: p.matched_member?.id ?? null,
    account_id: p.extras?.account_id ?? null,
    extras: {
      credit_rating: p.extras?.credit_rating ?? '', grace_days: str(p.extras?.grace_days ?? 15),
      maturity_value: p.extras?.maturity_value ?? null,
      // Matched lots keep their notes unless the user edits them; new ones start with the redemption line.
      notes: p.match ? (p.extras?.notes_appended ?? p.extras?.notes ?? '') : (p.extras?.notes ?? p.deal.notes ?? ''),
    },
    refresh_snapshot: false, showAll: false,
  }
}

function toItem(c: DealCard): IndiaBondsItem {
  const p = c.preview
  const item: IndiaBondsItem = {
    filename: p.filename, deal: p.deal, action: c.action, bond_details_id: p.match?.bond_details_id,
    member_id: c.member_id, account_id: c.account_id, refresh_snapshot: c.refresh_snapshot,
  }
  if (c.action === 'edit' || c.action === 'create' || c.action === 'replace') {
    item.values = c.final
    item.extras = { ...c.extras, grace_days: Number(c.extras.grace_days || 15) }
  }
  return item
}

function FieldValue({ field, value }: { field: string; value: string | number | null }) {
  if (value === null || value === '') return <span className="text-ink-faint">—</span>
  if (MONEY_FIELDS.has(field)) return <Amount value={String(value)} format="precise" />
  if (DATE_FIELDS.has(field)) return <DateText value={String(value)} />
  if (field === 'coupon_rate') return <span className="tabular-nums">{Number(value)}%</span>
  if (field === 'coupon_frequency') return <>{FREQUENCIES.find((f) => f.value === value)?.label ?? value}</>
  if (field === 'bond_type') return <>{BOND_TYPES.find((f) => f.value === value)?.label ?? value}</>
  return <>{value}</>
}

function FinalInput({ id, field, value, onChange }: { id: string; field: string; value: string; onChange: (v: string) => void }) {
  if (field === 'coupon_frequency' || field === 'bond_type') {
    return (
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label={field}>
        {(field === 'bond_type' ? BOND_TYPES : FREQUENCIES).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    )
  }
  return (
    <Input id={id} value={value} aria-label={field} onChange={(e) => onChange(e.target.value)}
      type={DATE_FIELDS.has(field) ? 'date' : NUMBER_FIELDS.has(field) ? 'number' : 'text'}
      step={NUMBER_FIELDS.has(field) ? 'any' : undefined} />
  )
}

export function IndiaBondsImportWizard({ householdId }: { householdId: number }) {
  const { refreshAll } = useApp()
  const errorToast = useErrorToast()
  const [step, setStep] = useState<'upload' | 'review' | 'result'>('upload')
  const [cards, setCards] = useState<DealCard[]>([])
  const [fileErrors, setFileErrors] = useState<{ filename: string; error: string; needsPassword: boolean }[]>([])
  const [pending, setPending] = useState<File[]>([])
  const [password, setPassword] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [refused, setRefused] = useState<ValuationIssue[] | null>(null)
  const [outcome, setOutcome] = useState<IndiaBondsApplyResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    portfolioApi.listAccounts(householdId).then(setAccounts).catch(errorToast('Couldn’t load accounts'))
  }, [householdId, errorToast])

  const upload = async (files: File[], pw = password) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) { setError('Choose one or more deal sheet PDFs.'); return }
    setError('')
    setLoading(true)
    setPending(pdfs)
    try {
      const previews = await importApi.previewIndiaBondsFiles(householdId, pdfs, pw || undefined)
      setFileErrors(previews.filter((p) => p.error).map((p) => ({ filename: p.filename, error: p.error!, needsPassword: p.error_code === 'bad_password' })))
      const ok = previews.filter((p) => !p.error)
      setCards(ok.map(initialCard))
      setAcknowledged(false)
      setRefused(null)
      if (ok.length) setStep('review')
    } catch (e) {
      setError(apiErrorText(e, 'Couldn’t read the deal sheets.'))
    } finally {
      setLoading(false)
    }
  }

  const update = (index: number, patch: Partial<DealCard> | ((c: DealCard) => Partial<DealCard>)) =>
    setCards((prev) => prev.map((c, i) => (i === index ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)))

  const items = useMemo(() => cards.map(toItem), [cards])
  const active = items.filter((i) => i.action !== 'skip')

  // The dry run: what applying would change, and how the affected holdings would be valued.
  const dryRun = useChangePreview(['applyIndiaBonds', householdId, active], step === 'review' && active.length > 0,
    () => importApi.applyIndiaBondsImport(householdId, active, true))

  const issues = refused ?? dryRun.data?.valuation_issues ?? []
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  // Which card each issue belongs to: the instrument the dry run filed that deal under.
  const instrumentOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of dryRun.data?.results ?? []) {
      if (r.instrument_id) m.set(r.filename, r.instrument_id)
    }
    for (const c of cards) if (c.preview.match && !m.has(c.preview.filename)) m.set(c.preview.filename, c.preview.match.instrument_id)
    return m
  }, [dryRun.data, cards])
  const issuesFor = (c: DealCard) => c.action === 'skip' ? [] : issues.filter((i) => i.instrument_id === instrumentOf.get(c.preview.filename))

  const fix = (issue: ValuationIssue) => {
    const index = cards.findIndex((c) => instrumentOf.get(c.preview.filename) === issue.instrument_id && c.action !== 'skip')
    if (index < 0) return
    const field = issue.fields[0]
    update(index, (c) => ({ action: c.preview.match ? 'edit' : c.action, showAll: true }))
    requestAnimationFrame(() => {
      const el = document.getElementById(field ? `ib-${index}-${field}` : `ib-card-${index}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus()
    })
  }

  const apply = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await importApi.applyIndiaBondsImport(householdId, active, false, acknowledged)
      setOutcome(res)
      setStep('result')
      void refreshAll()
    } catch (e) {
      const body = e as { error?: string; valuation_issues?: ValuationIssue[] }
      if (body?.valuation_issues) setRefused(body.valuation_issues)
      setError(body?.error ?? apiErrorText(e, 'Import failed.'))
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep('upload'); setCards([]); setFileErrors([]); setPending([]); setOutcome(null); setError(''); setRefused(null); setAcknowledged(false)
  }

  if (step === 'upload') {
    return (
      <div className="grid gap-4">
        <Notice title="How to get your deal sheets">
          <ol className="m-0 grid list-decimal gap-1 pl-4">
            <li>Sign in to IndiaBonds (indiabonds.com).</li>
            <li>Click your profile icon and open <strong>My orders</strong>.</li>
            <li>Select the bond.</li>
            <li>Open <strong>Deal Sheet</strong> and click <strong>Download</strong>.</li>
            <li>Repeat for each bond, then upload all the PDFs here together — each one is a single trade.</li>
          </ol>
        </Notice>
        <div
          role="button" tabIndex={0}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-line bg-surface-2 p-8 text-center hover:border-accent"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
          onDrop={(e) => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)) }}
          onDragOver={(e) => e.preventDefault()}
        >
          <FileUp className="h-8 w-8 text-ink-muted" aria-hidden />
          <p className="text-sm font-medium text-ink">Drop deal sheet PDFs here</p>
          <p className="text-xs text-ink-muted">or click to choose — several at once is fine</p>
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden"
            onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        </div>
        {loading && <p className="text-center text-sm text-ink-muted">Reading deal sheets…</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {fileErrors.map((f) => <Notice key={f.filename} tone="danger" title={f.filename}>{f.error}</Notice>)}
        {fileErrors.some((f) => f.needsPassword) && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="PDF password" htmlFor="ib-password" className="min-w-48 flex-1">
              <Input id="ib-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button onClick={() => void upload(pending, password)} loading={loading}>Try again</Button>
          </div>
        )}
      </div>
    )
  }

  if (step === 'result' && outcome) {
    const failed = outcome.results.filter((r) => r.status === 'error')
    return (
      <div className="grid gap-4">
        <Notice tone={failed.length ? 'warning' : 'success'} title={failed.length ? `Imported with ${failed.length} error${failed.length === 1 ? '' : 's'}` : 'Import complete'} />
        <div className="grid gap-2">
          {outcome.results.map((r) => (
            <div key={r.filename} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-line px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">{r.instrument_name ?? r.filename}</span>
              <Badge tone={r.status === 'error' ? 'danger' : r.status === 'skipped' ? 'neutral' : 'success'}>{r.status}</Badge>
              {r.error && <span className="w-full text-xs text-danger">{r.error}</span>}
              {r.changed && r.changed.length > 0 && <span className="w-full text-xs text-ink-muted">Changed: {r.changed.join(', ').replace(/_/g, ' ')}</span>}
              {!!r.coupon_acks_moved && <span className="w-full text-xs text-ink-muted">{r.coupon_acks_moved} coupon receipt{r.coupon_acks_moved === 1 ? '' : 's'} kept on the new entry</span>}
            </div>
          ))}
        </div>
        {outcome.valuation_issues.length > 0 && <IssueList issues={outcome.valuation_issues} />}
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-ink">What changed</p>
          <ChangeSummary summary={outcome.change_summary as ChangeSummaryData} />
        </div>
        <Button variant="secondary" onClick={reset}>Import more deal sheets</Button>
      </div>
    )
  }

  const memberOptions = cards[0]?.preview.members ?? []
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">{cards.length} deal sheet{cards.length === 1 ? '' : 's'} read. Choose what to do with each.</p>
        <Button variant="link" onClick={reset}>Upload different files</Button>
      </div>
      {fileErrors.map((f) => <Notice key={f.filename} tone="danger" title={`Couldn’t read ${f.filename}`}>{f.error}</Notice>)}

      {cards.map((c, index) => {
        const p = c.preview
        const options = actionsFor(p)
        const changed = p.diff.filter((d) => d.changed)
        const showTable = c.action === 'edit' || c.action === 'create' || c.action === 'replace'
        const rows: IndiaBondsFieldDiff[] = c.action === 'edit' && !c.showAll ? changed : p.diff
        const cardIssues = issuesFor(c)
        return (
          <Card key={p.filename} as="div">
            <div id={`ib-card-${index}`} tabIndex={-1} className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{p.deal.security_name}</p>
                  <p className="text-xs text-ink-muted">
                    {p.deal.order_id} · {p.deal.quantity} unit{p.deal.quantity === 1 ? '' : 's'} · <Amount value={p.deal.settlement_amount} format="precise" /> on <DateText value={p.deal.value_date} />
                    {p.match && <> · matches <strong className="text-ink-2">{p.match.instrument_name}</strong></>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={p.deal.side === 'sell' ? 'neutral' : 'accent'}>{p.deal.side === 'sell' ? 'Sell' : 'Buy'}</Badge>
                  <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                </div>
              </div>

              {options.length > 1 && (
                <div className="grid gap-2">
                  <Tabs label="What to do" size="sm" active={c.action} onChange={(a) => update(index, { action: a })}
                    tabs={options.map((o) => ({ key: o, label: p.deal.side === 'sell' && o === 'create' ? 'Record sell' : ACTION_LABELS[o] }))} />
                  <p className="text-xs text-ink-muted">{p.deal.side === 'sell' && c.action === 'create'
                    ? 'Records the sale and takes the units from your oldest bond entries first.' : ACTION_HELP[c.action]}</p>
                </div>
              )}

              {p.deal.side === 'sell' && c.action === 'create' && (
                p.sell_plan.length ? (
                  <ul className="m-0 grid gap-1 pl-4 text-sm text-ink-2">
                    {p.sell_plan.map((s) => <li key={s.bond_details_id}>{s.instrument_name}: {s.quantity_before} → {s.quantity_after} units</li>)}
                  </ul>
                ) : <Notice tone="danger" title="No units of this bond are recorded">Record the buy first.</Notice>
              )}

              {c.action === 'append' && (
                changed.length || p.extras.notes_appended !== p.extras.notes ? (
                  <ul className="m-0 grid gap-1 pl-4 text-sm text-ink-2">
                    {changed.map((d) => (
                      <li key={d.field}>{d.label}: <FieldValue field={d.field} value={d.current} /> → <FieldValue field={d.field} value={d.file} /></li>
                    ))}
                    {p.extras.notes_appended && p.extras.notes_appended !== p.extras.notes && <li>Notes: + {p.deal.notes}</li>}
                  </ul>
                ) : <p className="text-sm text-ink-muted">Nothing differs — Append only tags the entry with this order ID.</p>
              )}

              {c.action === 'replace' && p.match && (
                <Notice tone="danger" title="This deletes your current entry">
                  The bond entry{p.match.funding ? <> and its buy of <Amount value={p.match.funding.amount} format="precise" /> on <DateText value={p.match.funding.tx_date} /></> : null} will
                  be deleted and recreated from this deal sheet. Kept: the holding, its owner and past valuations
                  {p.match.coupon_acks ? `, and ${p.match.coupon_acks} coupon receipt${p.match.coupon_acks === 1 ? '' : 's'}` : ''}.
                </Notice>
              )}

              {showTable && (
                <div className="grid gap-2">
                  {c.action === 'edit' && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => update(index, () => ({
                        choice: Object.fromEntries(p.diff.map((d) => [d.field, d.file === null ? 'current' : 'file'])),
                        final: Object.fromEntries(p.diff.map((d) => [d.field, str(d.file ?? d.current)])),
                      }))}>Use all deal sheet values</Button>
                      <Button size="sm" variant="secondary" onClick={() => update(index, (cur) => ({
                        choice: Object.fromEntries(p.diff.map((d) => [d.field, 'current'])),
                        final: { ...cur.final, ...Object.fromEntries(p.diff.map((d) => [d.field, str(d.current)])) },
                      }))}>Keep all current</Button>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-ink-muted">
                          <th className="py-2 pr-3 font-medium">Field</th>
                          {c.action === 'edit' && <th className="py-2 pr-3 font-medium">Current</th>}
                          <th className="py-2 pr-3 font-medium">Deal sheet</th>
                          <th className="py-2 font-medium">Value to save</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {rows.map((d) => {
                          const pick = (side: 'current' | 'file') => update(index, (cur) => ({
                            choice: { ...cur.choice, [d.field]: side },
                            final: { ...cur.final, [d.field]: str(side === 'file' ? d.file : d.current) },
                          }))
                          return (
                            <tr key={d.field} className="align-middle">
                              <td className="py-2 pr-3 text-ink-2">{d.label}</td>
                              {c.action === 'edit' && (
                                <td className="py-2 pr-3">
                                  <label className="flex items-center gap-2">
                                    <input type="radio" name={`ib-${index}-${d.field}-side`} checked={c.choice[d.field] === 'current'}
                                      onChange={() => pick('current')} className="h-4 w-4 accent-[var(--primary)]" />
                                    <FieldValue field={d.field} value={d.current} />
                                  </label>
                                </td>
                              )}
                              <td className="py-2 pr-3">
                                <label className="flex items-center gap-2">
                                  {c.action === 'edit' && (
                                    <input type="radio" name={`ib-${index}-${d.field}-side`} checked={c.choice[d.field] === 'file'}
                                      onChange={() => pick('file')} disabled={d.file === null} className="h-4 w-4 accent-[var(--primary)]" />
                                  )}
                                  <FieldValue field={d.field} value={d.file} />
                                </label>
                              </td>
                              <td className="py-2">
                                <FinalInput id={`ib-${index}-${d.field}`} field={d.field} value={c.final[d.field] ?? ''}
                                  onChange={(v) => update(index, (cur) => ({ final: { ...cur.final, [d.field]: v }, choice: { ...cur.choice, [d.field]: 'custom' } }))} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {c.action === 'edit' && p.diff.length > changed.length && (
                    <Button size="sm" variant="link" onClick={() => update(index, { showAll: !c.showAll })}>
                      {c.showAll ? 'Hide unchanged fields' : `Show ${p.diff.length - changed.length} unchanged`}
                    </Button>
                  )}
                </div>
              )}

              {showTable && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(c.action === 'create' || c.action === 'replace') && (
                    <>
                      <Field label="Member" htmlFor={`ib-${index}-member`}>
                        <Select id={`ib-${index}-member`} value={c.member_id ?? ''} onChange={(e) => update(index, { member_id: e.target.value ? Number(e.target.value) : null })}>
                          <option value="">Unassigned</option>
                          {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Paid from" htmlFor={`ib-${index}-account`} hint="The bank account the settlement was debited from.">
                        <Select id={`ib-${index}-account`} value={c.account_id ?? ''} onChange={(e) => update(index, { account_id: e.target.value ? Number(e.target.value) : null })}>
                          <option value="">Not tracked</option>
                          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </Select>
                      </Field>
                    </>
                  )}
                  <Field label="Credit rating" htmlFor={`ib-${index}-credit_rating`} hint="Not on the deal sheet.">
                    <Input id={`ib-${index}-credit_rating`} placeholder="e.g. AAA" value={c.extras.credit_rating}
                      onChange={(e) => update(index, (cur) => ({ extras: { ...cur.extras, credit_rating: e.target.value } }))} />
                  </Field>
                  <Field label="Coupon reminder grace days" htmlFor={`ib-${index}-grace_days`}>
                    <Input id={`ib-${index}-grace_days`} type="number" min="0" value={c.extras.grace_days}
                      onChange={(e) => update(index, (cur) => ({ extras: { ...cur.extras, grace_days: e.target.value } }))} />
                  </Field>
                  <Field label="Maturity value (₹)" htmlFor={`ib-${index}-maturity_value`} hint="Optional — what you’ll receive at maturity.">
                    <Input id={`ib-${index}-maturity_value`} type="number" min="0" step="0.01" value={c.extras.maturity_value ?? ''}
                      onChange={(e) => update(index, (cur) => ({ extras: { ...cur.extras, maturity_value: e.target.value || null } }))} />
                  </Field>
                  <Field label="Notes" htmlFor={`ib-${index}-notes`} className="sm:col-span-2">
                    <textarea id={`ib-${index}-notes`} rows={2} className={`${controlClass} h-auto py-2`} value={c.extras.notes}
                      onChange={(e) => update(index, (cur) => ({ extras: { ...cur.extras, notes: e.target.value } }))} />
                  </Field>
                </div>
              )}

              {cardIssues.length > 0 && <IssueList issues={cardIssues} onFix={fix}
                onRefresh={(on) => update(index, { refresh_snapshot: on })} refresh={c.refresh_snapshot} />}
            </div>
          </Card>
        )
      })}

      {active.length > 0 ? (
        <ChangePreviewPanel loading={dryRun.isFetching} error={dryRun.error}
          sections={dryRun.data ? [{ summary: dryRun.data.change_summary }] : undefined} />
      ) : <p className="text-sm text-ink-muted">Every deal sheet is set to Skip — nothing to import.</p>}

      {errors.length > 0 && (
        <Notice tone="danger" title={`${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before importing`}>
          Use Fix on each card above — the import is blocked so no holding ends up valued wrongly.
        </Notice>
      )}
      {warnings.length > 0 && errors.length === 0 && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
          I’ve checked the {warnings.length} warning{warnings.length === 1 ? '' : 's'} above and want to import anyway.
        </label>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void apply()} loading={loading}
          disabled={active.length === 0 || dryRun.isFetching || errors.length > 0 || (warnings.length > 0 && !acknowledged)}>
          Apply {active.length} deal sheet{active.length === 1 ? '' : 's'}
        </Button>
        <Button variant="secondary" onClick={reset}>Cancel</Button>
      </div>
    </div>
  )
}

function IssueList({ issues, onFix, onRefresh, refresh }: {
  issues: ValuationIssue[]; onFix?: (i: ValuationIssue) => void; onRefresh?: (on: boolean) => void; refresh?: boolean
}) {
  return (
    <div className="grid gap-2">
      {issues.map((i, n) => (
        <Notice key={`${i.code}-${n}`} tone={i.severity === 'error' ? 'danger' : i.severity === 'warning' ? 'warning' : 'info'} title={i.message}
          action={onFix && i.severity !== 'info' && i.fields.length > 0 ? <Button size="sm" variant="secondary" onClick={() => onFix(i)}>Fix</Button> : undefined}>
          {i.suggestion}
          {i.code === 'valuation_scale' && onRefresh && (
            <label className="mt-2 flex items-center gap-2 text-ink">
              <input type="checkbox" checked={!!refresh} onChange={(e) => onRefresh(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
              Write a fresh formula valuation for this holding
            </label>
          )}
        </Notice>
      ))}
    </div>
  )
}
