import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, X } from 'lucide-react'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { IconButton } from './Button'

export type Fact = { label: string; value: ReactNode; /** Spans both columns. */ wide?: boolean }

type Props = {
  open: boolean
  onClose: () => void
  /** Header: the entity's name. */
  title: string
  /** Header: owner (<MemberAvatar>) and/or type, institution. */
  subtitle?: ReactNode
  /** Header: the headline figure (<Amount>), with an optional <Delta> under it. */
  amount?: ReactNode
  amountCaption?: ReactNode
  /** Header: status <Badge>s. */
  badges?: ReactNode
  /** Key facts grid, two columns. */
  facts?: Fact[]
  /** History / activity — usually a SectionHeader + list. */
  children?: ReactNode
  /** Footer actions, same order as RowMenu (Edit, domain actions…; destructive last). */
  actions?: ReactNode
}

let openCount = 0

/**
 * One detail view for every entity (holding, account, transaction, policy): a right-hand
 * panel on desktop, a full-screen sheet on phones. Header → facts → history → actions.
 */
export function DetailDrawer({ open, onClose, title, subtitle, amount, amountCaption, badges, facts = [], children, actions }: Props) {
  const isMobile = useIsMobile()
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  // Above any sheet/drawer already open when this one opens.
  const layer = useMemo(() => (open ? 50 + (openCount + 1) * 10 : 50), [open])

  useEffect(() => {
    if (!open) return
    openCount += 1
    const prevOverflow = document.body.style.overflow
    if (isMobile) document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => {
      openCount = Math.max(0, openCount - 1)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, isMobile])

  if (!open) return null

  return createPortal(
    <div onClick={(e) => e.stopPropagation()}>
      {!isMobile && <div className="fixed inset-0 bg-black/30" style={{ zIndex: layer }} onClick={onClose} aria-hidden />}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ zIndex: layer }}
        className={
          isMobile
            ? 'fixed inset-0 flex flex-col bg-surface pt-safe'
            : 'fixed inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-line bg-surface shadow-[var(--shadow-modal)]'
        }
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-4 md:px-6">
          {isMobile && <IconButton label="Back" icon={<ArrowLeft />} onClick={onClose} className="-ml-2" />}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight text-ink">{title}</h2>
            {subtitle && <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm text-ink-muted">{subtitle}</div>}
            {(amount || badges) && (
              <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                {amount && (
                  <div>
                    <div className="text-2xl font-semibold tracking-tight text-ink tabular-nums">{amount}</div>
                    {amountCaption && <div className="mt-1 text-sm text-ink-muted">{amountCaption}</div>}
                  </div>
                )}
                {badges && <div className="flex flex-wrap gap-2">{badges}</div>}
              </div>
            )}
          </div>
          {!isMobile && <IconButton label="Close" icon={<X />} onClick={onClose} className="-mr-2" />}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
          {facts.length > 0 && (
            <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3">
              {facts.map((f) => (
                <div key={f.label} className={f.wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
                  <dt className="text-xs text-ink-muted">{f.label}</dt>
                  <dd className="m-0 mt-0.5 min-w-0 break-words text-sm text-ink">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {children}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-line px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6 [&>*]:flex-1 md:[&>*]:flex-none">
            {actions}
          </div>
        )}
      </aside>
    </div>,
    document.body,
  )
}
