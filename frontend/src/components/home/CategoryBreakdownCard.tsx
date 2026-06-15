import { SectionCard, hexToSectionColor } from '../ui/SectionCard'
import { useMaskedFmt } from '../common/Money'
import type { CategoryBreakdownItem } from '../../types/domain'

type Props = {
  items: CategoryBreakdownItem[]
}


const TYPE_ICONS: Record<string, string> = {
  shield: '🛡', 'piggy-bank': '🐷', 'trending-up': '📈', bank: '🏦',
  house: '🏠', gold: '🪙', star: '⭐', leaf: '🌿', '': '💼',
}

export function CategoryBreakdownCard({ items }: Props) {
  const fmtINR = useMaskedFmt()
  if (!items.length) return null

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Breakdown</h2>
      <div className="grid gap-2">
        {items.map((item) => (
          <SectionCard
            key={item.category_id ?? 'uncategorised'}
            color={hexToSectionColor(item.color)}
            icon={TYPE_ICONS[item.icon_name] ?? '💼'}
            title={item.category_name}
            value={fmtINR(item.market_value)}
            percent={parseFloat(item.allocation_percent)}
            subtitle={`${item.allocation_percent}% of portfolio`}
          />
        ))}
      </div>
    </div>
  )
}
