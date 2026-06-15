import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { gmailApi, type GmailAccountRule, type GmailRuleTemplate } from '../api/gmailApi'
import { portfolioApi } from '../api/portfolioApi'
import type { Account, OptionItem } from '../types/domain'
import { useAuth } from '../context/AuthContext'

type Props = {
  householdId: number | null
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
}

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------

const TEMPLATE_CATEGORIES: Record<string, string> = {
  cc_spend_alert:       'Credit Cards',
  cc_bill_statement:    'Credit Cards',
  cc_transaction_alert: 'Credit Cards',
  cc_bill_payment:      'Credit Cards',
  bank_debit_cc:        'Credit Cards',
  bank_debit_account:   'Bank / Debit',
  bank_balance:         'Bank / Debit',
  bank_inflow:          'Bank / Debit',
  atm_withdrawal:       'Bank / Debit',
  upi_debit:            'UPI / Transfers',
  neft_imps:            'UPI / Transfers',
  fastag_recharge:      'FASTag / Wallet',
  fastag_toll:          'FASTag / Wallet',
  cc_action_required:   'Credit Cards',
  tds_deduction:        'Bank / Debit',
  mf_sip:               'Mutual Funds',
  jupiter_sip:          'Mutual Funds',
  stock_trade:          'Stocks / Broker',
  insurance_premium:    'Insurance',
  emi_payment:          'Loans / EMI',
}

const CATEGORY_ORDER = [
  'Credit Cards',
  'Bank / Debit',
  'UPI / Transfers',
  'Mutual Funds',
  'Stocks / Broker',
  'Insurance',
  'Loans / EMI',
  'FASTag / Wallet',
  'Other',
]

const CC_TEMPLATES = new Set(['cc_spend_alert', 'cc_bill_statement', 'cc_transaction_alert', 'bank_debit_cc'])

// ---------------------------------------------------------------------------
// Empty rule factory
// ---------------------------------------------------------------------------

function emptyRule(): GmailAccountRule {
  return { sender: '', account_id: 0, keyword: '', template: '', recipient: '', card_suffix: '' }
}

// ---------------------------------------------------------------------------
// RuleForm — inline add / edit form
// ---------------------------------------------------------------------------

