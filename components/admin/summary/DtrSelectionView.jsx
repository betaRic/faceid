import { Button, Checkbox, EmptyState, Field, Input, LoadingState, Status } from '@/components/ui'
import { DTR_MONTH_NAMES, DTR_RANGE_OPTIONS } from '@/lib/dtr'

export default function DtrSelectionView({
  allVisibleSelected,
  customEndDay,
  customStartDay,
  divisionId = 'all',
  divisions = [],
  daysInMonth,
  dtrLoading,
  employeesLoading = false,
  dtrMonth,
  dtrProgress,
  dtrRange,
  dtrYear,
  error = '',
  filteredEmployees,
  search,
  selectedIds,
  signatoryName = '',
  signatoryPosition = '',
  uniqueEmployees,
  onCancel,
  onClose,
  onGenerate,
  onSearchChange,
  onSelectAll,
  onSetCustomEndDay,
  onSetCustomStartDay,
  onSetDivisionId = () => {},
  onSetDtrMonth,
  onSetDtrRange,
  onSetDtrYear,
  onSetSignatoryName = () => {},
  onSetSignatoryPosition = () => {},
  onToggleEmployee,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Generate DTR
          </h3>
          <p className="mt-1 text-xs text-secondary">
            Select the period, authorized personnel, and Excel output details.
          </p>
        </div>
        <Button
          disabled={dtrLoading || employeesLoading}
          onClick={onClose}
          variant="quiet"
        >
          Close
        </Button>
      </div>

      <div className="grid gap-3 border-b border-black/5 px-4 py-4 sm:grid-cols-3 sm:px-6">
        <Field label="Month">
          <select
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            disabled={dtrLoading}
            onChange={event => onSetDtrMonth(parseInt(event.target.value, 10))}
            value={dtrMonth}
          >
            {DTR_MONTH_NAMES.map((month, index) => (
              <option key={month} value={index + 1}>{month}</option>
            ))}
          </select>
        </Field>
        <Field label="Year">
          <select
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            disabled={dtrLoading}
            onChange={event => onSetDtrYear(parseInt(event.target.value, 10))}
            value={dtrYear}
          >
            {[2024, 2025, 2026, 2027].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </Field>
        <Field label="Range">
          <select
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            disabled={dtrLoading}
            onChange={event => onSetDtrRange(event.target.value)}
            value={dtrRange}
          >
            {DTR_RANGE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Division">
          <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" disabled={dtrLoading} onChange={event => onSetDivisionId(event.target.value)} value={divisionId}>
            <option value="all">All divisions</option>
            {divisions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-3 border-b border-black/5 px-4 py-3 sm:grid-cols-2 sm:px-6">
        <Field label="Override signatory name (optional)">
          <input
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            disabled={dtrLoading}
            onChange={event => onSetSignatoryName(event.target.value)}
            placeholder="Leave blank to use the office head"
            type="text"
            value={signatoryName}
          />
        </Field>
        <Field label="Override signatory position (optional)">
          <input
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            disabled={dtrLoading}
            onChange={event => onSetSignatoryPosition(event.target.value)}
            placeholder="e.g. OIC-City Director"
            type="text"
            value={signatoryPosition}
          />
        </Field>
      </div>

      {dtrRange === 'custom' ? (
        <div className="grid gap-3 border-b border-black/5 px-4 py-4 sm:grid-cols-2 sm:px-6">
          <Field label="Start Day">
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
              disabled={dtrLoading}
              onChange={event => onSetCustomStartDay(parseInt(event.target.value, 10))}
              value={customStartDay}
            >
              {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </Field>
          <Field label="End Day">
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
              disabled={dtrLoading}
              onChange={event => onSetCustomEndDay(parseInt(event.target.value, 10))}
              value={customEndDay}
            >
              {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-end sm:px-6">
        <Field className="min-w-0 flex-1" label="Search employees">
          <Input disabled={dtrLoading} onChange={event => onSearchChange(event.target.value)} placeholder="Name, Employee ID, or office" value={search} />
        </Field>
        <Button
          disabled={dtrLoading || employeesLoading}
          onClick={onSelectAll}
          variant="secondary"
        >
          {allVisibleSelected ? 'Deselect all' : 'Select all'}
        </Button>
        <Status>{selectedIds.size} selected</Status>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {employeesLoading ? (
          <LoadingState className="px-6 py-8" label="Loading personnel authorized for DTR generation…" />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState className="m-4" description={search ? 'Try a different name, Employee ID, or office.' : 'No personnel are available in this scope.'} title={search ? 'No matching personnel' : 'No personnel available'} />
        ) : (
          filteredEmployees.map(employee => (
            <label
              key={employee.id}
              className="flex cursor-pointer items-center gap-3 border-b border-black/5 px-4 py-3 transition hover:bg-stone-50 sm:px-6"
            >
              <Checkbox
                checked={selectedIds.has(employee.id)}
                disabled={dtrLoading}
                onChange={() => onToggleEmployee(employee.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{employee.name}</div>
                <div className="text-xs text-muted">{employee.employeeId} — {employee.officeName}</div>
              </div>
            </label>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-black/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        {dtrLoading ? (
          <div className="flex flex-1 items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-navy border-t-transparent" />
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>Generating DTR Excel...</span>
                <span>{dtrProgress.current}/{dtrProgress.total}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-navy transition-all duration-300"
                  style={{ width: `${dtrProgress.total ? (dtrProgress.current / dtrProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <Button
              onClick={onCancel}
              variant="quiet"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <span className="text-xs text-muted">
              {error || `${selectedIds.size} of ${uniqueEmployees.length} employees`}
            </span>
            <Button
              className="w-full sm:w-auto"
              disabled={selectedIds.size === 0 || employeesLoading}
              onClick={onGenerate}
            >
              Download Excel ({selectedIds.size})
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
