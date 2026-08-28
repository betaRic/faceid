import { cx } from './cx'

const tones = {
  neutral: 'border-line bg-canvas text-secondary before:bg-secondary',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800 before:bg-emerald-600',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 before:bg-emerald-600',
  pending: 'border-amber-200 bg-amber-50 text-amber-900 before:bg-amber-500',
  review: 'border-amber-200 bg-amber-50 text-amber-900 before:bg-amber-500',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 before:bg-amber-500',
  blocked: 'border-red-200 bg-red-50 text-red-800 before:bg-red-600',
  rejected: 'border-red-200 bg-red-50 text-red-800 before:bg-red-600',
  error: 'border-red-200 bg-red-50 text-red-800 before:bg-red-600',
  danger: 'border-red-200 bg-red-50 text-red-800 before:bg-red-600',
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