function RuleForm({
  rule,
  templates,
  accountOptions,
  onSave,
  onCancel,
}: {
  rule: GmailAccountRule
  templates: GmailRuleTemplate[]
  accountOptions: OptionItem[]
  onSave: (r: GmailAccountRule) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<GmailAccountRule>({ ...rule })
  const selectedTmpl = templates.find((t) => t.key === draft.template)
  const showCardSuffix = draft.template ? CC_TEMPLATES.has(draft.template) : true

  function set<K extends keyof GmailAccountRule>(k: K, v: GmailAccountRule[K]) {
    setDraft((p) => ({ ...p, [k]: v }))
  }

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-4 grid gap-3">
      {/* Row 1: sender + template */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-[var(--text-2)]">
          Sender
          <input
            value={draft.sender}
            onChange={(e) => set('sender', e.target.value)}
            placeholder="e.g. @federalbank.co.in or full address"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Use @domain to match any address at that domain</p>
        </label>
        <label className="text-xs font-medium text-[var(--text-2)]">
          Template
          <select
            value={draft.template ?? ''}
            onChange={(e) => set('template', e.target.value || undefined)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            <option value="">— No template —</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          {selectedTmpl && (
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{selectedTmpl.description}</p>
          )}
        </label>
      </div>

      {/* Row 2: account + keyword */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-[var(--text-2)]">
          Account
          <select
            value={String(draft.account_id || '')}
            onChange={(e) => set('account_id', Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            <option value="">Select account</option>
            {accountOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-[var(--text-2)]">
          Keyword (optional)
          <input
            value={draft.keyword ?? ''}
            onChange={(e) => set('keyword', e.target.value)}
            placeholder="e.g. HDFC or specific text in email body"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Only match if this word appears in subject/body</p>
        </label>
      </div>

      {/* Row 3: recipient + card_suffix */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-[var(--text-2)]">
          Recipient email (optional)
          <input
            value={draft.recipient ?? ''}
            onChange={(e) => set('recipient', e.target.value)}
            placeholder="e.g. you@gmail.com"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Only match emails sent to this address (To: header)</p>
        </label>
        {showCardSuffix && (
          <label className="text-xs font-medium text-[var(--text-2)]">
            Card last 4 digits (optional)
            <input
              value={draft.card_suffix ?? ''}
              onChange={(e) => set('card_suffix', e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 3003"
              maxLength={4}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Routes to the right card when multiple cards share the same sender</p>
          </label>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={!draft.sender.trim() || !draft.account_id}
          onClick={() => onSave(draft)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
        >
          Save rule
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RuleRow — single rule display row
// ---------------------------------------------------------------------------

function RuleRow({
  rule,
  idx,
  templates,
  accountOptions,
  memberName,
  onEdit,
  onDelete,
}: {
  rule: GmailAccountRule
  idx: number
  templates: GmailRuleTemplate[]
  accountOptions: OptionItem[]
  memberName: string
  onEdit: (idx: number) => void
  onDelete: (idx: number) => void
}) {
  const tmpl = templates.find((t) => t.key === rule.template)
  const acctLabel = accountOptions.find((a) => a.id === rule.account_id)?.label ?? `Account #${rule.account_id}`

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
      <div className="min-w-0 flex-1 grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[var(--text)] truncate">{rule.sender}</span>
          {tmpl && (
            <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-2)]">{tmpl.label}</span>
          )}
          <span className="text-[var(--text-muted)]">→</span>
          <span className="text-[var(--text-2)] truncate">{acctLabel}</span>
          {memberName && (
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] text-primary-700">{memberName}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-[var(--text-muted)]">
          {rule.card_suffix && <span>Card: ···{rule.card_suffix}</span>}
          {rule.recipient && <span>To: {rule.recipient}</span>}
          {rule.keyword && <span>Keyword: {rule.keyword}</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => onEdit(idx)}
          className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(idx)}
          className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function GmailRulesPage({ householdId, accountOptions, memberOptions }: Props) {
  const { user } = useAuth()
  const canWrite = user.authenticated && (user.role === 'admin' || user.role === 'super_admin')

  const [rules, setRules] = useState<GmailAccountRule[]>([])
  const [templates, setTemplates] = useState<GmailRuleTemplate[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  // Editing state: index into `rules` being edited, or -1 for "add new"
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!householdId) return
    Promise.all([
      gmailApi.status(),
      gmailApi.getTemplates(),
      portfolioApi.listAccounts(householdId),
    ]).then(([status, tmpls, accts]) => {
      setRules(status.config.account_rules ?? [])
      setTemplates(tmpls)
      setAccounts(accts)
    }).catch(() => setError('Failed to load rules.'))
      .finally(() => setLoading(false))
  }, [householdId])

  // ---------------------------------------------------------------------------
  // Helpers for member lookup via account
  // ---------------------------------------------------------------------------

  function memberForRule(rule: GmailAccountRule): string {
    if (!rule.account_id) return ''
    const acct = accounts.find((a) => a.id === rule.account_id)
    if (!acct?.primary_member) return ''
    const m = memberOptions.find((mo) => mo.id === acct.primary_member)
    return m?.label ?? ''
  }

  // ---------------------------------------------------------------------------
  // Categorise + group rules
  // ---------------------------------------------------------------------------

  type RuleEntry = { rule: GmailAccountRule; globalIdx: number; memberName: string }
  type CategoryGroup = { category: string; memberGroups: { memberName: string; rules: RuleEntry[] }[] }

  function buildCategoryGroups(): CategoryGroup[] {
    const byCategory: Record<string, Record<string, RuleEntry[]>> = {}

    rules.forEach((rule, globalIdx) => {
      const category = (rule.template && TEMPLATE_CATEGORIES[rule.template]) ?? 'Other'
      const memberName = memberForRule(rule)
      if (!byCategory[category]) byCategory[category] = {}
      if (!byCategory[category][memberName]) byCategory[category][memberName] = []
      byCategory[category][memberName].push({ rule, globalIdx, memberName })
    })

    return CATEGORY_ORDER
      .filter((cat) => byCategory[cat])
      .map((cat) => ({
        category: cat,
        memberGroups: Object.entries(byCategory[cat]).map(([memberName, ruleEntries]) => ({
          memberName,
          rules: ruleEntries,
        })),
      }))
  }

  const categoryGroups = buildCategoryGroups()
  const uncategorisedCount = rules.filter((r) => !r.template || !TEMPLATE_CATEGORIES[r.template]).length

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  function handleAdd(newRule: GmailAccountRule) {
    setRules((prev) => [...prev, newRule])
    setEditingIdx(null)
  }

  function handleUpdate(idx: number, updatedRule: GmailAccountRule) {
    setRules((prev) => prev.map((r, i) => (i === idx ? updatedRule : r)))
    setEditingIdx(null)
  }

  function handleDelete(idx: number) {
    setRules((prev) => prev.filter((_, i) => i !== idx))
    if (editingIdx === idx) setEditingIdx(null)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSavedMsg('')
    try {
      await gmailApi.saveConfig({ account_rules: rules.filter((r) => r.sender.trim() && r.account_id) })
      setSavedMsg('Rules saved.')
      setTimeout(() => setSavedMsg(''), 3000)
    } catch {
      setError('Failed to save rules.')
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!householdId) {
    return <p className="text-sm text-[var(--text-muted)]">Select a household to manage sync rules.</p>
  }

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading…</p>
  }

  return (
    <div className="grid gap-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Gmail Sync Rules</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Rules tell the sync which account to assign each email to. Grouped by transaction type and member.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {savedMsg && <span className="text-sm text-green-600">{savedMsg}</span>}
          {canWrite && (
            <>
              <button
                type="button"
                onClick={() => setEditingIdx(-1)}
                disabled={editingIdx !== null}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-40"
              >
                + Add rule
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save all rules'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Add-new form (editingIdx === -1) */}
      {editingIdx === -1 && (
        <RuleForm
          rule={emptyRule()}
          templates={templates}
          accountOptions={accountOptions}
          onSave={handleAdd}
          onCancel={() => setEditingIdx(null)}
        />
      )}

      {/* Empty state */}
      {rules.length === 0 && editingIdx === null && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">No rules yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Rules are auto-saved when you import emails from Gmail Sync. You can also add them manually above.
          </p>
        </div>
      )}

      {/* Category sections */}
      {categoryGroups.map(({ category, memberGroups }) => (
        <section key={category}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{category}</h3>
          <div className="grid gap-4">
            {memberGroups.map(({ memberName, rules: entries }) => (
              <div key={memberName || '__no_member'}>
                {memberName && (
                  <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)] pl-1">Member: {memberName}</p>
                )}
                <div className="grid gap-2">
                  {entries.map(({ rule, globalIdx }) => (
                    editingIdx === globalIdx ? (
                      <RuleForm
                        key={globalIdx}
                        rule={rule}
                        templates={templates}
                        accountOptions={accountOptions}
                        onSave={(updated) => handleUpdate(globalIdx, updated)}
                        onCancel={() => setEditingIdx(null)}
                      />
                    ) : (
                      <RuleRow
                        key={globalIdx}
                        rule={rule}
                        idx={globalIdx}
                        templates={templates}
                        accountOptions={accountOptions}
                        memberName={memberForRule(rule)}
                        onEdit={setEditingIdx}
                        onDelete={handleDelete}
                      />
                    )
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Other / uncategorised rules */}
      {uncategorisedCount > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Other</h3>
          <div className="grid gap-2">
            {rules.map((rule, globalIdx) => {
              if (rule.template && TEMPLATE_CATEGORIES[rule.template]) return null
              return editingIdx === globalIdx ? (
                <RuleForm
                  key={globalIdx}
                  rule={rule}
                  templates={templates}
                  accountOptions={accountOptions}
                  onSave={(updated) => handleUpdate(globalIdx, updated)}
                  onCancel={() => setEditingIdx(null)}
                />
              ) : (
                <RuleRow
                  key={globalIdx}
                  rule={rule}
                  idx={globalIdx}
                  templates={templates}
                  accountOptions={accountOptions}
                  memberName={memberForRule(rule)}
                  onEdit={setEditingIdx}
                  onDelete={handleDelete}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* Editable templates section */}
      <TemplatesSection
        templates={templates}
        setTemplates={setTemplates}
        canWrite={canWrite}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tag input helper
// ---------------------------------------------------------------------------

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('')

  function addTag(val: string) {
    const trimmed = val.trim()
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed])
    }
    setInput('')
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 min-h-[38px]">
      {values.map((v) => (
        <span key={v} className="flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-2)]">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-[var(--text-muted)] hover:text-red-500">✕</button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input) }
          if (e.key === 'Backspace' && !input && values.length) onChange(values.slice(0, -1))
        }}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={values.length === 0 ? placeholder : ''}
        className="min-w-[120px] flex-1 border-none outline-none text-sm bg-transparent py-0.5"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template form
// ---------------------------------------------------------------------------

const DIRECTION_OPTIONS = ['outflow', 'inflow', 'none']
const TX_TYPE_OPTIONS = ['other', 'buy', 'sell', 'deposit', 'withdrawal', 'salary', 'dividend', 'emi', 'premium']

function emptyTemplate(): GmailRuleTemplate {
  return { key: '', label: '', description: '', direction: 'outflow', tx_type: 'other', target: 'account', amount_re: '', confidence_signals: [], negative_signals: [], is_builtin: false }
}

function TemplateForm({
  tmpl,
  isNew,
  onSave,
  onCancel,
}: {
  tmpl: GmailRuleTemplate
  isNew: boolean
  onSave: (t: GmailRuleTemplate) => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<GmailRuleTemplate>({ ...tmpl })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set<K extends keyof GmailRuleTemplate>(k: K, v: GmailRuleTemplate[K]) {
    setDraft((p) => ({ ...p, [k]: v }))
  }

  async function handleSave() {
    if (!draft.key.trim()) { setError('Key is required'); return }
    if (!draft.label.trim()) { setError('Label is required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(draft)
    } catch (e: any) {
      setError(e?.error ?? e?.detail?.[0] ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50/30 p-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-[var(--text-2)]">
          Key
          {isNew ? (
            <>
              <input
                value={draft.key}
                onChange={(e) => set('key', e.target.value.toLowerCase().replace(/[^a-z_]/g, ''))}
                placeholder="e.g. my_template"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-mono"
              />
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Lowercase letters and underscores only</p>
            </>
          ) : (
            <p className="mt-1 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm font-mono text-[var(--text-2)]">{draft.key}</p>
          )}
        </label>
        <label className="text-xs font-medium text-[var(--text-2)]">
          Label
          <input value={draft.label} onChange={(e) => set('label', e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
        </label>
      </div>

      <label className="text-xs font-medium text-[var(--text-2)]">
        Description
        <input value={draft.description} onChange={(e) => set('description', e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-[var(--text-2)]">
          Direction
          <select value={draft.direction ?? 'none'} onChange={(e) => set('direction', e.target.value === 'none' ? null : e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
            {DIRECTION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-[var(--text-2)]">
          Tx type
          <select value={draft.tx_type ?? 'other'} onChange={(e) => set('tx_type', e.target.value === 'none' ? null : e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
            <option value="none">none</option>
            {TX_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-[var(--text-2)]">
          Target
          <select value={draft.target} onChange={(e) => set('target', e.target.value as 'account' | 'instrument')} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
            <option value="account">account</option>
            <option value="instrument">instrument</option>
          </select>
        </label>
      </div>

      <label className="text-xs font-medium text-[var(--text-2)]">
        Amount regex
        <input value={draft.amount_re ?? ''} onChange={(e) => set('amount_re', e.target.value)} placeholder="e.g. (?:₹|INR)\s*([0-9][0-9,]*\.?[0-9]*)" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-mono" />
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">First capture group is the amount value. Leave blank to use generic fallback.</p>
      </label>

      <label className="text-xs font-medium text-[var(--text-2)]">
        Confidence signals (press Enter or comma to add)
        <div className="mt-1">
          <TagInput
            values={draft.confidence_signals ?? []}
            onChange={(v) => set('confidence_signals', v)}
            placeholder="e.g. has been used"
          />
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Keywords in subject/body that increase match confidence for this template.</p>
      </label>

      <label className="text-xs font-medium text-[var(--text-2)]">
        Negative signals (press Enter or comma to add)
        <div className="mt-1">
          <TagInput
            values={draft.negative_signals ?? []}
            onChange={(v) => set('negative_signals', v)}
            placeholder="e.g. pre-approved loan"
          />
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Keywords that disqualify this template if found.</p>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" disabled={saving} onClick={handleSave} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save template'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]">Cancel</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TemplatesSection
// ---------------------------------------------------------------------------

function TemplatesSection({
  templates,
  setTemplates,
  canWrite,
}: {
  templates: GmailRuleTemplate[]
  setTemplates: Dispatch<SetStateAction<GmailRuleTemplate[]>>
  canWrite: boolean
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function handleSave(draft: GmailRuleTemplate) {
    const saved = await gmailApi.saveTemplate(draft)
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.key === saved.key)
      return idx >= 0 ? prev.map((t) => (t.key === saved.key ? saved : t)) : [...prev, saved]
    })
    setEditingKey(null)
    setAddingNew(false)
  }

  async function handleDelete(key: string) {
    setDeleteError('')
    try {
      await gmailApi.deleteTemplate(key)
      // Re-fetch to get the restored built-in or remove truly custom
      const updated = await gmailApi.getTemplates()
      setTemplates(updated)
    } catch (e: any) {
      setDeleteError(e?.error ?? 'Delete failed.')
    }
  }

  return (
    <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]" open>
      <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-[var(--text-2)] list-none flex items-center justify-between">
        <span>Templates</span>
        <span className="text-xs text-[var(--text-muted)]">{templates.length} templates · click to collapse</span>
      </summary>

      <div className="border-t border-[var(--border)] px-5 py-4 grid gap-4">
        {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

        <p className="text-xs text-[var(--text-muted)]">
          Templates define how emails are detected and parsed. Built-in templates can be overridden; custom templates can be deleted.
          Changes apply immediately to the next Fetch &amp; Preview.
        </p>

        {canWrite && !addingNew && editingKey === null && (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="self-start rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            + Add custom template
          </button>
        )}

        {addingNew && (
          <TemplateForm
            tmpl={emptyTemplate()}
            isNew={true}
            onSave={handleSave}
            onCancel={() => setAddingNew(false)}
          />
        )}

        {CATEGORY_ORDER.map((cat) => {
          const catTemplates = templates.filter((t) => (TEMPLATE_CATEGORIES[t.key] ?? 'Other') === cat)
          if (!catTemplates.length) return null
          return (
            <div key={cat}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">{cat}</p>
              <div className="grid gap-2">
                {catTemplates.map((t) => {
                  if (editingKey === t.key) {
                    return (
                      <TemplateForm
                        key={t.key}
                        tmpl={t}
                        isNew={false}
                        onSave={handleSave}
                        onCancel={() => setEditingKey(null)}
                      />
                    )
                  }
                  return (
                    <div key={t.key} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                      <div className="min-w-0 flex-1 grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="shrink-0 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--text-2)]">{t.key}</span>
                          <span className="font-medium text-[var(--text)] text-sm">{t.label}</span>
                          {t.direction && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] ${t.direction === 'outflow' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{t.direction}</span>
                          )}
                          <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-2)]">{t.target}</span>
                          {!t.is_builtin && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 border border-amber-200">custom</span>
                          )}
                        </div>
                        {t.description && <p className="text-xs text-[var(--text-muted)]">{t.description}</p>}
                        {t.confidence_signals && t.confidence_signals.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {t.confidence_signals.slice(0, 4).map((s) => (
                              <span key={s} className="rounded bg-[var(--surface-2)] border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">{s}</span>
                            ))}
                            {t.confidence_signals.length > 4 && (
                              <span className="text-[11px] text-[var(--text-muted)]">+{t.confidence_signals.length - 4} more</span>
                            )}
                          </div>
                        )}
                      </div>
                      {canWrite && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingKey(t.key)}
                            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                          >
                            {t.is_builtin ? 'Override' : 'Edit'}
                          </button>
                          {!t.is_builtin && (
                            <button
                              type="button"
                              onClick={() => handleDelete(t.key)}
                              className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                              title={t.key in TEMPLATE_CATEGORIES ? 'Reset to built-in default' : 'Delete custom template'}
                            >
                              {t.key in TEMPLATE_CATEGORIES ? 'Reset' : '✕'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Other/uncategorised templates */}
        {(() => {
          const trueOther = templates.filter((t) => !TEMPLATE_CATEGORIES[t.key])
          if (!trueOther.length) return null
          return (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">Other / Custom</p>
              <div className="grid gap-2">
                {trueOther.map((t) => {
                  if (editingKey === t.key) {
                    return (
                      <TemplateForm key={t.key} tmpl={t} isNew={false} onSave={handleSave} onCancel={() => setEditingKey(null)} />
                    )
                  }
                  return (
                    <div key={t.key} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                      <div className="min-w-0 flex-1 grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="shrink-0 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--text-2)]">{t.key}</span>
                          <span className="font-medium text-[var(--text)] text-sm">{t.label}</span>
                          {!t.is_builtin && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 border border-amber-200">custom</span>}
                        </div>
                        {t.description && <p className="text-xs text-[var(--text-muted)]">{t.description}</p>}
                      </div>
                      {canWrite && (
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => setEditingKey(t.key)} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)]">Edit</button>
                          {!t.is_builtin && (
                            <button type="button" onClick={() => handleDelete(t.key)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50">✕</button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>
    </details>
  )
}
