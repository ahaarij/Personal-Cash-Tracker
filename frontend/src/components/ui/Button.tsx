import { forwardRef, type ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading = false, icon, children, disabled, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        className={`btn btn--${variant} btn--${size} ${className}`}
        {...props}
      >
        {loading && <span className="btn__spinner" aria-hidden="true" />}
        {!loading && icon && <span className="btn__icon" aria-hidden="true">{icon}</span>}
        {children && <span className="btn__label">{children}</span>}
      </button>
    )
  },
)

Button.displayName = 'Button'
