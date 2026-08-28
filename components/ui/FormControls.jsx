import { Children, cloneElement, forwardRef, isValidElement, useId } from 'react'
import { cx } from './cx'

const controlClass = 'min-h-11 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-secondary disabled:cursor-not-allowed disabled:bg-canvas disabled:text-secondary'

export function Field({ label, htmlFor, hint = '', error = '', required = false, children, className = '' }) {
  const generatedId = useId()
  const child = Children.only(children)
  const childId = isValidElement(child) ? child.props.id : undefined
  const controlId = htmlFor || childId || `field-${generatedId.replaceAll(':', '')}`
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [
    isValidElement(child) ? child.props['aria-describedby'] : undefined,
    hintId,
    errorId,
  ].filter(Boolean).join(' ') || undefined
  const control = isValidElement(child)
    ? cloneElement(child, {
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : child.props['aria-invalid'],
      })
    : child

  return (
    <div className={cx('grid gap-2', className)}>
      <label className="text-sm font-medium text-foreground" htmlFor={controlId}>
        {label}
        {required ? <span aria-hidden="true" className="ml-1 text-destructive">*</span> : null}
      </label>
      {control}
      {hint ? <p className="text-xs leading-5 text-secondary" id={hintId}>{hint}</p> : null}
      {error ? <p className="text-xs leading-5 text-destructive" id={errorId} role="alert">{error}</p> : null}
    </div>
  )
}

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={cx(controlClass, className)} {...props} />
})

export const Select = forwardRef(function Select({ className = '', ...props }, ref) {
  return <select ref={ref} className={cx(controlClass, className)} {...props} />
})

export const Textarea = forwardRef(function Textarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={cx(controlClass, 'min-h-24 resize-y', className)} {...props} />
})

export const Checkbox = forwardRef(function Checkbox({ className = '', ...props }, ref) {
  return <input ref={ref} type="checkbox" className={cx('h-5 w-5 rounded border-line text-primary', className)} {...props} />
})
