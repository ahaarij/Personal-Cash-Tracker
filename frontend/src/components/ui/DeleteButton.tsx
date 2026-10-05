import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from './Dialog'
import { Button } from './Button'

interface DeleteButtonProps {
  onDelete: () => void
  disabled?: boolean
  requireConfirmation?: boolean
}

export function DeleteButton({ onDelete, disabled, requireConfirmation }: DeleteButtonProps) {
  const [hovered, setHovered] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    if (requireConfirmation) {
      setConfirming(true)
    } else {
      onDelete()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="Delete"
        title="Delete"
        disabled={disabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 6px',
          border: 'none',
          borderRadius: '6px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: hovered
            ? 'color-mix(in srgb, var(--color-negative) 12%, transparent)'
            : 'transparent',
          color: hovered ? 'var(--color-negative)' : 'var(--color-text)',
          transition: 'background 120ms ease, color 120ms ease',
          opacity: disabled ? 0.4 : 1,
          flexShrink: 0,
        }}
      >
        <Trash2 size={18} strokeWidth={2} />
      </button>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete transaction?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => { setConfirming(false); onDelete() }}
            >
              Delete
            </Button>
          </>
        }
      >
        <span />
      </Dialog>
    </>
  )
}
