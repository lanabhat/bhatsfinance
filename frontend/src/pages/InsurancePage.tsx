type Category = {
  key: string
  icon: string
  title: string
  description: string
}

const CATEGORIES: Category[] = [
  {
    key: 'life',
    icon: '🛡',
    title: 'Life Insurance (LIC etc.)',
    description: 'Track LIC and other life policies — premium, sum assured, term, nominee, maturity.',
  },
  {
    key: 'health',
    icon: '🏥',
    title: 'Health Insurance',
    description: 'Family floater and individual health policies — sum insured, coverage, renewal date, claims.',
  },
  {
    key: 'vehicle',
    icon: '🚗',
    title: 'Vehicle Insurance',
    description: 'Car / two-wheeler policies — IDV, premium, NCB, expiry, claims history.',
  },
  {
    key: 'other',
    icon: '📄',
    title: 'Other Policies',
    description: 'Travel, home, term riders, and anything else.',
  },
]

export function InsurancePage() {
  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-xl font-semibold text-[var(--text)]">Insurance & Policies</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          A central place for all policy details and supporting documents. This page is a placeholder — the data model
          and forms will land in upcoming releases.
        </p>
      </header>

      <div className="rounded-2xl border border-dashed border-[var(--border-2)] bg-[var(--surface)] p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Coming soon</p>
        <p className="mt-2 text-sm text-[var(--text-2)]">
          You'll be able to:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text-2)]">
          <li>Add policies with premium, term, sum insured/assured, nominee and renewal dates</li>
          <li>Attach PDFs and images — policy documents, premium receipts, claim correspondence</li>
          <li>Get renewal reminders on the dashboard</li>
          <li>Link policies to family members and (optionally) deduct premiums from a tracked account</li>
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CATEGORIES.map((c) => (
          <div key={c.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 opacity-90">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-lg">
                {c.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text)]">{c.title}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{c.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[var(--text-muted)]">
        Have specific fields you want captured for any policy type? Tell the team — fields and validation will be
        finalised before the data model is wired up.
      </p>
    </div>
  )
}
