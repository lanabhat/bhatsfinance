import { useEffect, useMemo, useState } from 'react'
import { CoinSpinner } from '../components/common/CoinSpinner'
import type { Member, OptionItem } from '../types/domain'
import { householdApi } from '../api/householdApi'
import {
  gmailApi,
  type GmailAccountRule,
  type GmailConnectedAccount,
  type GmailGroup,
  type GmailEmailRow,
  type GmailImportGroup,
  type GmailGroupImportResult,
  type GmailRuleTemplate,
  type GmailRecipient,
  type GmailInstrumentProposal,
} from '../api/gmailApi'
import { useAuth } from '../context/AuthContext'

type Props = {
  householdId: number
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  memberOptions: OptionItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceCls(c: number) {
  if (c >= 0.8) return 'bg-green-100 text-green-800'
  if (c >= 0.5) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-700 dark:text-red-300'
}

function confidenceLabel(c: number) {
  if (c >= 0.8) return 'High'
  if (c >= 0.5) return 'Medium'
  return 'Low'
}

// Add Instrument modal
// ---------------------------------------------------------------------------

type AddInstrumentModalProps = {
  proposal: GmailInstrumentProposal
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
  fullMembers: Member[]
  onClose: () => void
  onCreated: (instrumentId: number, instrumentName: string) => void
}

const INSTRUMENT_TYPES = [
  { value: 'mutual_fund', label: 'Mutual Fund' },
  { value: 'sip', label: 'SIP' },
  { value: 'equity', label: 'Equity' },
  { value: 'fd', label: 'Fixed Deposit' },
  { value: 'rd', label: 'Recurring Deposit' },
  { value: 'epf', label: 'EPF' },
  { value: 'ppf', label: 'PPF' },
  { value: 'nps', label: 'NPS' },
  { value: 'gold', label: 'Gold' },
  { value: 'other', label: 'Other' },
]

function AddInstrumentModal({ proposal, accountOptions, memberOptions, fullMembers, onClose, onCreated }: AddInstrumentModalProps) {
  // Auto-match: find member whose email matches one of the proposal's recipient addresses
  const matchedMember = useMemo(() => {
    const recipientSet = new Set((proposal.recipients || []).map(e => e.toLowerCase()))
    return fullMembers.find(m => m.email && recipientSet.has(m.email.toLowerCase())) ?? null
  }, [proposal.recipients, fullMembers])

  // Auto-match account: pick account whose name contains a keyword derived from recipient domain
  // e.g. recipient from jupiter.money â†’ prefer account with "Jupiter" in name
  const suggestedAccountId = useMemo(() => {
    if (!proposal.recipients?.length) return ''
    // Build hints from recipient email domains and sender context
    const hints = proposal.recipients.flatMap(r => {
      const domain = r.split('@')[1] ?? ''
      return [domain.split('.')[0]]  // e.g. "jupiter", "hdfc", "sbi"
    })
    for (const hint of hints) {
      const match = accountOptions.find(a => a.label.toLowerCase().includes(hint.toLowerCase()))
      if (match) return String(match.id)
    }
    return ''
  }, [proposal.recipients, accountOptions])

  const [name, setName] = useState(proposal.scheme_name)
  const [folio, setFolio] = useState(proposal.folio_no ?? '')
  const [instType, setInstType] = useState(proposal.instrument_type || 'mutual_fund')
  const [memberId, setMemberId] = useState<number | ''>(matchedMember?.id ?? '')
  const [defaultAccountId, setDefaultAccountId] = useState<string>(suggestedAccountId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await gmailApi.createInstrument({
        scheme_name: name.trim(),
        folio_no: folio.trim() || null,
        instrument_type: instType,
        member_id: memberId || null,
        default_account_id: defaultAccountId ? Number(defaultAccountId) : null,
      })
      onCreated(res.instrument.id, res.instrument.name)
    } catch (e: any) {
      setError(e?.error ?? e?.detail?.[0] ?? 'Failed to create instrument.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl bg-[var(--surface)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--text)]">Add Instrument</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]">âœ•</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 grid gap-4">
          {/* Detected info strip */}
          <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/15 border border-indigo-100 px-4 py-2.5 text-xs text-indigo-700 dark:text-indigo-300">
            <p className="font-medium">Detected from email</p>
            <div className="mt-1 flex flex-wrap gap-3 text-indigo-600">
              {proposal.folio_no && <span>Folio: <strong>{proposal.folio_no}</strong></span>}
              {proposal.nav && <span>NAV: <strong>â‚¹{proposal.nav}</strong></span>}
              {proposal.units && <span>Units: <strong>{proposal.units}</strong></span>}
              <span>{proposal.email_count} email{proposal.email_count !== 1 ? 's' : ''}</span>
              {(proposal.recipients || []).map(r => <span key={r}>To: <strong>{r}</strong></span>)}
            </div>
            {matchedMember && (
              <p className="mt-1.5 text-indigo-700 dark:text-indigo-300">
                Recipient matched to member: <strong>{matchedMember.full_name}</strong>
              </p>
            )}
          </div>

          <label className="text-sm text-[var(--text-2)]">
            <span className="font-medium">Instrument name <span className="text-red-500">*</span></span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              placeholder="e.g. Kotak Gold Fund Growth - Direct"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-[var(--text-2)]">
              <span className="font-medium">Type</span>
              <select value={instType} onChange={(e) => setInstType(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm">
                {INSTRUMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>

            <label className="text-sm text-[var(--text-2)]">
              <span className="font-medium">Folio No</span>
              <input
                value={folio}
                onChange={(e) => setFolio(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
                placeholder="e.g. 12345678901"
              />
            </label>
          </div>

          <label className="text-sm text-[var(--text-2)]">
            <span className="font-medium">Owner (member)</span>
            {matchedMember
              ? <span className="ml-2 text-[11px] text-green-600 font-medium">auto-matched from recipient email</span>
              : <span className="ml-2 text-[11px] text-[var(--text-muted)]">no member email match found</span>}
            <select value={memberId} onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : '')} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm">
              <option value="">â€” no owner / skip â€”</option>
              {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>

          <label className="text-sm text-[var(--text-2)]">
            <span className="font-medium">Default account</span>
            {suggestedAccountId
              ? <span className="ml-2 text-[11px] text-green-600 font-medium">auto-suggested from recipient domain</span>
              : <span className="ml-2 text-[11px] text-[var(--text-muted)]">account used to fund this investment (optional)</span>}
            <select value={defaultAccountId} onChange={(e) => setDefaultAccountId(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm">
              <option value="">â€” none â€”</option>
              {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
          <button type="button" disabled={saving} onClick={handleSave}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Creatingâ€¦' : 'Create Instrument'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Instrument proposals list
// ---------------------------------------------------------------------------

type ProposalListProps = {
  proposals: GmailInstrumentProposal[]
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
  recipientEmails: string[]
  createdInstruments: Record<string, number>  // scheme_name -> instrument_id
  onOpenModal: (proposal: GmailInstrumentProposal) => void
}

function ProposalList({ proposals, createdInstruments, onOpenModal }: ProposalListProps) {
  const newProposals = proposals.filter((p) => !p.exists && !(p.scheme_name in createdInstruments))
  const existingProposals = proposals.filter((p) => p.exists || p.scheme_name in createdInstruments)

  if (proposals.length === 0) return null

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/15 px-5 py-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-[var(--text)]">Detected Instruments</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">Mutual fund schemes found in emails. Create them as instruments to enable import mapping.</p>
      </div>

      {newProposals.length > 0 && (
        <div className="grid gap-2 mb-3">
          {newProposals.map((p) => (
            <div key={p.scheme_name} className="rounded-xl border border-amber-200 bg-[var(--surface)] px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text)] leading-snug">{p.scheme_name}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                  {p.folio_no && <span>Folio: <strong>{p.folio_no}</strong></span>}
                  {p.nav && <span>NAV: <strong>â‚¹{p.nav}</strong></span>}
                  {p.units && <span>Units: <strong>{p.units}</strong></span>}
                  <span>{p.email_count} email{p.email_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenModal(p)}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                + Add Instrument
              </button>
            </div>
          ))}
        </div>
      )}

      {existingProposals.length > 0 && (
        <div className="grid gap-1.5">
          {existingProposals.map((p) => {
            const justCreated = p.scheme_name in createdInstruments && !p.exists
            return (
              <div key={p.scheme_name} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 flex items-center gap-3 opacity-70">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-2)]">{p.scheme_name}</p>
                  {p.folio_no && <p className="text-[11px] text-[var(--text-muted)]">Folio: {p.folio_no}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${justCreated ? 'bg-green-100 text-green-700 dark:text-green-300' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
                  {justCreated ? 'just created' : 'already exists'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Transaction preview row â€” one extracted transaction per email
// ---------------------------------------------------------------------------

const TX_TYPE_LABELS: Record<string, string> = {
  bank_debit_cc: 'CC Spend', cc_spend_alert: 'CC Spend', cc_transaction_alert: 'CC Spend',
  bank_debit_account: 'Debit', bank_inflow: 'Credit', neft_imps: 'UPI/Transfer', atm_withdrawal: 'ATM',
  emi_payment: 'EMI', insurance_premium: 'Insurance', mf_sip: 'SIP', jupiter_sip: 'SIP',
  stock_trade: 'Stock', bank_balance: 'Balance', cc_bill_statement: 'CC Bill',
  cc_bill_payment: 'Bill Payment', upi_debit: 'UPI',
  fastag_recharge: 'FASTag Recharge', fastag_toll: 'Toll Fee', cc_action_required: 'Action Needed',
  tds_deduction: 'TDS',
}

const TX_TYPE_COLORS: Record<string, string> = {
  'CC Spend':  'bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-300 border-red-200',
  'Debit':     'bg-orange-50 text-orange-700 border-orange-200',
  'Credit':    'bg-green-50 dark:bg-green-900/15 text-green-700 dark:text-green-300 border-green-200',
  'Transfer':  'bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-300 border-blue-200',
  'ATM':       'bg-orange-50 text-orange-700 border-orange-200',
  'EMI':       'bg-purple-50 dark:bg-purple-900/15 text-purple-700 dark:text-purple-300 border-purple-200',
  'Insurance': 'bg-purple-50 dark:bg-purple-900/15 text-purple-700 dark:text-purple-300 border-purple-200',
  'SIP':       'bg-indigo-50 dark:bg-indigo-900/15 text-indigo-700 dark:text-indigo-300 border-indigo-200',
  'Stock':     'bg-indigo-50 dark:bg-indigo-900/15 text-indigo-700 dark:text-indigo-300 border-indigo-200',
  'Balance':      'bg-teal-50 text-teal-700 border-teal-200',
  'CC Bill':      'bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-300 border-amber-200',
  'Bill Payment': 'bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-300 border-amber-200',
  'UPI':          'bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-300 border-blue-200',
  'UPI/Transfer':     'bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-300 border-blue-200',
  'FASTag Recharge':  'bg-teal-50 text-teal-700 border-teal-200',
  'Toll Fee':         'bg-orange-50 text-orange-700 border-orange-200',
  'Action Needed':    'bg-yellow-50 text-yellow-700 border-yellow-200',
  'TDS':              'bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-300 border-red-200',
}

type TxPreviewRowProps = {
  email: GmailEmailRow
  accountLabel: string
  txTypeLabel: string
  skipped: boolean
  onToggleSkip: (id: string) => void
}

function TxPreviewRow({ email, accountLabel, txTypeLabel, skipped, onToggleSkip }: TxPreviewRowProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [richFields, setRichFields] = useState<Record<string, { label: string; value: string }> | null>(null)
  const [bodyPreview, setBodyPreview] = useState('')

  const fields = richFields ?? email.extracted_fields ?? {}
  const merchant = fields.merchant?.value || fields.tx_info?.value || ''
  const cardSuffix = fields.card_suffix?.value || fields.account_suffix?.value || ''
  const typeColor = TX_TYPE_COLORS[txTypeLabel] ?? 'bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--border)]'

  async function loadDetails() {
    if (richFields !== null || loading) return
    setLoading(true)
    try {
      const res = await gmailApi.getMessageFields(email.message_id)
      setRichFields(res.fields)
      setBodyPreview(res.body_preview)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  return (
    <div className={`rounded-xl border transition-opacity ${skipped ? 'opacity-40' : ''} ${email.already_imported ? 'border-[var(--border)] bg-[var(--surface-2)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
      {/* Main transaction row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Include/exclude toggle */}
        <input
          type="checkbox"
          checked={!skipped && !email.already_imported}
          disabled={email.already_imported}
          onChange={() => onToggleSkip(email.message_id)}
          className="h-4 w-4 rounded border-[var(--border-2)] accent-primary-600 shrink-0"
          title={email.already_imported ? 'Already imported' : skipped ? 'Excluded â€” click to include' : 'Click to exclude'}
        />

        {/* Date */}
        <span className="w-20 shrink-0 text-xs text-[var(--text-muted)]">{email.date}</span>

        {/* Type badge */}
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${typeColor}`}>{txTypeLabel}</span>

        {/* Amount â€” most prominent */}
        <span className={`w-24 shrink-0 text-right font-semibold tabular-nums ${email.parsed.direction === 'inflow' ? 'text-green-700 dark:text-green-300' : 'text-[var(--text)]'}`}>
          {email.parsed.amount
            ? `${email.parsed.direction === 'inflow' ? '+' : 'âˆ’'}â‚¹${Number(email.parsed.amount).toLocaleString('en-IN')}`
            : <span className="text-[var(--text-faint)] font-normal">no amount</span>}
        </span>

        {/* Merchant / description */}
        <span className="flex-1 min-w-0 text-sm text-[var(--text-2)] truncate">
          {merchant || email.subject || 'â€”'}
        </span>

        {/* Account + card suffix */}
        <span className="hidden sm:block shrink-0 text-xs text-[var(--text-muted)] truncate max-w-[140px]">
          {accountLabel}{cardSuffix ? ` Â·Â·Â·${cardSuffix.slice(-4)}` : ''}
        </span>

        {/* Status */}
        {email.already_imported
          ? <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">imported</span>
          : skipped
            ? <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">excluded</span>
            : <span className="shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">new</span>
        }

        {/* Expand email toggle */}
        <button
          type="button"
          onClick={() => { setOpen(v => !v); if (!open) loadDetails() }}
          className="shrink-0 rounded p-1 text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
          title="Show email details"
        >
          {loading ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--border-2)] border-t-slate-600" /> : open ? 'â–²' : 'â–¼'}
        </button>
      </div>

      {/* Expandable email detail */}
      {open && (
        <div className="border-t border-[var(--border)] px-4 pb-3 pt-2">
          <div className="grid gap-2">
            {/* Subject + from */}
            <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
              <span><strong>From:</strong> {email.from}</span>
              <span><strong>To:</strong> {email.to}</span>
              <span className="truncate"><strong>Subject:</strong> {email.subject}</span>
            </div>

            {/* Extracted fields */}
            {Object.keys(fields).length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(fields).map(([k, f]) => (
                  <span key={k} className="text-xs">
                    <span className="text-[var(--text-muted)]">{f.label}: </span>
                    <span className="font-medium text-[var(--text-2)]">{f.value}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Raw body preview */}
            {bodyPreview && (
              <details>
                <summary className="cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--text-2)]">Show raw email text</summary>
                <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-[var(--surface-2)] p-2 text-[10px] text-[var(--text-muted)]">{bodyPreview}</pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group card
// ---------------------------------------------------------------------------

type GroupMapping = {
  skip: boolean
  sender: string
  template_key: string
  account_id: number
  instrument_id: number
  keyword: string
  recipient: string
  card_suffix: string
  target: 'account' | 'instrument'
}

type GroupCardProps = {
  group: GmailGroup
  templates: GmailRuleTemplate[]
  accountOptions: OptionItem[]
  instrumentOptions: OptionItem[]
  mapping: GroupMapping
  householdId: number | null
  skippedMessages: Set<string>
  onToggleSkip: (id: string) => void
  onChange: (m: GroupMapping) => void
}

function GroupCard({ group, templates, accountOptions, instrumentOptions, mapping, householdId, skippedMessages, onToggleSkip, onChange }: GroupCardProps) {
  const [open, setOpen] = useState(false)
  const [balanceUpdating, setBalanceUpdating] = useState(false)
  const [balanceMsg, setBalanceMsg] = useState('')
  const tmpl = templates.find((t) => t.key === mapping.template_key)

  // Count how many emails have auto-matched accounts
  const autoMatchCount = group.emails.filter((e) => e.auto_account_id).length

  const isBalanceTemplate = group.detected_template === 'bank_balance'

  async function handleUpdateBalance() {
    if (!mapping.account_id || !householdId) return
    // Use the most recent email's parsed amount as balance
    const latestEmail = [...group.emails].sort((a, b) => b.date.localeCompare(a.date))[0]
    const balanceStr = latestEmail?.parsed?.amount
    const date = latestEmail?.date
    if (!balanceStr || !date) {
      setBalanceMsg('No balance amount found in emails.')
      return
    }
    setBalanceUpdating(true)
    setBalanceMsg('')
    try {
      const { valuationApi } = await import('../api/valuationApi')
      await valuationApi.createValuation({
        household: householdId,
        account: mapping.account_id,
        instrument: null,
        valuation_date: date,
        balance: balanceStr,
        unit_price: null,
        market_value: null,
        source: 'api',
        notes: `Auto-updated from Gmail: ${latestEmail.subject?.slice(0, 80) ?? ''}`,
      })
      setBalanceMsg(`Balance updated to â‚¹${balanceStr} as of ${date}.`)
    } catch (e: any) {
      setBalanceMsg(e?.balance?.[0] ?? e?.error ?? 'Failed to update balance.')
    } finally {
      setBalanceUpdating(false)
    }
  }

  return (
    <div className={`rounded-2xl border bg-[var(--surface)] shadow-sm ${mapping.skip ? 'opacity-40' : ''} ${!mapping.skip && !mapping.account_id && mapping.target === 'account' ? 'border-amber-300' : 'border-[var(--border)]'}`}>
      {/* Card header */}
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {/* Row 1: sender + recipient + counts */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[var(--text)]">{group.sender_display || group.sender_domain}</p>
            <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--text-muted)]">{group.sender_domain}</span>
            {group.recipient && (
              <span className="rounded-full bg-blue-50 dark:bg-blue-900/15 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">To: {group.recipient}</span>
            )}
          </div>
          {/* Row 2: subject pattern â€” the key line */}
          {group.subject_bucket && (
            <p className="mt-1 text-sm text-[var(--text-2)] font-medium truncate" title={group.subject_bucket}>
              {group.subject_bucket}
            </p>
          )}
          {/* Row 3: sample real subjects for context */}
          {group.sample_subjects.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {group.sample_subjects.slice(0, 2).map((s, i) => (
                <span key={i} className="max-w-xs truncate rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]" title={s}>{s}</span>
              ))}
            </div>
          )}
          {/* Row 4: fund/scheme name */}
          {group.scheme_name && (
            <div className="mt-1">
              <span className="rounded-lg bg-indigo-50 dark:bg-indigo-900/15 border border-indigo-200 px-2 py-0.5 text-xs font-semibold text-indigo-800">{group.scheme_name}</span>
            </div>
          )}
          {/* Row 5: meta badges */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceCls(group.confidence)}`}>
              {confidenceLabel(group.confidence)} {Math.round(group.confidence * 100)}%
            </span>
            {group.detected_template && (
              <span className="rounded-full bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-2)]">
                {templates.find((t) => t.key === group.detected_template)?.label ?? group.detected_template}
              </span>
            )}
            <span className="text-xs text-[var(--text-muted)]">{group.email_count} emails</span>
            {group.already_imported_count > 0 && (
              <span className="text-xs text-[var(--text-muted)]">{group.already_imported_count} imported</span>
            )}
            {autoMatchCount > 0 && (
              <span className="rounded-full bg-green-50 dark:bg-green-900/15 border border-green-200 px-2 py-0.5 text-xs text-green-700 dark:text-green-300">{autoMatchCount} auto-matched</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isBalanceTemplate && mapping.account_id && (
            <button
              type="button"
              disabled={balanceUpdating}
              onClick={handleUpdateBalance}
              className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-50"
            >
              {balanceUpdating ? 'Updatingâ€¦' : 'Update balance'}
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer select-none">
            <input type="checkbox" checked={mapping.skip} onChange={(e) => onChange({ ...mapping, skip: e.target.checked })} />
            Skip
          </label>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            {open ? 'Collapse' : 'Configure'}
          </button>
        </div>
      </div>
      {balanceMsg && (
        <div className={`mx-4 mb-3 rounded-lg px-3 py-2 text-xs ${balanceMsg.startsWith('Balance updated') ? 'bg-teal-50 text-teal-700' : 'bg-red-50 dark:bg-red-900/15 text-red-600'}`}>
          {balanceMsg}
        </div>
      )}

      {/* Config panel */}
      {open && !mapping.skip && (
        <div className="border-t border-[var(--border)] px-4 py-3 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[var(--text-2)]">
              Pattern template
              <select
                value={mapping.template_key}
                onChange={(e) => {
                  const t = templates.find((x) => x.key === e.target.value)
                  onChange({ ...mapping, template_key: e.target.value, target: t?.target ?? 'account' })
                }}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              >
                <option value="">â€” none / manual â€”</option>
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              {tmpl && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{tmpl.description}</p>}
            </label>

            <label className="text-xs font-medium text-[var(--text-2)]">
              Sender match rule
              <input
                value={mapping.sender}
                onChange={(e) => onChange({ ...mapping, sender: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
                placeholder="e.g. @axis.bank.in"
              />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">Prefix with @ for domain-wide match</p>
            </label>

            {mapping.target === 'instrument' ? (
              <label className="text-xs font-medium text-[var(--text-2)]">
                Map to Instrument
                <select
                  value={mapping.instrument_id || ''}
                  onChange={(e) => onChange({ ...mapping, instrument_id: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
                >
                  <option value="">â€” select instrument â€”</option>
                  {instrumentOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
            ) : (
              <label className="text-xs font-medium text-[var(--text-2)]">
                Map to Account
                <select
                  value={mapping.account_id || ''}
                  onChange={(e) => onChange({ ...mapping, account_id: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
                >
                  <option value="">â€” select account â€”</option>
                  {accountOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
            )}

            <label className="text-xs font-medium text-[var(--text-2)]">
              Keyword filter (optional)
              <input
                value={mapping.keyword}
                onChange={(e) => onChange({ ...mapping, keyword: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
                placeholder="e.g. XX2133 â€” leave blank to match all"
              />
            </label>

            <label className="text-xs font-medium text-[var(--text-2)]">
              Recipient email (optional)
              <input
                value={mapping.recipient}
                onChange={(e) => onChange({ ...mapping, recipient: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
                placeholder="e.g. you@gmail.com"
              />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">Only match emails sent to this address</p>
            </label>

            <label className="text-xs font-medium text-[var(--text-2)]">
              Card last 4 digits (optional)
              <input
                value={mapping.card_suffix}
                onChange={(e) => onChange({ ...mapping, card_suffix: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
                placeholder="e.g. 3003"
                maxLength={4}
              />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">Routes to the right card when same sender has multiple cards</p>
            </label>
          </div>

        </div>
      )}

      {/* Transaction preview list â€” always shown */}
      <div className="border-t border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <span className="w-4 shrink-0" />
          <span className="w-20 shrink-0">Date</span>
          <span className="w-16 shrink-0">Type</span>
          <span className="w-24 shrink-0 text-right">Amount</span>
          <span className="flex-1">Description</span>
          <span className="hidden sm:block w-36 shrink-0">Account</span>
          <span className="w-16 shrink-0 text-center">Status</span>
          <span className="w-6 shrink-0" />
        </div>
        <div className="grid gap-1">
          {group.emails.map((email) => {
            const txLabel = TX_TYPE_LABELS[email.parsed.template_matched ?? ''] ?? TX_TYPE_LABELS[group.detected_template ?? ''] ?? 'Other'
            const acctLabel = accountOptions.find((a) => a.id === (mapping.account_id || email.auto_account_id))?.label ?? 'â€” unassigned â€”'
            return (
              <TxPreviewRow
                key={email.message_id}
                email={email}
                accountLabel={acctLabel}
                txTypeLabel={txLabel}
                skipped={skippedMessages.has(email.message_id)}
                onToggleSkip={onToggleSkip}
              />
            )
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
          <span>{group.emails.filter(e => !e.already_imported && !skippedMessages.has(e.message_id)).length} of {group.email_count} selected</span>
          <button type="button" onClick={() => group.emails.forEach(e => { if (!e.already_imported && !skippedMessages.has(e.message_id)) onToggleSkip(e.message_id) })} className="hover:text-[var(--text-2)] underline">Exclude all</button>
          <button type="button" onClick={() => group.emails.forEach(e => { if (!e.already_imported && skippedMessages.has(e.message_id)) onToggleSkip(e.message_id) })} className="hover:text-[var(--text-2)] underline">Include all</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recipient filter panel
// ---------------------------------------------------------------------------

type RecipientFilterProps = {
  recipients: GmailRecipient[]
  selected: Set<string>
  hidden: Set<string>
  onToggle: (email: string) => void
  onRemove: (email: string) => void
  onRestore: (email: string) => void
  onAddManual: (email: string) => void
}

function RecipientFilter({ recipients, selected, hidden, onToggle, onRemove, onRestore, onAddManual }: RecipientFilterProps) {
  const [showHidden, setShowHidden] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const visible = recipients.filter((r) => !hidden.has(r.email))
  const hiddenList = recipients.filter((r) => hidden.has(r.email))

  function submitManual() {
    const val = manualInput.trim().toLowerCase()
    if (val && val.includes('@')) {
      onAddManual(val)
      setManualInput('')
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs text-[var(--text-muted)]">
        Check/uncheck to temporarily show or hide groups. Click <strong>Ã—</strong> to permanently remove a recipient and its groups.
        Add addresses manually before fetching.
      </p>

      {/* Manual add */}
      <div className="flex gap-2">
        <input
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitManual() } }}
          placeholder="Add recipient email manuallyâ€¦"
          className="flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={submitManual}
          disabled={!manualInput.trim().includes('@')}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {/* Active recipients */}
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visible.map((r) => {
            const active = selected.has(r.email)
            return (
              <div key={r.email} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/15 text-blue-800' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
                {/* Checkbox-style toggle â€” temporarily show/hide groups */}
                <button type="button" onClick={() => onToggle(r.email)} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-sm border ${active ? 'bg-blue-500 border-blue-500' : 'bg-[var(--surface)] border-[var(--border-2)]'}`} />
                  {r.email}
                </button>
                {/* Ã— = permanently remove from list and hide its groups */}
                <button
                  type="button"
                  onClick={() => onRemove(r.email)}
                  className="ml-1.5 rounded-full text-[var(--text-muted)] hover:text-red-500"
                  title="Remove permanently â€” hides all groups from this recipient"
                >
                  Ã—
                </button>
              </div>
            )
          })}
        </div>
      )}

      {visible.length === 0 && !hiddenList.length && (
        <p className="text-xs text-[var(--text-muted)]">No recipients yet. Add one above or run Fetch to auto-detect.</p>
      )}

      {/* Removed/excluded recipients */}
      {hiddenList.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowHidden((v) => !v)} className="text-xs text-[var(--text-muted)] underline hover:text-[var(--text-2)]">
            {showHidden ? 'Hide removed' : `${hiddenList.length} removed recipient${hiddenList.length > 1 ? 's' : ''} â€” click to restore`}
          </button>
          {showHidden && (
            <div className="mt-2 flex flex-wrap gap-2">
              {hiddenList.map((r) => (
                <button key={r.email} type="button" onClick={() => onRestore(r.email)}
                  className="rounded-full border border-dashed border-[var(--border-2)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-blue-400 hover:text-blue-700 dark:text-blue-300">
                  + restore {r.email}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reset import history button
// ---------------------------------------------------------------------------

function ResetImportHistoryButton({ canWrite, onReset }: { canWrite: boolean; onReset: (deleted: number) => void }) {
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleReset() {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await gmailApi.resetImportHistory(true)
      setResult(`Cleared ${res.deleted} record${res.deleted !== 1 ? 's' : ''}. Next sync will re-import all matching emails.`)
      setConfirm(false)
      onReset(res.deleted)
    } catch (e: any) {
      setError(e?.error ?? e?.detail?.[0] ?? 'Failed to reset.')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/15 border border-green-200 rounded-lg px-3 py-2">{result}</p>
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/15 px-3 py-2">
        <span className="text-xs text-red-700 dark:text-red-300 flex-1">This will mark all previously-imported Gmail emails as unseen. Are you sure?</span>
        <button type="button" disabled={loading} onClick={handleReset}
          className="rounded px-3 py-1 text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
          {loading ? 'Clearingâ€¦' : 'Yes, clear'}
        </button>
        <button type="button" onClick={() => setConfirm(false)} className="rounded px-3 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    )
  }

  return (
    <button type="button" disabled={!canWrite} onClick={() => setConfirm(true)}
      className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:bg-red-900/15 disabled:opacity-40">
      Clear import history
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function GmailSyncPage({ householdId, accountOptions, instrumentOptions, memberOptions }: Props) {
  const { canWrite } = useAuth()

  const [connectedAccounts, setConnectedAccounts] = useState<GmailConnectedAccount[]>([])
  const [clientConfigured, setClientConfigured] = useState(true)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [templates, setTemplates] = useState<GmailRuleTemplate[]>([])
  const [fullMembers, setFullMembers] = useState<Member[]>([])

  const [query, setQuery] = useState('newer_than:30d')
  const [maxResults, setMaxResults] = useState(500)
  const [fetchLoading, setFetchLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [groups, setGroups] = useState<GmailGroup[]>([])
  const [totalFetched, setTotalFetched] = useState(0)
  const [hasFetched, setHasFetched] = useState(false)

  const [allRecipients, setAllRecipients] = useState<GmailRecipient[]>([])
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set())
  const [hiddenRecipients, setHiddenRecipients] = useState<Set<string>>(new Set())
  const [selectedSenders, setSelectedSenders] = useState<Set<string>>(new Set())

  const [proposals, setProposals] = useState<GmailInstrumentProposal[]>([])
  const [modalProposal, setModalProposal] = useState<GmailInstrumentProposal | null>(null)
  const [createdInstruments, setCreatedInstruments] = useState<Record<string, number>>({}) // scheme_name -> id

  const [mappings, setMappings] = useState<Record<string, GroupMapping>>({})
  const [skippedMessages, setSkippedMessages] = useState<Set<string>>(new Set())
  const [txGroupBy, setTxGroupBy] = useState<'sender' | 'date' | 'type'>('sender')

  const [saveRules, setSaveRules] = useState(true)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResults, setImportResults] = useState<GmailGroupImportResult[] | null>(null)

  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<{ created_transactions: number; created_valuations: number; skipped_duplicates: number; errors: any[] } | null>(null)
  const [syncError, setSyncError] = useState('')
  const [disconnectId, setDisconnectId] = useState<number | null>(null)

  // Settings state (moved from SettingsPage)
  const [cfgEnabled, setCfgEnabled] = useState(true)
  const [cfgQuery, setCfgQuery] = useState('')
  const [cfgRules, setCfgRules] = useState<GmailAccountRule[]>([])
  const [cfgExcludedSenders, setCfgExcludedSenders] = useState<string[]>([])
  const [cfgSenderInput, setCfgSenderInput] = useState('')
  const [cfgSaving, setCfgSaving] = useState(false)
  const [cfgError, setCfgError] = useState('')

  useEffect(() => {
    Promise.all([gmailApi.status(), gmailApi.getTemplates(), householdId ? householdApi.listMembers(householdId) : Promise.resolve([])])
      .then(([status, tmpls, members]) => {
        setConnectedAccounts(status.connected_accounts || [])
        setClientConfigured(status.client_configured ?? true)
        setLastSyncedAt(status.config.last_synced_at)
        setTemplates(tmpls)
        setFullMembers(members)
        // Initialise settings fields
        setCfgEnabled(status.config.enabled)
        setCfgQuery(status.config.query_override || '')
        setCfgRules(status.config.account_rules || [])
        setCfgExcludedSenders(status.config.excluded_senders || [])
        const excluded = status.config.excluded_recipients || []
        setHiddenRecipients(new Set(excluded))
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false))
  }, [householdId])

  function defaultMapping(g: GmailGroup): GroupMapping {
    const tmpl = templates.find((t) => t.key === g.detected_template)
    // Use auto_account_id from first matching email if no existing rule
    const autoId = g.emails.find((e) => e.auto_account_id)?.auto_account_id ?? 0
    return {
      skip: false,
      sender: g.suggested_rule.sender,
      template_key: g.detected_template ?? '',
      account_id: g.suggested_rule.account_id ?? autoId,
      instrument_id: 0,
      keyword: g.suggested_rule.keyword ?? '',
      recipient: g.suggested_rule.recipient ?? g.recipient ?? '',
      card_suffix: g.suggested_rule.card_suffix ?? '',
      target: tmpl?.target ?? 'account',
    }
  }

  async function handleFetch() {
    setFetchLoading(true)
    setFetchError('')
    setGroups([])
    setProposals([])
    setCreatedInstruments({})
    setModalProposal(null)
    setImportResults(null)
    setSkippedMessages(new Set())
    try {
      const res = await gmailApi.fetchPreview({ query, max_results: maxResults })
      setGroups(res.groups)
      setTotalFetched(res.total_fetched)
      setHasFetched(true)
      setProposals(res.instrument_proposals ?? [])

      const incoming = res.recipients ?? []
      // Merge with any manually-added recipients (preserve existing, add new ones from fetch)
      setAllRecipients((prev) => {
        const existing = new Map(prev.map((r) => [r.email, r]))
        for (const r of incoming) existing.set(r.email, r)
        return [...existing.values()]
      })
      setSelectedRecipients((prev) => {
        const next = new Set(prev)
        for (const r of incoming) {
          if (!hiddenRecipients.has(r.email)) next.add(r.email)
        }
        return next
      })

      const m: Record<string, GroupMapping> = {}
      for (const g of res.groups) m[g.group_key] = defaultMapping(g)
      setMappings(m)
      // Init sender filter â€” select all by default
      const allSenders = new Set(res.groups.map((g: GmailGroup) => g.sender_domain))
      setSelectedSenders(allSenders)
    } catch (e: any) {
      setFetchError(e?.error ?? e?.detail?.[0] ?? 'Fetch failed.')
    } finally {
      setFetchLoading(false)
    }
  }

  function handleToggleRecipient(email: string) {
    // Temporary show/hide â€” does NOT permanently exclude or save to config
    setSelectedRecipients((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email); else next.add(email)
      return next
    })
  }

  function handleRemoveRecipient(email: string) {
    // Permanently exclude â€” removes groups from view and saves to config
    setSelectedRecipients((prev) => { const n = new Set(prev); n.delete(email); return n })
    setHiddenRecipients((prev) => {
      const n = new Set([...prev, email])
      gmailApi.saveConfig({ excluded_recipients: [...n] }).catch(() => {})
      return n
    })
  }

  function handleRestoreRecipient(email: string) {
    setHiddenRecipients((prev) => {
      const n = new Set(prev)
      n.delete(email)
      gmailApi.saveConfig({ excluded_recipients: [...n] }).catch(() => {})
      return n
    })
    setSelectedRecipients((prev) => new Set([...prev, email]))
  }

  function handleAddManualRecipient(email: string) {
    const norm = email.trim().toLowerCase()
    if (!norm || !norm.includes('@')) return
    setAllRecipients((prev) => prev.some((r) => r.email === norm) ? prev : [...prev, { email: norm, label: norm }])
    setSelectedRecipients((prev) => new Set([...prev, norm]))
    // Remove from hidden if previously excluded
    if (hiddenRecipients.has(norm)) handleRestoreRecipient(norm)
  }

  const visibleGroups = useMemo(() => {
    let filtered = groups
    // Always exclude groups whose recipient is permanently removed
    if (hiddenRecipients.size > 0) {
      filtered = filtered.filter((g) => !g.recipient || !hiddenRecipients.has(g.recipient))
    }
    // Temporary session filter by selected recipients
    if (allRecipients.length > 0) {
      filtered = filtered.filter((g) => !g.recipient || selectedRecipients.has(g.recipient))
    }
    // Sender filter â€” always apply; empty selectedSenders = show nothing
    const allSenderDomains = new Set(groups.map((g) => g.sender_domain))
    if (selectedSenders.size < allSenderDomains.size) {
      filtered = filtered.filter((g) => selectedSenders.has(g.sender_domain))
    }
    // Sort high confidence first
    return [...filtered].sort((a, b) => b.confidence - a.confidence)
  }, [groups, selectedRecipients, allRecipients, selectedSenders, hiddenRecipients])

  function handleInstrumentCreated(schemeName: string, instrumentId: number) {
    setCreatedInstruments((prev) => ({ ...prev, [schemeName]: instrumentId }))
    setModalProposal(null)
    // Refresh instrument options is not trivial here â€” just close modal; user can map immediately
  }

  async function handleImport() {
    setImportLoading(true)
    setImportError('')
    setImportResults(null)

    const importGroups: GmailImportGroup[] = []
    for (const g of visibleGroups) {
      const m = mappings[g.group_key]
      if (!m || m.skip) continue
      const accountId = m.target === 'account' ? m.account_id : 0
      if (!accountId) continue
      const newIds = g.emails.filter((e) => !e.already_imported && !skippedMessages.has(e.message_id)).map((e) => e.message_id)
      if (!newIds.length) continue
      importGroups.push({
        sender_domain: g.sender_domain,
        rule: {
          sender: m.sender,
          account_id: accountId,
          keyword: m.keyword || null,
          template: m.template_key || null,
          recipient: m.recipient || null,
          card_suffix: m.card_suffix || null,
        },
        message_ids: newIds,
      })
    }

    if (!importGroups.length) {
      setImportError('No groups ready to import. Map at least one group to an account.')
      setImportLoading(false)
      return
    }

    try {
      const res = await gmailApi.importGroups({ groups: importGroups, save_rules: saveRules })
      setImportResults(res.group_results)
    } catch (e: any) {
      setImportError(e?.error ?? e?.detail?.[0] ?? 'Import failed.')
    } finally {
      setImportLoading(false)
    }
  }

  async function handleQuickSync() {
    setSyncLoading(true)
    setSyncError('')
    setSyncResult(null)
    try {
      const res = await gmailApi.sync()
      setSyncResult(res)
      setLastSyncedAt(res.last_synced_at)
    } catch (e: any) {
      setSyncError(e?.error ?? e?.detail?.[0] ?? 'Sync failed.')
    } finally {
      setSyncLoading(false)
    }
  }

  const readyGroups = useMemo(() =>
    visibleGroups.filter((g) => {
      const m = mappings[g.group_key]
      if (!m || m.skip) return false
      if (m.target === 'account' && !m.account_id) return false
      if (m.target === 'instrument' && !m.instrument_id) return false
      return g.emails.some((e) => !e.already_imported && !skippedMessages.has(e.message_id))
    }),
    [visibleGroups, mappings, skippedMessages]
  )

  const readyEmailCount = useMemo(() =>
    readyGroups.reduce((s, g) => s + g.emails.filter((e) => !e.already_imported && !skippedMessages.has(e.message_id)).length, 0),
    [readyGroups, skippedMessages]
  )

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <CoinSpinner size={56} />
      </div>
    )
  }

  return (
    <div className="grid gap-5">

      {/* â”€â”€ Panel 1: Connected accounts â”€â”€ */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text)]">Gmail Accounts</h2>
          <a
            href="/api/gmail/connect/start"
            className={`rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] ${!canWrite || !clientConfigured ? 'pointer-events-none opacity-40' : ''}`}
          >
            + Add account
          </a>
        </div>

        {!clientConfigured && (
          <details className="mt-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/15">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-red-800">
              OAuth not configured â€” expand for setup steps
            </summary>
            <div className="border-t border-red-100 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a> and create a project.</li>
                <li>Enable the <strong>Gmail API</strong>: APIs &amp; Services â†’ Library â†’ Gmail API â†’ Enable.</li>
                <li>Create OAuth credentials: Credentials â†’ Create â†’ OAuth client ID â†’ Web application.</li>
                <li>Add redirect URI: <code className="rounded bg-red-100 px-1 text-xs">{window.location.origin}/api/gmail/connect/callback</code></li>
                <li>Set environment variables:<pre className="mt-1 rounded bg-red-100 px-3 py-2 text-xs">{`SOCIAL_AUTH_GOOGLE_OAUTH2_KEY=<client id>\nSOCIAL_AUTH_GOOGLE_OAUTH2_SECRET=<client secret>`}</pre></li>
              </ol>
            </div>
          </details>
        )}

        {connectedAccounts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
            <p className="text-sm text-[var(--text-muted)]">No Google accounts connected.</p>
            <a href="/api/gmail/connect/start" className={`mt-3 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 ${!canWrite || !clientConfigured ? 'pointer-events-none opacity-40' : ''}`}>
              Connect Gmail
            </a>
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            {connectedAccounts.map((acct) => (
              <div key={acct.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
                <p className="text-sm font-medium text-[var(--text)]">{acct.email || acct.label}</p>
                <button
                  type="button"
                  disabled={disconnectId === acct.id || !canWrite}
                  className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 dark:bg-red-900/15 disabled:opacity-50"
                  onClick={async () => {
                    setDisconnectId(acct.id)
                    try { const res = await gmailApi.disconnect(acct.id); setConnectedAccounts(res.connected_accounts) }
                    finally { setDisconnectId(null) }
                  }}
                >
                  {disconnectId === acct.id ? 'Disconnectingâ€¦' : 'Disconnect'}
                </button>
              </div>
            ))}
          </div>
        )}

        {connectedAccounts.length > 0 && (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium text-[var(--text-2)]">Quick sync using saved rules</p>
              <button type="button" disabled={syncLoading || !canWrite} onClick={handleQuickSync}
                className="rounded-lg bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                {syncLoading ? 'Syncingâ€¦' : 'Sync Now'}
              </button>
              {lastSyncedAt && <span className="text-xs text-[var(--text-muted)]">Last sync: {new Date(lastSyncedAt).toLocaleString()}</span>}
            </div>
            {syncError && <p className="mt-2 text-xs text-red-600">{syncError}</p>}
            {syncResult && (
              <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-2)]">
                Transactions: <strong>{syncResult.created_transactions}</strong> Â· Balances: <strong>{syncResult.created_valuations}</strong> Â· Skipped: {syncResult.skipped_duplicates}
                {syncResult.errors?.length ? (
                  <ul className="mt-1 list-disc pl-4 text-red-600">{syncResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e.error}</li>)}</ul>
                ) : null}
              </div>
            )}
          </div>
        )}
      </section>

      {/* â”€â”€ Panel 2: Recipient filter (always shown when connected) â”€â”€ */}
      {connectedAccounts.length > 0 && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[var(--text)]">Recipient Addresses</h2>
            {allRecipients.length > 0 && (
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setSelectedRecipients(new Set(allRecipients.filter((r) => !hiddenRecipients.has(r.email)).map((r) => r.email)))}
                  className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]">
                  Select all
                </button>
                <button type="button"
                  onClick={() => setSelectedRecipients(new Set())}
                  className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]">
                  Clear
                </button>
              </div>
            )}
          </div>
          <RecipientFilter
            recipients={allRecipients}
            selected={selectedRecipients}
            hidden={hiddenRecipients}
            onToggle={handleToggleRecipient}
            onRemove={handleRemoveRecipient}
            onRestore={handleRestoreRecipient}
            onAddManual={handleAddManualRecipient}
          />
          {hasFetched && visibleGroups.length !== groups.length && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Showing {visibleGroups.length} of {groups.length} groups based on selected recipients.</p>
          )}
        </section>
      )}

      {/* â”€â”€ Panel 3 (was 2): Fetch & Analyse â”€â”€ */}
      {connectedAccounts.length > 0 && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Fetch & Analyse Emails</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[var(--text-2)]">
              Gmail query
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm" placeholder="e.g. newer_than:30d" />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Examples: <code>newer_than:90d</code> Â· <code>from:alerts@hdfcbank.bank.in</code>
              </p>
            </label>
            <label className="text-xs font-medium text-[var(--text-2)]">
              Max emails: <strong>{maxResults}</strong>
              <input type="range" min={50} max={2000} step={50} value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))} className="mt-2 w-full accent-indigo-600" />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)]"><span>50</span><span>2000</span></div>
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" disabled={fetchLoading || !canWrite} onClick={handleFetch}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {fetchLoading ? 'Fetchingâ€¦' : 'Fetch & Analyse'}
            </button>
            {hasFetched && !fetchLoading && (
              <span className="text-xs text-[var(--text-muted)]">{totalFetched} emails Â· {groups.length} groups Â· {proposals.length} instruments proposed</span>
            )}
          </div>
          {fetchError && <p className="mt-2 text-sm text-red-600">{fetchError}</p>}
        </section>
      )}

      {/* â”€â”€ Panel 3: Instrument proposals â”€â”€ */}
      {hasFetched && proposals.length > 0 && (
        <ProposalList
          proposals={proposals}
          accountOptions={accountOptions}
          memberOptions={memberOptions}
          recipientEmails={allRecipients.map((r) => r.email)}
          createdInstruments={createdInstruments}
          onOpenModal={setModalProposal}
        />
      )}

      {/* Add Instrument modal */}
      {modalProposal && (
        <AddInstrumentModal
          proposal={modalProposal}
          accountOptions={accountOptions}
          memberOptions={memberOptions}
          fullMembers={fullMembers}
          onClose={() => setModalProposal(null)}
          onCreated={(id) => handleInstrumentCreated(modalProposal.scheme_name, id)}
        />
      )}

      {/* â”€â”€ Panel 5: Email Groups â”€â”€ */}
      {hasFetched && visibleGroups.length > 0 && (
        <section>
          {/* Sender + recipient filter chips */}
          <div className="mb-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 grid gap-3">
            {/* Sender chips */}
            {(() => {
              const allSenderDomains = [...new Set(groups.map((g) => g.sender_domain))].sort()
              if (allSenderDomains.length <= 1) return null
              return (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-[var(--text-2)]">Filter by sender</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelectedSenders(new Set(allSenderDomains))} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-2)]">All</button>
                      <button type="button" onClick={() => setSelectedSenders(new Set())} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-2)]">None</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allSenderDomains.map((domain) => {
                      const active = selectedSenders.has(domain)
                      const count = groups.filter((g) => g.sender_domain === domain).length
                      return (
                        <button
                          key={domain}
                          type="button"
                          onClick={() => setSelectedSenders((prev) => {
                            const next = new Set(prev)
                            if (next.has(domain)) next.delete(domain); else next.add(domain)
                            return next
                          })}
                          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${active ? 'border-[var(--border-2)] bg-slate-800 text-white' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]'}`}
                        >
                          {domain}
                          <span className={`text-[10px] ${active ? 'text-[var(--text-faint)]' : 'text-[var(--text-faint)]'}`}>{count}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Header row with group-by control */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-[var(--text)]">{visibleGroups.length} group{visibleGroups.length !== 1 ? 's' : ''}</h2>
                <span className="text-xs text-[var(--text-muted)]">{visibleGroups.reduce((s, g) => s + g.email_count, 0)} transactions</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">Group by:</span>
                {(['sender', 'type', 'date'] as const).map((v) => (
                  <button key={v} type="button"
                    onClick={() => setTxGroupBy(v)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${txGroupBy === v ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}>
                    {v === 'sender' ? 'Sender' : v === 'type' ? 'Type' : 'Date'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Groups rendered with optional section headers */}
          {(() => {
            if (txGroupBy === 'sender') {
              // Group by sender domain
              const byDomain = new Map<string, typeof visibleGroups>()
              for (const g of visibleGroups) {
                const key = g.sender_display || g.sender_domain
                if (!byDomain.has(key)) byDomain.set(key, [])
                byDomain.get(key)!.push(g)
              }
              return [...byDomain.entries()].map(([domain, domainGroups]) => (
                <div key={domain}>
                  {byDomain.size > 1 && (
                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{domain}</p>
                  )}
                  <div className="grid gap-3">
                    {domainGroups.map((g) => (
                      <GroupCard key={g.group_key} group={g} templates={templates} accountOptions={accountOptions}
                        instrumentOptions={instrumentOptions} householdId={householdId} skippedMessages={skippedMessages}
                        onToggleSkip={(id) => setSkippedMessages(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })}
                        mapping={mappings[g.group_key] ?? defaultMapping(g)}
                        onChange={(m) => setMappings((prev) => ({ ...prev, [g.group_key]: m }))} />
                    ))}
                  </div>
                </div>
              ))
            }

            if (txGroupBy === 'type') {
              const byType = new Map<string, typeof visibleGroups>()
              for (const g of visibleGroups) {
                const label = TX_TYPE_LABELS[g.detected_template ?? ''] ?? 'Other'
                if (!byType.has(label)) byType.set(label, [])
                byType.get(label)!.push(g)
              }
              return [...byType.entries()].map(([type, typeGroups]) => (
                <div key={type}>
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{type}</p>
                  <div className="grid gap-3">
                    {typeGroups.map((g) => (
                      <GroupCard key={g.group_key} group={g} templates={templates} accountOptions={accountOptions}
                        instrumentOptions={instrumentOptions} householdId={householdId} skippedMessages={skippedMessages}
                        onToggleSkip={(id) => setSkippedMessages(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })}
                        mapping={mappings[g.group_key] ?? defaultMapping(g)}
                        onChange={(m) => setMappings((prev) => ({ ...prev, [g.group_key]: m }))} />
                    ))}
                  </div>
                </div>
              ))
            }

            // Group by date (month)
            const byMonth = new Map<string, typeof visibleGroups>()
            for (const g of visibleGroups) {
              const latestDate = g.emails[0]?.date ?? ''
              const month = latestDate ? latestDate.slice(0, 7) : 'Unknown'
              if (!byMonth.has(month)) byMonth.set(month, [])
              byMonth.get(month)!.push(g)
            }
            return [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, monthGroups]) => (
              <div key={month}>
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {month === 'Unknown' ? 'Unknown date' : new Date(month + '-01').toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })}
                </p>
                <div className="grid gap-3">
                  {monthGroups.map((g) => (
                    <GroupCard key={g.group_key} group={g} templates={templates} accountOptions={accountOptions}
                      instrumentOptions={instrumentOptions} householdId={householdId} skippedMessages={skippedMessages}
                      onToggleSkip={(id) => setSkippedMessages(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })}
                      mapping={mappings[g.group_key] ?? defaultMapping(g)}
                      onChange={(m) => setMappings((prev) => ({ ...prev, [g.group_key]: m }))} />
                  ))}
                </div>
              </div>
            ))
          })()}
        </section>
      )}

      {hasFetched && visibleGroups.length === 0 && !fetchLoading && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-8 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">
            {groups.length > 0 ? 'No groups match the selected recipients.' : 'No emails found for this query.'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {groups.length > 0 ? 'Select at least one recipient above.' : 'Try a wider date range like newer_than:90d.'}
          </p>
        </div>
      )}

      {/* â”€â”€ Panel 6: Import â”€â”€ */}
      {hasFetched && visibleGroups.length > 0 && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <h2 className="mb-1 text-base font-semibold text-[var(--text)]">Import</h2>
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            {readyGroups.length > 0
              ? `Ready to import ${readyEmailCount} new emails across ${readyGroups.length} groups.`
              : 'Map at least one group to an account to enable import.'}
          </p>
          <label className="mb-3 flex items-center gap-2 text-sm text-[var(--text-2)] cursor-pointer">
            <input type="checkbox" checked={saveRules} onChange={(e) => setSaveRules(e.target.checked)} />
            Save rules for future quick syncs
          </label>
          {importError && <p className="mb-3 text-sm text-red-600">{importError}</p>}
          <button type="button" disabled={importLoading || !canWrite || readyGroups.length === 0} onClick={handleImport}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {importLoading ? 'Importingâ€¦' : `Import ${readyEmailCount} emails`}
          </button>

          {importResults && (
            <div className="mt-4 grid gap-3">
              {importResults.map((r, i) => (
                <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[var(--text)]">{r.sender_domain}</p>
                    {r.skipped ? (
                      <span className="text-xs text-[var(--text-muted)]">Skipped â€” {r.reason}</span>
                    ) : r.error ? (
                      <span className="text-xs text-red-600">{r.error}</span>
                    ) : (
                      <span className="text-xs text-emerald-700 dark:text-emerald-300">{r.created_transactions ?? 0} tx Â· {r.created_valuations ?? 0} bal</span>
                    )}
                  </div>
                  {r.errors && r.errors.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-red-600">
                      {r.errors.map((e, j) => <li key={j}>{e.error}</li>)}
                    </ul>
                  )}
                  {r.email_log && r.email_log.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-[var(--text-muted)]">Email log ({r.email_log.length})</summary>
                      <table className="mt-1 w-full text-xs">
                        <tbody>
                          {r.email_log.map((e, j) => (
                            <tr key={j} className="border-t border-[var(--border)]">
                              <td className="py-1 pr-3 text-[var(--text-muted)] whitespace-nowrap">{e.date ?? ''}</td>
                              <td className="py-1 pr-3 max-w-xs truncate text-[var(--text-2)]" title={e.subject}>{e.subject ?? e.message_id}</td>
                              <td className="py-1 pr-3 text-right font-medium text-[var(--text)]">{e.amount ? `â‚¹${Number(e.amount).toLocaleString('en-IN')}` : 'â€”'}</td>
                              <td className="py-1">
                                <span className={`rounded-full px-2 py-0.5 ${e.status === 'queued' || e.status === 'created' ? 'bg-emerald-50 dark:bg-emerald-900/15 text-emerald-700 dark:text-emerald-300' : e.status === 'already_imported' ? 'bg-[var(--surface-2)] text-[var(--text-muted)]' : 'bg-red-50 dark:bg-red-900/15 text-red-600'}`}>
                                  {e.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* â”€â”€ Panel 7: Sync Settings (collapsible) â”€â”€ */}
      <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-[var(--text-2)] list-none flex items-center justify-between">
          <span>Sync Settings</span>
          <span className="text-[var(--text-muted)] text-xs font-normal">Query override Â· Sender exclusions Â· Recipient exclusions Â· Reset history</span>
        </summary>

        <div className="border-t border-[var(--border)] px-5 py-4 grid gap-5">
          {cfgError && <p className="text-sm text-red-600">{cfgError}</p>}

          <label className="flex items-center gap-2 text-sm text-[var(--text-2)] cursor-pointer select-none">
            <input type="checkbox" checked={cfgEnabled} disabled={!canWrite} onChange={(e) => setCfgEnabled(e.target.checked)} />
            <span className="font-medium">Enabled</span>
            <span className="text-xs text-[var(--text-muted)]">(uncheck to pause automatic sync)</span>
          </label>

          <label className="text-sm text-[var(--text-2)]">
            <span className="font-medium">Gmail Query Override</span>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Leave blank to auto-use last sync time. Use Gmail search syntax, e.g. <code className="rounded bg-[var(--surface-2)] px-1">newer_than:14d</code>.</p>
            <input
              value={cfgQuery}
              disabled={!canWrite}
              onChange={(e) => setCfgQuery(e.target.value)}
              placeholder="e.g. newer_than:14d"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
            />
          </label>

          {/* Rules summary â€” full management is on the dedicated Rules page */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-2)]">Sender â†’ Account rules</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {cfgRules.length === 0 ? 'No rules configured.' : `${cfgRules.length} rule${cfgRules.length === 1 ? '' : 's'} â€” grouped by transaction type and member.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.hash = '/gmail-rules'}
              className="shrink-0 rounded-lg border border-primary-200 bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50"
            >
              Manage rules â†’
            </button>
          </div>

          {/* Sender exclusions â€” manually added senders to ignore entirely */}
          <div>
            <p className="text-sm font-medium text-[var(--text-2)] mb-1">Sender exclusions</p>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Emails from these senders are completely ignored during fetch &amp; sync â€” they won't appear in groups or be processed.
              Use a full address like <code className="rounded bg-[var(--surface-2)] px-1">alerts@cbssbi.com</code> or a domain like <code className="rounded bg-[var(--surface-2)] px-1">@promotions.hdfc.com</code>.
            </p>
            <div className="flex gap-2 mb-2">
              <input
                value={cfgSenderInput}
                disabled={!canWrite}
                onChange={(e) => setCfgSenderInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const v = cfgSenderInput.trim().toLowerCase()
                    if (v && !cfgExcludedSenders.includes(v)) setCfgExcludedSenders(prev => [...prev, v])
                    setCfgSenderInput('')
                  }
                }}
                placeholder="e.g. alerts@cbssbi.com or @promotions.bank.in"
                className="flex-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
              />
              <button
                type="button"
                disabled={!canWrite || !cfgSenderInput.trim()}
                onClick={() => {
                  const v = cfgSenderInput.trim().toLowerCase()
                  if (v && !cfgExcludedSenders.includes(v)) setCfgExcludedSenders(prev => [...prev, v])
                  setCfgSenderInput('')
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {cfgExcludedSenders.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No sender exclusions. All senders are processed.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {cfgExcludedSenders.map((sender) => (
                  <div key={sender} className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 dark:bg-red-900/15 px-3 py-1 text-xs text-red-700 dark:text-red-300">
                    {sender}
                    <button
                      type="button"
                      disabled={!canWrite}
                      onClick={() => setCfgExcludedSenders(prev => prev.filter(s => s !== sender))}
                      className="ml-1 text-red-400 hover:text-red-700 dark:text-red-300 disabled:opacity-50"
                    >
                      Ã—
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--text-2)] mb-1">Recipient exclusions</p>
            <p className="text-xs text-[var(--text-muted)] mb-2">Emails sent to these addresses are hidden by default in the preview. Toggle recipients in the filter panel above to update this list.</p>
            {hiddenRecipients.size === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">None â€” all recipient addresses shown.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {[...hiddenRecipients].map((email) => (
                  <div key={email} className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--text-2)]">
                    {email}
                    <button
                      type="button"
                      onClick={() => handleRestoreRecipient(email)}
                      className="ml-1 text-[var(--text-muted)] hover:text-red-500"
                      aria-label="Remove exclusion"
                    >
                      Ã—
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={!canWrite || cfgSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              onClick={async () => {
                setCfgSaving(true)
                setCfgError('')
                try {
                  await gmailApi.saveConfig({
                    enabled: cfgEnabled,
                    query_override: cfgQuery,
                    excluded_senders: cfgExcludedSenders,
                  })
                } catch (e: any) {
                  setCfgError(e?.detail?.[0] ?? e?.error ?? 'Failed to save config.')
                } finally {
                  setCfgSaving(false)
                }
              }}
            >
              {cfgSaving ? 'Savingâ€¦' : 'Save Settings'}
            </button>
          </div>

          {/* Import history reset */}
          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-sm font-medium text-[var(--text-2)] mb-1">Re-sync deleted transactions</p>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              If you deleted ledger entries and want to re-import them from Gmail, clear the import history below.
              The next sync (or Fetch &amp; Preview) will treat all previously-imported emails as new again.
            </p>
            <ResetImportHistoryButton canWrite={canWrite} onReset={() => {
              setLastSyncedAt(null)
              setSyncResult(null)
            }} />
          </div>
        </div>
      </details>

    </div>
  )
}
