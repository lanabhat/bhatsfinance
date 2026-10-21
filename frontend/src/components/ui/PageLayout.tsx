import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { useRegisterPageHeader } from '../../context/PageChromeContext'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { MoreMenu } from './Menu'
import type { MenuItem } from './rowActions'
import { StatStrip } from './StatCard'

export type PrimaryAction = {
  label: string
  onClick: () => void
  icon?: ReactNode
  disabled?: boolean
  loading?: boolean
}

type HeaderProps = {
  /** The page's only title — the app bar hides its own while this is mounted. */
  title: string
  /** Optional muted line under the title (e.g. "as of 21 Oct 2026"). */
  description?: ReactNode
  /** One primary action, right-aligned. */
  primaryAction?: PrimaryAction
  /** Secondary actions, in a "More" menu. */
  moreActions?: MenuItem[]
  /** Small inline controls next to the actions (e.g. an as-of date). Use sparingly. */
  aside?: ReactNode
}

export function PageHeader({ title, description, primaryAction, moreActions = [], aside }: HeaderProps) {
  useRegisterPageHeader()
  return (
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {aside}
        <MoreMenu items={moreActions} />
        {primaryAction && (
          <Button variant="primary" onClick={primaryAction.onClick} disabled={primaryAction.disabled} loading={primaryAction.loading}
            icon={primaryAction.icon ?? <Plus />}>
            {primaryAction.label}
          </Button>
        )}
      </div>
    </header>
  )
}

type LayoutProps = HeaderProps & {
  /** 2–4 <StatCard>s; wrapped in the shared StatStrip. */
  summary?: ReactNode
  /** Usually one <FilterBar>. */
  toolbar?: ReactNode
  /** Banner-level notices between summary and toolbar (use <Notice>). */
  notices?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Every page: PageHeader → summary strip → notices → toolbar → content, with the same
 * 24px rhythm between sections. Content is <Card>s and/or a <DataTable>.
 */
export function PageLayout({ summary, toolbar, notices, children, className, ...header }: LayoutProps) {
  return (
    <div className={cn('page-enter grid min-w-0 gap-6', className)}>
      <PageHeader {...header} />
      {summary && <StatStrip>{summary}</StatStrip>}
      {notices && <div className="grid gap-3">{notices}</div>}
      {toolbar}
      {children}
    </div>
  )
}
