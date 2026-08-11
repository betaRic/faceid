import { Field } from '@/components/shared/ui'

export default function SummaryFilters({
  summaryDate,
  summaryEmployeeFilter,
  summaryEmployeeOptions,
  summaryLoading,
  summaryQuery,
  summaryOfficeFilter,
  summaryDivisionFilter = 'all',
  summaryDivisionOptions = [],
  summaryRows,
  showDivisionFilter = false,
  visibleOffices,
  onOpenDtr,
  onSetSummaryDate,
  onSetSummaryEmployeeFilter,
  onSetSummaryQuery,
  onSetSummaryOfficeFilter,
  onSetSummaryDivisionFilter = () => {},
}) {
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
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
        <Field label="Employee">
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
        {showDivisionFilter ? (
          <Field label="Division">
            <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={event => onSetSummaryDivisionFilter(event.target.value)} value={summaryDivisionFilter}>
              <option value="all">All divisions</option>
              {summaryDivisionOptions.map(division => <option key={division.id} value={division.id}>{division.name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Search">
          <input
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
            onChange={event => onSetSummaryQuery(event.target.value)}
            placeholder="Name, ID, office"
            type="search"
            value={summaryQuery}
          />
        </Field>
        <div className="flex items-end">
          <button
            className="min-h-[38px] whitespace-nowrap rounded-xl border border-navy px-4 py-2 text-sm font-semibold text-navy transition hover:bg-navy/5 disabled:opacity-50"
            disabled={summaryLoading}
            onClick={onOpenDtr}
            type="button"
          >
            Generate DTR
          </button>
        </div>
    </div>
  )
}
