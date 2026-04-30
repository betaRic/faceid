import { Field } from '@/components/shared/ui'

export default function SummaryFilters({
  isRawExportPending,
  summaryDate,
  summaryEmployeeFilter,
  summaryEmployeeOptions,
  summaryLoading,
  summaryOfficeFilter,
  summaryRows,
  visibleOffices,
  onExportRaw,
  onOpenDtr,
  onSetSummaryDate,
  onSetSummaryEmployeeFilter,
  onSetSummaryOfficeFilter,
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,2fr)] lg:items-end">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Summary</div>
        <h2 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">Daily Report</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Field label="Date">
          <input
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
            onChange={event => onSetSummaryDate(event.target.value)}
            type="date"
            value={summaryDate}
          />
        </Field>
        <Field label="Office">
          <select
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
            onChange={event => onSetSummaryOfficeFilter(event.target.value)}
            value={summaryOfficeFilter}
          >
            <option value="all">All offices</option>
            {visibleOffices.map(office => (
              <option key={office.id} value={office.id}>{office.name}</option>
            ))}
          </select>
        </Field>
        <Field className="col-span-2 xl:col-span-1" label="Employee">
          <select
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
            disabled={summaryLoading}
            onChange={event => onSetSummaryEmployeeFilter(event.target.value)}
            value={summaryEmployeeFilter}
          >
            <option value="all">All employees</option>
            {summaryEmployeeOptions.map(person => (
              <option key={person.employeeId} value={person.employeeId}>
                {person.name} ({person.employeeId})
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <button
            className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100 disabled:opacity-50"
            disabled={summaryRows.length === 0 || isRawExportPending}
            onClick={onExportRaw}
            type="button"
          >
            {isRawExportPending ? 'Downloading...' : 'Raw Download'}
          </button>
        </div>
        <div className="flex items-end">
          <button
            className="w-full rounded-xl border border-navy px-4 py-2 text-sm font-semibold text-navy transition hover:bg-navy/5 disabled:opacity-50"
            disabled={summaryRows.length === 0}
            onClick={onOpenDtr}
            type="button"
          >
            Generate DTR
          </button>
        </div>
      </div>
    </div>
  )
}
