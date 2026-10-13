export type Color = 'blue' | 'green' | 'amber' | 'violet' | 'rose' | 'sky' | 'orange' | 'yellow' | 'slate'

export function hexToSectionColor(hex: string): Color {
  const map: Record<string, Color> = {
    '#3b82f6': 'blue', '#0ea5e9': 'sky', '#22c55e': 'green', '#10b981': 'green',
    '#f59e0b': 'amber', '#eab308': 'yellow', '#8b5cf6': 'violet', '#a855f7': 'violet',
    '#f43f5e': 'rose', '#ef4444': 'rose', '#f97316': 'orange', '#94a3b8': 'slate',
  }
  return map[hex.toLowerCase()] ?? 'slate'
}
