import { Field } from '@/components/shared/ui'
import { DTR_MONTH_NAMES, DTR_RANGE_OPTIONS } from '@/lib/dtr'

export default function DtrSelectionView({
  allVisibleSelected,
  customEndDay,
  customStartDay,
  daysInMonth,
  downloadKind,
  dtrLoading,
  dtrMonth,
  dtrProgress,
  dtrRange,
  dtrYear,
  filteredEmployees,
  search,
  selectedIds,
  uniqueEmployees,
  onCancel,
  onClose,
  onGenerate,
  onSearchChange,
  onSelectAll,
  onSetCustomEndDay,
  onSetCustomStartDay,
  onSetDownloadKind,
  onSetDtrMonth,
  onSetDtrRange,
  onSetDtrYear,
  onToggleEmployee,
}) {
  return (
    <div className="flex max-h-[92dvh] flex-col sm:max-h-[90dvh]">
      <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            {downloadKind === 'raw' ? 'Generate Raw Attendance PDF' : 'Generate DTR'}
          </h3>
          <p className="text-xs text-muted">
            {downloadKind === 'raw' ? 'One page per employee with raw time in and time out' : 'CSC Form 48 — Select employees'}
          </p>
        </div>
        <button
          className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-stone-100 disabled:opacity-50"
          disabled={dtrLoading}
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>

      <div className="grid gap-3 border-b border-black/5 px-4 py-4 sm:grid-cols-4 sm:px-6">
        <Field label="Export Type">
          <select
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            disabled={dtrLoading}
            onChange={event => onSetDownloadKind(event.target.value)}
            value={downloadKind}
          >
            <option value="dtr">Official DTR PDF</option>
            <option value="raw">Raw Time In/Out PDF</option>
          </select>
        </Field>
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

      <div className="flex flex-col gap-3 border-b border-black/5 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
        <input
          className="flex-1 rounded-lg border border-black/10 bg-stone-50 px-3 py-2 text-sm outline-none transition focus:border-navy"
          disabled={dtrLoading}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Search employees..."
          value={search}
        />
        <button
          className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-navy hover:bg-navy/5 disabled:opacity-50"
          disabled={dtrLoading}
          onClick={onSelectAll}
          type="button"
        >
          {allVisibleSelected ? 'Deselect all' : 'Select all'}
        </button>
        <span className="whitespace-nowrap text-xs text-muted">
          {selectedIds.size} selected
        </span>
      </div>

      <div className="max-h-[34dvh] overflow-auto sm:max-h-[40vh]">
        {filteredEmployees.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted">
            {search ? 'No employees match your search.' : 'No employees available.'}
          </div>
        ) : (
          filteredEmployees.map(employee => (
            <label
              key={employee.employeeId}
              className="flex cursor-pointer items-center gap-3 border-b border-black/5 px-4 py-3 transition hover:bg-stone-50 sm:px-6"
            >
              <input
                checked={selectedIds.has(employee.employeeId)}
                className="h-4 w-4 rounded border-black/20 text-navy accent-navy"
                disabled={dtrLoading}
                onChange={() => onToggleEmployee(employee.employeeId)}
                type="checkbox"
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
                <span>{downloadKind === 'raw' ? 'Generating raw attendance PDF...' : 'Generating DTR...'}</span>
                <span>{dtrProgress.current}/{dtrProgress.total}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-navy transition-all duration-300"
                  style={{ width: `${dtrProgress.total ? (dtrProgress.current / dtrProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <button
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <span className="text-xs text-muted">
              {selectedIds.size} of {uniqueEmployees.length} employees
            </span>
            <button
              className="w-full rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-50 sm:w-auto sm:py-2.5"
              disabled={selectedIds.size === 0}
              onClick={onGenerate}
              type="button"
            >
              Generate & Download ({selectedIds.size})
            </button>
          </>
        )}
      </div>
    </div>
  )
}
