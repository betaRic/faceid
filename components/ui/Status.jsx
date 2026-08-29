import { cx } from './cx'

const tones = {
  neutral: 'border-line bg-canvas text-secondary before:bg-secondary',
  active: 'border-success-line bg-success-surface text-success before:bg-success',
  success: 'border-success-line bg-success-surface text-success before:bg-success',
  pending: 'border-warning-line bg-warning-surface text-warning before:bg-warning',
  review: 'border-warning-line bg-warning-surface text-warning before:bg-warning',
  warning: 'border-warning-line bg-warning-surface text-warning before:bg-warning',
  blocked: 'border-destructive-line bg-destructive-surface text-destructive before:bg-destructive',
  rejected: 'border-destructive-line bg-destructive-surface text-destructive before:bg-destructive',
  error: 'border-destructive-line bg-destructive-surface text-destructive before:bg-destructive',
  danger: 'border-destructive-line bg-destructive-surface text-destructive before:bg-destructive',
}

export function Status({ tone = 'neutral', className = '', children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold before:h-1.5 before:w-1.5 before:rounded-full before:content-[\'\']',
        tones[tone] || tones.neutral,
        className,
      )}
      data-tone={tone}
    >
      {children}
    </span>
  )
}
