import { Button, IconButton } from './Button'
import { Icon } from './Icon'
import { cx } from './cx'

export function LoadingState({ children, label = 'Loading…', className = '' }) {
  return (
    <div className={cx('flex items-center gap-2 text-sm text-secondary', className)} role="status">
      <Icon className="animate-spin" name="loading" />
      <span>{children ?? label}</span>
    </div>
  )
}

export function EmptyState({ title = 'Nothing here yet', description = '', action, className = '', headingLevel = 3 }) {
  const Heading = `h${headingLevel}`
  return (
    <section className={cx('rounded-surface border border-dashed border-line bg-canvas px-5 py-8 text-center', className)}>
      <Heading className="text-base font-semibold text-foreground">{title}</Heading>
      {description ? <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-secondary">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  )
}

export function ErrorState({ title = 'Something went wrong', description = '', onRetry, className = '', headingLevel = 3 }) {
  const Heading = `h${headingLevel}`
  return (
    <section className={cx('rounded-surface border border-destructive-line bg-destructive-surface px-5 py-4 text-destructive', className)} role="alert">
      <Heading className="font-semibold">{title}</Heading>
      {description ? <p className="mt-1 text-sm leading-6">{description}</p> : null}
      {onRetry ? <Button className="mt-3" onClick={onRetry} variant="secondary">Try again</Button> : null}
    </section>
  )
}

export function Toast({ children, onDismiss, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'border-line bg-surface text-foreground',
    success: 'border-success-line bg-success-surface text-success',
    error: 'border-destructive-line bg-destructive-surface text-destructive',
  }

  return (
    <div
      aria-live="polite"
      className={cx('flex min-w-[280px] max-w-md items-center justify-between gap-3 rounded-surface border px-4 py-3 shadow-menu', tones[tone] || tones.neutral, className)}
    >
      <span className="text-sm font-medium">{children}</span>
      {onDismiss ? (
        <IconButton aria-label="Dismiss notification" onClick={onDismiss}>
          <Icon name="close" />
        </IconButton>
      ) : null}
    </div>
  )
}
