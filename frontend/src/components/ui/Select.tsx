import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  options: SelectOption[]
  error?: string
  hint?: string
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, hint, placeholder, id, className = '', ...props }, ref) => {
    const selectId = id ?? `select-${label.toLowerCase().replace(/\s+/g, '-')}`
    const errorId = error ? `${selectId}-error` : undefined

    return (
      <div className={`field ${error ? 'field--error' : ''} ${className}`}>
        <label htmlFor={selectId} className="field__label">
          {label}
        </label>
        <div className="field__control select__wrapper">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={!!error}
            aria-describedby={errorId}
            className="field__input select__input"
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="select__chevron" aria-hidden="true">
            <ChevronDown size={16} strokeWidth={1.5} />
          </span>
        </div>
        {error && (
          <p id={errorId} role="alert" className="field__error">
            {error}
          </p>
        )}
        {hint && !error && <p className="field__hint">{hint}</p>}
      </div>
    )
  },
)

Select.displayName = 'Select'
