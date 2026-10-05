import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  /** 'modal' for desktop dialogs, 'sheet' for mobile bottom sheets */
  variant?: 'modal' | 'sheet'
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'modal',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = `dialog-title-${title.replace(/\s+/g, '-').toLowerCase()}`
  const descId = description ? `${titleId}-desc` : undefined

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleClose = () => onClose()
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const rect = dialogRef.current?.getBoundingClientRect()
    if (!rect) return
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={`dialog dialog--${variant}`}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={handleBackdropClick}
    >
      <div className="dialog__inner" onClick={(e) => e.stopPropagation()}>
        <header className="dialog__header">
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close dialog"
            className="dialog__close"
          >
            <X size={18} strokeWidth={1.5} />
          </Button>
        </header>

        {description && (
          <p id={descId} className="dialog__description">
            {description}
          </p>
        )}

        <div className="dialog__body">{children}</div>

        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </dialog>
  )
}
