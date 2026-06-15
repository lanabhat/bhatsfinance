import { useState } from 'react'
import { assetCategoryApi } from '../../api/assetCategoryApi'
import type { AssetCategory } from '../../types/domain'

type Props = {
  householdId: number
  category?: AssetCategory
  onSave: () => void
  onCancel: () => void
}

const PRESET_COLORS = [
  '#94a3b8', '#60a5fa', '#34d399', '#a78bfa',
  '#f87171', '#fb923c', '#facc15', '#38bdf8',
  '#4ade80', '#e879f9',
]

export function AssetCategoryForm({ householdId, category, onSave, onCancel }: Props) {
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? '#94a3b8')
  const [iconName] = useState(category?.icon_name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      if (category) {
        await assetCategoryApi.update(category.id, { name: name.trim(), color, icon_name: iconName })
      } else {
        await assetCategoryApi.create({ household: householdId, name: name.trim(), color, icon_name: iconName, sort_order: 0 })
      }
      onSave()
    } catch {
      setError('Failed to save category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">Name</label>
        <input
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Retirement, Emergency Fund"
          autoFocus
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-[var(--text-2)]">Color</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`h-7 w-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-7 w-7 cursor-pointer rounded-full border-0 p-0"
            title="Custom color"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 border-t border-[var(--border)] pt-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : category ? 'Update' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
