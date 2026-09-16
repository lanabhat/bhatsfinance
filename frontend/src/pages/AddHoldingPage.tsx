import { BuyForm } from '../components/holdings/BuyForm'
import { useApp } from '../context/AppContext'

/**
 * Full-page "Add Holding" — reached via the Investments page's "+ Add
 * Holding" button (#/holdings/add), not a Sheet popup, so the searchable
 * instrument/fund picker and the rest of the form get the full content
 * width instead of a cramped modal card. "+ Buy More" on an existing
 * holding still uses BuyForm inside a Sheet (HoldingsPage.tsx) — only the
 * no-holding-pinned entry point becomes a page.
 */
export function AddHoldingPage({ onDone }: { onDone: () => void }) {
  const { householdId, refreshDashboard } = useApp()

  const afterSave = async () => {
    await refreshDashboard()
    onDone()
  }

  return (
    <div className="max-w-3xl">
      <BuyForm householdId={householdId} scroll={false} onSave={afterSave} onCancel={onDone} />
    </div>
  )
}
