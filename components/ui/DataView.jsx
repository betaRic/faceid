import { Button } from './Button'
import { cx } from './cx'

export function FilterBar({ search, children, actions, className = '' }) {
  return (
    <div className={cx('flex flex-col gap-3 rounded-surface border border-line bg-surface p-3 lg:flex-row lg:items-end', className)} data-testid="filter-bar">
      {search ? <div className="min-w-0 flex-1">{search}</div> : null}
      {children ? <div className="grid min-w-0 flex-[2] gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">{children}</div> : null}
      {actions ? <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div> : null}
    </div>
  )
}

export function TableFrame({ children, className = '' }) {
  return (
    <div className={cx('w-full overflow-x-auto rounded-surface border border-line bg-surface', className)}>
      {children}
    </div>
  )
}

export function ResponsiveRecordList({ records = [], renderActions, className = '' }) {
  return (
    <div className={cx('grid gap-3', className)}>
      {records.map((record) => (
        <article className="rounded-surface border border-line bg-surface p-4" key={record.id}>
          <dl className="grid gap-3">
            {(record.fields || []).map((field) => (
              <div className="grid grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.2fr)] gap-3" key={field.label}>
                <dt className="text-xs font-medium text-secondary">{field.label}</dt>
                <dd className="min-w-0 text-sm text-foreground">{field.value ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {renderActions ? <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">{renderActions(record)}</div> : null}
        </article>
      ))}
    </div>
  )
}

export function Pagination({ current = 1, total = 1, onPrevious, onNext, className = '' }) {
  return (
    <nav aria-label="Pagination" className={cx('flex flex-wrap items-center justify-between gap-3', className)}>
      <span className="text-sm text-secondary">Page {current} of {total}</span>
      <div className="flex gap-2">
        <Button disabled={current <= 1 || !onPrevious} onClick={onPrevious} variant="secondary">Previous</Button>
        <Button disabled={current >= total || !onNext} onClick={onNext} variant="secondary">Next</Button>
      </div>
    </nav>
  )
}
