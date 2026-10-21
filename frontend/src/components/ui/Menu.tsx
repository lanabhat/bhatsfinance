import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Eye, MoreHorizontal, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { Button, IconButton } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { Sheet } from './Sheet'
import { sortRowActions } from './rowActions'
import type { MenuItem, RowAction } from './rowActions'

export type { MenuItem, RowAction } from './rowActions'

type MenuProps = {
  items: MenuItem[]
  /** The trigger; receives open state. */
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode
  /** Title for the bottom sheet on phones. */
  title?: string
  align?: 'start' | 'end'
}

/** Dropdown on desktop, bottom sheet on phones. Destructive items are moved to the end. */
export function Menu({ items, trigger, title = 'Actions', align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<MenuItem | null>(null)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const ordered = [...items.filter((i) => !i.destructive), ...items.filter((i) => i.destructive)]

  const place = () => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom > 240
    setPos({
      top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - Math.min(320, ordered.length * 40 + 16)),
      ...(align === 'end' ? { right: window.innerWidth - r.right } : { left: r.left }),
    })
  }
  const toggleOpen = () => { if (!open) place(); setOpen(!open) }

  useEffect(() => {
    if (!open || isMobile) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, isMobile])

  const choose = (item: MenuItem) => {
    setOpen(false)
    if (item.confirm) setPendingConfirm(item)
    else item.onSelect?.()
  }

  const onPanelKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const els = [...(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const i = els.indexOf(document.activeElement as HTMLElement)
    els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus()
  }

  const renderItem = (item: MenuItem, i: number, big: boolean) => {
    const cls = cn(
      'flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-left text-sm transition-colors [&_svg]:h-4 [&_svg]:w-4',
      big ? 'min-h-12' : 'min-h-9',
      item.destructive ? 'text-danger hover:bg-danger-subtle focus:bg-danger-subtle' : 'text-ink hover:bg-surface-2 focus:bg-surface-2',
      'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
    )
    const body = (
      <>
        {item.icon && <span className="shrink-0 text-ink-muted [.text-danger_&]:text-danger" aria-hidden>{item.icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{item.label}</span>
          {item.hint && <span className="block truncate text-xs text-ink-muted">{item.hint}</span>}
        </span>
      </>
    )
    const separator = item.destructive && i > 0 && !ordered[i - 1].destructive
      ? <div key={`sep-${i}`} className="my-1 border-t border-line" role="separator" />
      : null
    const el = item.href
      ? <a key={item.label} role="menuitem" href={item.href} download={item.download} className={cls} onClick={() => setOpen(false)}>{body}</a>
      : <button key={item.label} role="menuitem" type="button" disabled={item.disabled} className={cls} onClick={() => choose(item)}>{body}</button>
    return separator ? [separator, el] : el
  }

  // Portaled panels still bubble React events to the tree they were rendered from (a table
  // row with its own onClick) — stop them here.
  return (
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle: toggleOpen, ref: triggerRef })}
      {open && !isMobile && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          onKeyDown={onPanelKey}
          style={{ top: pos.top, left: pos.left, right: pos.right }}
          className="fixed z-[90] w-60 rounded-[var(--radius-lg)] border border-line bg-surface p-1 shadow-[var(--shadow-modal)]"
        >
          {ordered.map((item, i) => renderItem(item, i, false))}
        </div>,
        document.body,
      )}
      {open && isMobile && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          <div role="menu" className="-mx-2 grid gap-1">{ordered.map((item, i) => renderItem(item, i, true))}</div>
        </Sheet>
      )}
      <ConfirmDialog
        open={!!pendingConfirm}
        title={pendingConfirm?.confirm?.title}
        message={pendingConfirm?.confirm?.message ?? ''}
        confirmLabel={pendingConfirm?.confirm?.confirmLabel ?? pendingConfirm?.label}
        danger={pendingConfirm?.destructive}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => { const item = pendingConfirm; setPendingConfirm(null); item?.onSelect?.() }}
      />
    </span>
  )
}

/** PageHeader's secondary actions: a "More" button. */
export function MoreMenu({ items }: { items: MenuItem[] }) {
  if (items.length === 0) return null
  return (
    <Menu
      items={items}
      title="More actions"
      trigger={({ open, toggle, ref }) => (
        <Button ref={ref} variant="secondary" onClick={toggle} aria-haspopup="menu" aria-expanded={open} icon={<MoreHorizontal />}>
          <span className="hidden sm:inline">More</span>
        </Button>
      )}
    />
  )
}

const KIND_ICON = { view: <Eye />, edit: <Pencil />, delete: <Trash2 /> }

/**
 * Row kebab. Hidden until the row is hovered/focused on desktop (the row needs the
 * `group` class — DataTable adds it), always visible on touch.
 */
export function RowMenu({ actions, label = 'Row actions', title }: { actions: RowAction[]; label?: string; title?: string }) {
  if (actions.length === 0) return null
  return (
    <Menu
      items={sortRowActions(actions).map((a) => ({ ...a, icon: a.icon ?? (a.kind && a.kind !== 'action' ? KIND_ICON[a.kind] : undefined) }))}
      title={title ?? label}
      trigger={({ open, toggle, ref }) => (
        <IconButton
          ref={ref}
          size="sm"
          label={label}
          icon={<MoreVertical />}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); toggle() }}
          className={cn('md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100', open && 'md:opacity-100 bg-surface-2')}
        />
      )}
    />
  )
}
