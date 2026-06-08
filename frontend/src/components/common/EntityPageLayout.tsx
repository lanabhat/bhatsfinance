import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  list: ReactNode
  form: ReactNode
}

export function EntityPageLayout({ title, subtitle, list, form }: Props) {
  const hasForm = form != null
  return (
    <section className="mb-6">
      <header className="mb-4">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </header>
      {hasForm ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>{list}</div>
          <div>{form}</div>
        </div>
      ) : (
        <div>{list}</div>
      )}
    </section>
  )
}
