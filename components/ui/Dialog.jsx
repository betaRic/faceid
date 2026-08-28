'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './Button'
import { Icon } from './Icon'

export function Dialog({ open, title, onClose, children, footer, dismissible = true, initialFocusRef }) {
  const titleId = useId()
  const closeButtonRef = useRef(null)
  const restoreFocusRef = useRef(null)

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined

    restoreFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ;(initialFocusRef?.current || closeButtonRef.current)?.focus()

    function handleKeyDown(event) {
      if (dismissible && event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [dismissible, initialFocusRef, open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onMouseDown={(event) => {
      if (dismissible && event.target === event.currentTarget) onClose?.()
    }}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col rounded-t-surface border border-line bg-surface shadow-dialog sm:rounded-surface"
        role="dialog"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground" id={titleId}>{title}</h2>
          {dismissible ? (
            <IconButton ref={closeButtonRef} aria-label="Close dialog" onClick={onClose}>
              <Icon name="close" />
            </IconButton>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  )
}
