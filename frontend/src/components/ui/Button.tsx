import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * The only button. Three everyday variants — primary (one per page, the PageHeader
 * action), secondary (outline), ghost (text) — plus destructive, which belongs only in
 * menus and confirm dialogs. 'danger' and 'link' are kept as aliases for older callers.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: Size
  loading?: boolean
  /** Leading icon (a lucide element); always sits left of the label. */
  icon?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover shadow-sm',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
  destructive: 'bg-danger text-white hover:opacity-90 shadow-sm dark:text-canvas',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm dark:text-canvas',
  link: 'bg-transparent text-accent hover:underline underline-offset-4',
}

// Heights come from --control-h so buttons, inputs, selects and chips line up.
const sizeClasses: Record<Size, string> = {
  sm: 'h-[var(--control-h-sm)] px-3 text-sm rounded-[var(--radius-md)]',
  md: 'h-[var(--control-h)] px-4 text-sm rounded-[var(--radius-md)]',
  lg: 'h-12 px-6 text-base rounded-[var(--radius-md)]',
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', size = 'md', loading, disabled, className, children, icon, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          'disabled:cursor-not-allowed disabled:opacity-50',
          variantClasses[variant],
          variant === 'link' ? 'h-auto p-0 text-sm' : sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon && <span className="flex h-4 w-4 items-center [&>svg]:h-4 [&>svg]:w-4" aria-hidden>{icon}</span>}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** Required: icon-only buttons need an accessible name. */
  label: string
  icon: ReactNode
  size?: 'sm' | 'md'
}

/** Square ghost button for an icon alone (close, kebab, privacy toggle). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, icon, size = 'md', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-ink-muted transition-colors',
        'hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50',
        '[&>svg]:h-4 [&>svg]:w-4',
        size === 'md' ? 'h-[var(--control-h)] w-[var(--control-h)]' : 'h-[var(--control-h-sm)] w-[var(--control-h-sm)]',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  ),
)
IconButton.displayName = 'IconButton'
