import { cx } from './cx'

export function Surface({ as: Component = 'section', className = '', children, ...props }) {
  return (
    <Component className={cx('rounded-surface border border-line bg-surface', className)} {...props}>
      {children}
    </Component>
  )
}

export function PageHeader({ title, description = '', actions, className = '' }) {
  return (
    <header className={cx('flex flex-col items-start justify-between gap-4 sm:flex-row', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div> : null}
    </header>
  )
}
