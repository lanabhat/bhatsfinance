import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm dark:bg-primary-500 dark:hover:bg-primary-400',
  secondary: 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)] active:bg-[var(--surface-3)]',
  ghost: 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] active:bg-[var(--surface-3)]',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm',
  link: 'bg-transparent text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline-offset-4 hover:underline p-0 h-auto',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-3 text-xs rounded-lg',
  md: 'h-11 px-4 text-sm rounded-lg',
  lg: 'h-12 px-6 text-base rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          variant !== 'link' && sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
