import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  suffix?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, suffix, id, className = '', ...props }, ref) => {
    const inputId = id ?? `input-${label.toLowerCase().replace(/\s+/g, '-')}`
    const errorId = error ? `${inputId}-error` : undefined
    const hintId = hint ? `${inputId}-hint` : undefined

    return (
      <div className={`field ${error ? 'field--error' : ''} ${className}`}>
        <label htmlFor={inputId} className="field__label">
          {label}
        </label>
        <div className="field__control">
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
            className={`field__input ${suffix ? 'field__input--with-suffix' : ''}`}
            {...props}
          />
          {suffix && <span className="field__suffix" aria-hidden="true">{suffix}</span>}
        </div>
        {error && (
          <p id={errorId} role="alert" className="field__error">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="field__hint">
            {hint}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
