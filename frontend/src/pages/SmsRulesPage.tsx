import { useEffect, useRef, useState } from 'react'
import { smsRulesApi, smsRuleSuggestionsApi, isGroup } from '../api/smsRulesApi'
import type { ConditionGroup, ConditionLeaf, ConditionNode, SmsRule, SmsRuleExportRow, SmsRuleFormData, SmsRuleTestResult, SmsRuleSuggestion } from '../api/smsRulesApi'
import type { OptionItem } from '../types/domain'
import { Drawer } from '../components/ui/Drawer'
import { useAuth } from '../context/AuthContext'

type Props = {
  householdId: number
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLASSIFICATIONS = [
  { value: '', label: '— none —' },
  { value: 'spend', label: 'Spend' },
  { value: 'income', label: 'Income' },
  { value: 'internal_transfer', label: 'Internal Transfer' },
  { value: 'tracking', label: 'Tracking Only' },
]

const TX_TYPES = ['', 'other', 'deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'interest', 'salary', 'emi', 'premium', 'cc_bill_payment']

const SPEND_CATEGORIES = [
  '', 'food', 'transport', 'utilities', 'entertainment', 'healthcare', 'shopping',
  'education', 'travel', 'groceries', 'dining', 'fuel', 'bills', 'other',
]

const LEAF_OPS = ['contains', 'not_contains', 'equals', 'starts_with', 'ends_with', 'regex'] as const
const LEAF_OP_LABELS: Record<string, string> = {
  contains: 'contains', not_contains: 'not contains', equals: 'equals',
  starts_with: 'starts with', ends_with: 'ends with', regex: 'regex',
}

// ---------------------------------------------------------------------------
// Condition tree helpers
// ---------------------------------------------------------------------------

function emptyLeaf(): ConditionLeaf {
  return { field: 'body', op: 'contains', value: '' }
}

function emptyGroup(): ConditionGroup {
  return { op: 'and', conditions: [] }
}

function emptyConditions(): ConditionGroup {
  return { op: 'and', conditions: [emptyLeaf()] }
}

// Immutable tree update helpers — each returns a new tree with the change applied
type Path = number[]

function updateNode(root: ConditionGroup, path: Path, updater: (n: ConditionNode) => ConditionNode): ConditionGroup {
  if (path.length === 0) return updater(root) as ConditionGroup
  const [idx, ...rest] = path
  return {
    ...root,
    conditions: root.conditions.map((child, i) =>
      i === idx
        ? rest.length === 0
          ? updater(child)
          : updateNode(child as ConditionGroup, rest, updater)
        : child
    ),
  }
}

function deleteNode(root: ConditionGroup, path: Path): ConditionGroup {
  if (path.length === 1) {
    return { ...root, conditions: root.conditions.filter((_, i) => i !== path[0]) }
  }
  const [idx, ...rest] = path
  return {
    ...root,
    conditions: root.conditions.map((child, i) =>
      i === idx ? deleteNode(child as ConditionGroup, rest) : child
    ),
  }
}

function addToGroup(root: ConditionGroup, path: Path, node: ConditionNode): ConditionGroup {
  if (path.length === 0) {
    return { ...root, conditions: [...root.conditions, node] }
  }
  const [idx, ...rest] = path
  return {
    ...root,
    conditions: root.conditions.map((child, i) =>
      i === idx ? addToGroup(child as ConditionGroup, rest, node) : child
    ),
  }
}

// Promote children of a sub-group into its parent
function ungroupAt(root: ConditionGroup, path: Path): ConditionGroup {
  if (path.length === 1) {
    const idx = path[0]
    const target = root.conditions[idx]
    if (!isGroup(target)) return root
    const before = root.conditions.slice(0, idx)
    const after = root.conditions.slice(idx + 1)
    return { ...root, conditions: [...before, ...target.conditions, ...after] }
  }
  const [idx, ...rest] = path
  return {
    ...root,
    conditions: root.conditions.map((child, i) =>
      i === idx ? ungroupAt(child as ConditionGroup, rest) : child
    ),
  }
}

// ---------------------------------------------------------------------------
// Condition tree UI components
// ---------------------------------------------------------------------------

function LeafEditor({
  leaf,
  path,
  onChange,
  onDelete,
}: {
  leaf: ConditionLeaf
  path: Path
  onChange: (path: Path, updated: ConditionLeaf) => void
  onDelete: (path: Path) => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select
        value={leaf.field}
        onChange={(e) => onChange(path, { ...leaf, field: e.target.value as 'sender' | 'body' })}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
      >
        <option value="sender">sender</option>
        <option value="body">body</option>
      </select>
      <select
        value={leaf.op}
        onChange={(e) => onChange(path, { ...leaf, op: e.target.value as ConditionLeaf['op'] })}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
      >
        {LEAF_OPS.map((op) => <option key={op} value={op}>{LEAF_OP_LABELS[op]}</option>)}
      </select>
      <input
        value={leaf.value}
        onChange={(e) => onChange(path, { ...leaf, value: e.target.value })}
        placeholder="value"
        className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono"
      />
      <button
        type="button"
        onClick={() => onDelete(path)}
        className="shrink-0 rounded-md border border-red-200 px-1.5 py-1 text-[11px] text-red-500 hover:bg-red-50"
        title="Remove condition"
      >
        ✕
      </button>
    </div>
  )
}

function GroupEditor({
  group,
  path,
  depth,
  onChange,
  onDelete,
  onAddLeaf,
  onAddGroup,
  onUngroup,
}: {
  group: ConditionGroup
  path: Path
  depth: number
  onChange: (path: Path, updated: ConditionNode) => void
  onDelete: (path: Path) => void
  onAddLeaf: (path: Path) => void
  onAddGroup: (path: Path) => void
  onUngroup: (path: Path) => void
}) {
  const isRoot = path.length === 0
  const indent = depth > 0 ? 'ml-4 border-l-2 border-slate-200 pl-3' : ''

  return (
    <div className={`grid gap-1.5 ${indent}`}>
      {/* Group header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(path, { ...group, op: group.op === 'and' ? 'or' : 'and' })}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            group.op === 'and'
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}
          title="Click to toggle AND / OR"
        >
          {group.op}
        </button>
        {!isRoot && (
          <>
            <button
              type="button"
              onClick={() => onUngroup(path)}
              className="text-[11px] text-slate-400 hover:text-slate-700"
              title="Promote children to parent"
            >
              ungroup
            </button>
            <button
              type="button"
              onClick={() => onDelete(path)}
              className="rounded-md border border-red-200 px-1.5 py-0.5 text-[11px] text-red-500 hover:bg-red-50"
            >
              ✕
            </button>
          </>
        )}
      </div>

      {/* Children */}
      {group.conditions.map((child, i) => {
        const childPath = [...path, i]
        return isGroup(child) ? (
          <GroupEditor
            key={i}
            group={child}
            path={childPath}
            depth={depth + 1}
            onChange={onChange}
            onDelete={onDelete}
            onAddLeaf={onAddLeaf}
            onAddGroup={onAddGroup}
            onUngroup={onUngroup}
          />
        ) : (
          <LeafEditor
            key={i}
            leaf={child}
            path={childPath}
            onChange={(p, updated) => onChange(p, updated)}
            onDelete={onDelete}
          />
        )
      })}

      {/* Add buttons */}
      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => onAddLeaf(path)}
          className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-500 hover:border-slate-400 hover:text-slate-700"
        >
          + Condition
        </button>
        <button
          type="button"
          onClick={() => onAddGroup(path)}
          className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-500 hover:border-slate-400 hover:text-slate-700"
        >
          + Sub-group
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Regex field with inline client-side test
// ---------------------------------------------------------------------------

function RegexField({
  label,
  value,
  testBody,
  onChange,
}: {
  label: string
  value: string
  testBody: string
  onChange: (v: string) => void
}) {
  const [result, setResult] = useState<string | null>(null)

  function testInline() {
    if (!value.trim() || !testBody.trim()) { setResult('(no test body)'); return }
    try {
      const m = new RegExp(value, 'i').exec(testBody)
      if (!m) { setResult('no match'); return }
      try {
        const named = (m as RegExpExecArray & { groups?: Record<string, string> }).groups?.value
        setResult(named !== undefined ? `"${named}"` : `group 1: "${m[1] ?? ''}"`)
      } catch {
        setResult(`match: "${m[0]}"`)
      }
    } catch {
      setResult('invalid regex')
    }
  }

  return (
    <div className="grid gap-1">
      <span className="text-[11px] font-medium text-slate-600">{label}</span>
      <div className="flex gap-1.5">
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setResult(null) }}
          placeholder={`e.g. (?:Rs\\.?|INR)\\s*([\\d,]+\\.?\\d*)`}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={testInline}
          className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
          title="Test regex against sample body below"
        >
          ▶ Test
        </button>
      </div>
      {result !== null && (
        <p className={`text-[11px] ${result === 'no match' || result === 'invalid regex' ? 'text-red-500' : 'text-green-600'}`}>
          {result}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty rule form data
// ---------------------------------------------------------------------------

function emptyFormData(householdId: number): SmsRuleFormData {
  return {
    household: householdId,
    name: '',
    is_active: true,
    priority: 0,
    conditions: emptyConditions(),
    account: null,
    member: null,
    direction: '',
    transaction_type: '',
    classification: '',
    spend_category: '',
    amount_regex: '',
    merchant_regex: '',
    reference_regex: '',
    notes_regex: '',
  }
}

// ---------------------------------------------------------------------------
// RuleEditor — drawer content
// ---------------------------------------------------------------------------

function RuleEditor({
  initial,
  initialFormData,
  householdId,
  accountOptions,
  memberOptions,
  onSaved,
  onCancel,
}: {
  initial: SmsRule | null
  initialFormData?: SmsRuleFormData | null
  householdId: number
  accountOptions: OptionItem[]
  memberOptions: OptionItem[]
  onSaved: (rule: SmsRule) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<SmsRuleFormData>(
    initialFormData
      ? initialFormData
      : initial
        ? {
            household: initial.household,
            name: initial.name,
            is_active: initial.is_active,
            priority: initial.priority,
            conditions: initial.conditions ?? emptyConditions(),
            account: initial.account,
            member: initial.member,
            direction: initial.direction,
            transaction_type: initial.transaction_type,
            classification: initial.classification,
            spend_category: initial.spend_category,
            amount_regex: initial.amount_regex,
            merchant_regex: initial.merchant_regex,
            reference_regex: initial.reference_regex,
            notes_regex: initial.notes_regex,
          }
        : emptyFormData(householdId)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Live-test state
  const [testSender, setTestSender] = useState('')
  const [testBody, setTestBody] = useState('')
  const [testResult, setTestResult] = useState<SmsRuleTestResult | null>(null)
  const [testing, setTesting] = useState(false)

  function set<K extends keyof SmsRuleFormData>(k: K, v: SmsRuleFormData[K]) {
    setDraft((p) => ({ ...p, [k]: v }))
  }

  // Condition tree handlers
  function handleChangeNode(path: Path, updated: ConditionNode) {
    const newTree = path.length === 0
      ? (updated as ConditionGroup)
      : updateNode(draft.conditions, path, () => updated)
    set('conditions', newTree)
  }

  function handleDeleteNode(path: Path) {
    set('conditions', deleteNode(draft.conditions, path))
  }

  function handleAddLeaf(path: Path) {
    set('conditions', addToGroup(draft.conditions, path, emptyLeaf()))
  }

  function handleAddGroup(path: Path) {
    set('conditions', addToGroup(draft.conditions, path, emptyGroup()))
  }

  function handleUngroup(path: Path) {
    set('conditions', ungroupAt(draft.conditions, path))
  }

  async function handleSave() {
    if (!draft.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const saved = initial
        ? await smsRulesApi.update(initial.id, draft)
        : await smsRulesApi.create(draft)
      onSaved(saved)
    } catch (e: unknown) {
      const msg = (e as { detail?: string; error?: string })?.detail ?? (e as { error?: string })?.error ?? 'Save failed.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await smsRulesApi.testNew(draft, testSender, testBody)
      setTestResult(result)
    } catch {
      setTestResult({ matched: false, extractions: {} })
    } finally {
      setTesting(false)
    }
  }

  const showSpendCategory = draft.classification === 'spend'

  return (
    <div className="grid gap-6 pb-4">
      {/* Basic fields */}
      <section className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-700">
              Rule name *
              <input
                value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. HDFC debit card spend"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="text-xs font-medium text-slate-700">
            Priority
            <input
              type="number"
              value={draft.priority}
              onChange={(e) => set('priority', parseInt(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <p className="mt-0.5 text-[11px] text-slate-400">Lower = evaluated first</p>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            className="rounded"
          />
          Active (rule runs at ingest time)
        </label>
      </section>

      {/* Conditions */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Conditions</h4>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <GroupEditor
            group={draft.conditions}
            path={[]}
            depth={0}
            onChange={handleChangeNode}
            onDelete={handleDeleteNode}
            onAddLeaf={handleAddLeaf}
            onAddGroup={handleAddGroup}
            onUngroup={handleUngroup}
          />
        </div>
      </section>

      {/* Field mapping */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Field Mapping</h4>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Account
              <select
                value={String(draft.account ?? '')}
                onChange={(e) => set('account', e.target.value ? Number(e.target.value) : null)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">— no override —</option>
                {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Member
              <select
                value={String(draft.member ?? '')}
                onChange={(e) => set('member', e.target.value ? Number(e.target.value) : null)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">— no override —</option>
                {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Direction
              <select
                value={draft.direction}
                onChange={(e) => set('direction', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">— no override —</option>
                <option value="outflow">Outflow (expense)</option>
                <option value="inflow">Inflow (income)</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Transaction type
              <select
                value={draft.transaction_type}
                onChange={(e) => set('transaction_type', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">— no override —</option>
                {TX_TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Classification
              <select
                value={draft.classification}
                onChange={(e) => set('classification', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {CLASSIFICATIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            {showSpendCategory && (
              <label className="text-xs font-medium text-slate-700">
                Spend category
                <select
                  value={draft.spend_category}
                  onChange={(e) => set('spend_category', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">— no override —</option>
                  {SPEND_CATEGORIES.filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
      </section>

      {/* Regex extractors */}
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Regex Extractors</h4>
        <p className="mb-3 text-[11px] text-slate-400">
          Use a capture group to extract the value — either <code className="rounded bg-slate-100 px-1">(?P&lt;value&gt;...)</code> (named) or a plain <code className="rounded bg-slate-100 px-1">(...)</code> group.
          Click ▶ Test to check against the sample body below.
        </p>
        <div className="grid gap-3">
          <RegexField label="Amount" value={draft.amount_regex} testBody={testBody} onChange={(v) => set('amount_regex', v)} />
          <RegexField label="Merchant" value={draft.merchant_regex} testBody={testBody} onChange={(v) => set('merchant_regex', v)} />
          <RegexField label="Reference" value={draft.reference_regex} testBody={testBody} onChange={(v) => set('reference_regex', v)} />
          <RegexField label="Notes" value={draft.notes_regex} testBody={testBody} onChange={(v) => set('notes_regex', v)} />
        </div>
      </section>

      {/* Live test panel */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live Test</h4>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 grid gap-2">
          <label className="text-xs font-medium text-slate-700">
            Sender
            <input
              value={testSender}
              onChange={(e) => setTestSender(e.target.value)}
              placeholder="e.g. HDFCBK"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Body
            <textarea
              value={testBody}
              onChange={(e) => setTestBody(e.target.value)}
              rows={3}
              placeholder="Paste a sample SMS body here"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono resize-none"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {testing ? 'Testing…' : '▶ Test Rule'}
            </button>
            {testResult && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                  testResult.matched
                    ? 'bg-green-50 border-green-300 text-green-700'
                    : 'bg-red-50 border-red-300 text-red-600'
                }`}>
                  {testResult.matched ? '✓ Matched' : '✗ No match'}
                </span>
                {Object.entries(testResult.extractions).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] text-blue-700">
                    {k}: {v}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Footer actions */}
      <div className="flex gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !draft.name.trim()}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : initial ? 'Update rule' : 'Create rule'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Condition summary (short description for list view)
// ---------------------------------------------------------------------------

function conditionSummary(node: ConditionNode, depth = 0): string {
  if (!isGroup(node)) {
    return `${node.field} ${LEAF_OP_LABELS[node.op] ?? node.op} "${node.value}"`
  }
  if (!node.conditions.length) return '(empty)'
  const parts = node.conditions.slice(0, 3).map((c) => conditionSummary(c, depth + 1))
  const suffix = node.conditions.length > 3 ? ` + ${node.conditions.length - 3} more` : ''
  const joined = parts.join(` ${node.op.toUpperCase()} `)
  return depth > 0 ? `(${joined}${suffix})` : `${joined}${suffix}`
}

// ---------------------------------------------------------------------------
// RuleRow
// ---------------------------------------------------------------------------

function RuleRow({
  rule,
  onEdit,
  onDelete,
  onToggle,
  onDuplicate,
}: {
  rule: SmsRule
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onDuplicate: () => void
}) {
  const summary = conditionSummary(rule.conditions ?? emptyConditions())

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
      <div className="min-w-0 flex-1 grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm text-slate-800 truncate">{rule.name}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] border ${
            rule.is_active
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-slate-100 border-slate-200 text-slate-400'
          }`}>
            {rule.is_active ? 'active' : 'inactive'}
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
            priority {rule.priority}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 font-mono truncate">{summary}</p>
        <div className="flex flex-wrap gap-1.5 mt-0.5">
          {rule.account_name && (
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] text-primary-700">
              {rule.account_name}
            </span>
          )}
          {rule.member_name && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              {rule.member_name}
            </span>
          )}
          {rule.direction && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${
              rule.direction === 'outflow' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
            }`}>
              {rule.direction}
            </span>
          )}
          {rule.classification && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
              {rule.classification}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1 pt-0.5">
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          title={rule.is_active ? 'Disable rule' : 'Enable rule'}
        >
          {rule.is_active ? 'Disable' : 'Enable'}
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          title="Duplicate rule"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SuggestionCard — one auto-suggestion from the learn engine
// ---------------------------------------------------------------------------

function SuggestionCard({
  suggestion,
  onDismiss,
  onCreateRule,
}: {
  suggestion: SmsRuleSuggestion
  onDismiss: () => void
  onCreateRule: () => void
}) {
  const dirColor = suggestion.direction === 'outflow'
    ? 'bg-red-50 text-red-600'
    : suggestion.direction === 'inflow'
      ? 'bg-green-50 text-green-600'
      : 'bg-slate-100 text-slate-500'

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 grid gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-amber-900">Auto-suggested rule</span>
            <span className="rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[11px] text-amber-800">
              {suggestion.observation_count} approval{suggestion.observation_count === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-0.5 text-sm font-medium text-slate-800 font-mono truncate">
            sender: {suggestion.sender}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-amber-400 hover:text-amber-700 text-xs px-1"
          title="Dismiss suggestion"
        >
          ✕
        </button>
      </div>

      {/* Proposed mappings */}
      <div className="flex flex-wrap gap-1.5">
        {suggestion.account_name && (
          <span className="rounded-full bg-primary-50 border border-primary-100 px-2 py-0.5 text-[11px] text-primary-700">
            {suggestion.account_name}
          </span>
        )}
        {suggestion.member_name && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {suggestion.member_name}
          </span>
        )}
        {suggestion.direction && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${dirColor}`}>
            {suggestion.direction}
          </span>
        )}
        {suggestion.classification && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
            {suggestion.classification}
          </span>
        )}
        {suggestion.spend_category && (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">
            {suggestion.spend_category}
          </span>
        )}
      </div>

      {/* Body samples */}
      {suggestion.body_samples.length > 0 && (
        <div className="rounded-lg bg-white border border-amber-100 px-3 py-2 grid gap-1">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Sample SMS</p>
          {suggestion.body_samples.slice(0, 2).map((s, i) => (
            <p key={i} className="text-[11px] font-mono text-slate-600 truncate">{s}</p>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCreateRule}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
        >
          Create Rule
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RulesImportDrawer — review + import rules from a JSON file
// ---------------------------------------------------------------------------

type ImportRowState = 'pending' | 'imported' | 'skipped'

function RulesImportDrawer({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: (rules: SmsRule[]) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<SmsRuleExportRow[]>([])
  const [rowState, setRowState] = useState<ImportRowState[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; errors: { index: number; name?: string; detail: string }[] } | null>(null)
  const [fileError, setFileError] = useState('')

  function reset() {
    setRows([])
    setRowState([])
    setResult(null)
    setFileError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError('')
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const loaded: SmsRuleExportRow[] = parsed.sms_rules ?? parsed.rules ?? parsed
      if (!Array.isArray(loaded) || loaded.length === 0) {
        setFileError('No rules found in file.')
        return
      }
      setRows(loaded)
      setRowState(loaded.map(() => 'pending'))
      setResult(null)
    } catch {
      setFileError('Invalid JSON file.')
    }
  }

  function toggleRow(i: number) {
    setRowState((prev) => prev.map((s, idx) => idx === i ? (s === 'pending' ? 'skipped' : 'pending') : s))
  }

  async function importSelected() {
    const toImport = rows.filter((_, i) => rowState[i] === 'pending')
    if (toImport.length === 0) return
    setBusy(true)
    setResult(null)
    try {
      const res = await smsRulesApi.importRules(toImport)
      setResult(res)
      // Mark imported rows as done — map pending rows in order to import indices
      let pendingsSeen = 0
      const next = rowState.map((s) => {
        if (s !== 'pending') return s
        const idx = pendingsSeen++
        const hasError = res.errors.some((e) => e.index === idx)
        return hasError ? s : 'imported' as ImportRowState
      })
      setRowState(next)
      if (res.created > 0) {
        // Refresh rules list in parent
        onImported([])
      }
    } catch {
      setFileError('Import request failed.')
    } finally {
      setBusy(false)
    }
  }

  const pendingCount = rowState.filter((s) => s === 'pending').length

  return (
    <Drawer open={open} onClose={handleClose} title="Import Rules" width="w-full max-w-2xl">
      <div className="grid gap-5 pb-4">
        <div>
          <p className="text-xs text-slate-500">
            Upload a rules JSON file (exported from this page). Review each rule, then import selected or all at once.
            Account and member are matched by name — they'll be blank if no match is found in this household.
          </p>
        </div>

        {rows.length === 0 && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-6 py-10 hover:border-primary-300">
            <span className="text-sm font-medium text-slate-600">Choose a JSON file</span>
            <span className="text-xs text-slate-400">sms_rules.json</span>
            <input ref={fileRef} type="file" accept=".json" className="sr-only" onChange={handleFile} />
          </label>
        )}

        {fileError && <p className="text-sm text-red-600">{fileError}</p>}

        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">{rows.length} rule{rows.length === 1 ? '' : 's'} found — {pendingCount} selected for import</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRowState(rows.map(() => 'pending'))}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setRowState(rows.map(() => 'skipped'))}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div className="grid gap-2 max-h-[50vh] overflow-y-auto pr-1">
              {rows.map((row, i) => {
                const state = rowState[i]
                return (
                  <div
                    key={i}
                    className={`rounded-xl border px-4 py-3 transition-colors ${
                      state === 'imported'
                        ? 'border-green-200 bg-green-50 opacity-60'
                        : state === 'skipped'
                          ? 'border-slate-200 bg-slate-50 opacity-50'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{row.name}</span>
                          {!row.is_active && (
                            <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] text-slate-400">inactive</span>
                          )}
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">priority {row.priority}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {row.account_name && (
                            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] text-primary-700">{row.account_name}</span>
                          )}
                          {row.direction && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] ${row.direction === 'outflow' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                              {row.direction}
                            </span>
                          )}
                          {row.classification && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">{row.classification}</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {state === 'imported' ? (
                          <span className="text-xs text-green-600 font-medium">Imported</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleRow(i)}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                              state === 'pending'
                                ? 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100'
                                : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            {state === 'pending' ? 'Import' : 'Skip'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {result && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${result.errors.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
                <p className={result.errors.length > 0 ? 'text-amber-800' : 'text-green-800'}>
                  {result.created} rule{result.created === 1 ? '' : 's'} imported
                  {result.errors.length > 0 && `, ${result.errors.length} failed`}.
                </p>
                {result.errors.map((err) => (
                  <p key={err.index} className="mt-0.5 text-xs text-amber-700">{err.name || `Rule ${err.index + 1}`}: {err.detail}</p>
                ))}
              </div>
            )}

            <div className="flex gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={importSelected}
                disabled={busy || pendingCount === 0}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
              >
                {busy ? 'Importing…' : `Import selected (${pendingCount})`}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  )
}

// ---------------------------------------------------------------------------
// TestDetectionPanel — standalone detect panel on the Test tab
// ---------------------------------------------------------------------------

type DetectResult = {
  matched_rule: { id: number; name: string } | null
  parsed_tx: Record<string, string>
  all_rules: { id: number; name: string; matched: boolean }[]
}

function TestDetectionPanel({ householdId }: { householdId: number }) {
  const [sender, setSender] = useState('')
  const [body, setBody] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<DetectResult | null>(null)
  const [error, setError] = useState('')

  async function handleDetect() {
    if (!body.trim()) return
    setTesting(true)
    setResult(null)
    setError('')
    try {
      const res = await smsRulesApi.detect(householdId, sender, body)
      setResult(res)
    } catch {
      setError('Detection failed.')
    } finally {
      setTesting(false)
    }
  }

  const parsedEntries = result ? Object.entries(result.parsed_tx).filter(([, v]) => v) : []

  return (
    <div className="grid gap-5 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Test SMS Detection</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Paste a sample SMS to see which rule matches and what fields get extracted.
          No data is saved — this is a dry run.
        </p>
      </div>

      <div className="grid gap-3">
        <label className="text-xs font-medium text-slate-700">
          Sender
          <input
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="e.g. HDFCBK"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-700">
          Message body
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Paste the full SMS text here…"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono resize-y"
          />
        </label>
        <button
          type="button"
          onClick={handleDetect}
          disabled={testing || !body.trim()}
          className="self-start rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
        >
          {testing ? 'Running…' : '▶ Run Detection'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="grid gap-4">
          {/* Match result */}
          <div className={`rounded-xl border px-4 py-3 ${
            result.matched_rule
              ? 'border-green-200 bg-green-50'
              : 'border-slate-200 bg-slate-50'
          }`}>
            {result.matched_rule ? (
              <p className="text-sm font-medium text-green-800">
                ✓ Matched: <span className="font-semibold">{result.matched_rule.name}</span>
              </p>
            ) : (
              <p className="text-sm font-medium text-slate-600">✗ No rule matched — form will be blank</p>
            )}
          </div>

          {/* Extracted parsed_tx fields */}
          {parsedEntries.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted Fields</p>
              <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                {parsedEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-36 shrink-0 text-xs text-slate-400">{k}</span>
                    <span className="font-mono text-slate-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All rules evaluation */}
          {result.all_rules.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 select-none">
                Show all {result.all_rules.length} rule{result.all_rules.length === 1 ? '' : 's'} evaluated
              </summary>
              <div className="mt-2 grid gap-1">
                {result.all_rules.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${r.matched ? 'bg-green-400' : 'bg-slate-200'}`} />
                    <span className={r.matched ? 'font-medium text-slate-800' : 'text-slate-400'}>{r.name}</span>
                    {r.matched && <span className="text-green-600">matched</span>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {result.all_rules.length === 0 && (
            <p className="text-xs text-slate-400">No active rules configured yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type PageTab = 'rules' | 'test'

export function SmsRulesPage({ householdId, accountOptions, memberOptions }: Props) {
  const { user } = useAuth()
  const canWrite = user.authenticated && (user.role === 'admin' || user.role === 'super_admin')

  const [tab, setTab] = useState<PageTab>('rules')
  const [rules, setRules] = useState<SmsRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [suggestions, setSuggestions] = useState<SmsRuleSuggestion[]>([])
  const [importOpen, setImportOpen] = useState(false)

  const [editing, setEditing] = useState<SmsRule | null | 'new'>(null)
  // When editing is a pre-filled SmsRuleFormData (from suggestion accept), pass it as initialFormData
  const [editingPrefill, setEditingPrefill] = useState<SmsRuleFormData | null>(null)

  useEffect(() => {
    if (!householdId) return
    setLoading(true)
    Promise.all([
      smsRulesApi.list(householdId),
      smsRuleSuggestionsApi.list(householdId),
    ])
      .then(([r, s]) => {
        setRules(r)
        setSuggestions(s.filter((sg) => sg.status === 'pending'))
      })
      .catch(() => setError('Failed to load SMS rules.'))
      .finally(() => setLoading(false))
  }, [householdId])

  function handleSaved(saved: SmsRule) {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id)
      return idx >= 0 ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved]
    })
    setEditing(null)
  }

  async function handleDelete(rule: SmsRule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return
    try {
      await smsRulesApi.delete(rule.id)
      setRules((prev) => prev.filter((r) => r.id !== rule.id))
    } catch {
      setError('Delete failed.')
    }
  }

  async function handleToggle(rule: SmsRule) {
    try {
      const updated = await smsRulesApi.update(rule.id, { is_active: !rule.is_active })
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)))
    } catch {
      setError('Update failed.')
    }
  }

  async function handleDuplicate(rule: SmsRule) {
    try {
      const copy = await smsRulesApi.create({
        household: rule.household,
        name: `${rule.name} (copy)`,
        is_active: false,
        priority: rule.priority,
        conditions: rule.conditions,
        account: rule.account,
        member: rule.member,
        direction: rule.direction,
        transaction_type: rule.transaction_type,
        classification: rule.classification,
        spend_category: rule.spend_category,
        amount_regex: rule.amount_regex,
        merchant_regex: rule.merchant_regex,
        reference_regex: rule.reference_regex,
        notes_regex: rule.notes_regex,
      })
      setRules((prev) => [...prev, copy])
      setEditing(copy)
    } catch {
      setError('Duplicate failed.')
    }
  }

  async function handleDismissSuggestion(id: number) {
    try {
      await smsRuleSuggestionsApi.dismiss(id)
      setSuggestions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError('Dismiss failed.')
    }
  }

  async function handleAcceptSuggestion(id: number) {
    try {
      const { prefill } = await smsRuleSuggestionsApi.accept(id)
      setSuggestions((prev) => prev.filter((s) => s.id !== id))
      setEditingPrefill(prefill)
      setEditing('new')
    } catch {
      setError('Failed to load suggestion.')
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>

  return (
    <div className="grid gap-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">SMS Rules</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Rules match incoming SMS messages and pre-fill the approval form with mapped fields.
            First matching rule wins — use the Test tab to verify before saving.
          </p>
        </div>
        {canWrite && tab === 'rules' && (
          <div className="flex gap-2">
            <a
              href={smsRulesApi.exportUrl(householdId)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Export rules
            </a>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Import rules
            </button>
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              + Add rule
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['rules', 'test'] as PageTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'rules' ? `Rules (${rules.length})` : 'Test Detection'}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {tab === 'test' && <TestDetectionPanel householdId={householdId} />}

      {tab === 'rules' && (
        <>
          {/* Suggestions */}
          {canWrite && suggestions.length > 0 && (
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Suggested rules ({suggestions.length})
              </p>
              {suggestions.map((sg) => (
                <SuggestionCard
                  key={sg.id}
                  suggestion={sg}
                  onDismiss={() => handleDismissSuggestion(sg.id)}
                  onCreateRule={() => handleAcceptSuggestion(sg.id)}
                />
              ))}
            </div>
          )}

          {rules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center">
              <p className="text-sm font-medium text-slate-600">No rules yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Create a rule to automatically map an SMS sender + body pattern to an account, direction, and classification.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onEdit={() => setEditing(rule)}
                  onDelete={() => handleDelete(rule)}
                  onToggle={() => handleToggle(rule)}
                  onDuplicate={() => handleDuplicate(rule)}
                />
              ))}
            </div>
          )}

          {rules.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Rules are evaluated in priority order (lower number first). Use the Test Detection tab to verify rules against sample SMS bodies.
            </div>
          )}
        </>
      )}

      {/* Rules import drawer */}
      <RulesImportDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setImportOpen(false)
          smsRulesApi.list(householdId).then(setRules).catch(() => {})
        }}
      />

      {/* Editor drawer */}
      <Drawer
        open={editing !== null}
        onClose={() => { setEditing(null); setEditingPrefill(null) }}
        title={editing === 'new' ? 'New SMS Rule' : `Edit: ${(editing as SmsRule)?.name ?? ''}`}
        width="w-full max-w-2xl"
      >
        {editing !== null && (
          <RuleEditor
            initial={editing === 'new' ? null : editing}
            initialFormData={editing === 'new' ? editingPrefill : null}
            householdId={householdId}
            accountOptions={accountOptions}
            memberOptions={memberOptions}
            onSaved={handleSaved}
            onCancel={() => { setEditing(null); setEditingPrefill(null) }}
          />
        )}
      </Drawer>
    </div>
  )
}
