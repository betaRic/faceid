import { forwardRef } from 'react'
import { cx } from './cx'

const variants = {
  primary: 'border-primary bg-primary text-white hover:bg-primary-strong',
  secondary: 'border-line bg-surface text-primary hover:bg-canvas',
  quiet: 'border-transparent bg-transparent text-primary hover:bg-primary/5',
  destructive: 'border-destructive bg-destructive text-white hover:bg-red-800',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', className = '', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant] || variants.primary,
        className,
      )}
      {...props}
    />
  )
})

export const IconButton = forwardRef(function IconButton(
  { 'aria-label': ariaLabel, className = '', variant = 'quiet', type = 'button', ...props },
  ref,
) {
  if (!ariaLabel) {
    throw new Error('IconButton requires an aria-label')
  }

  return (
    <Button
      ref={ref}
      aria-label={ariaLabel}
      className={cx('min-w-11 px-2', className)}
      type={type}
      variant={variant}
      {...props}
    />
  )
})
