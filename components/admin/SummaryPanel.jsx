'use client'

import { motion } from 'framer-motion'
import ActionButton from './ActionButton'
import Field from './Field'
import LoadingPanel from './LoadingPanel'
import { firebaseEnabled } from '../../lib/firebase/client'

export default function SummaryPanel({
  summaryDate,
  setSummaryDate,
  summaryOfficeFilter,
  setSummaryOfficeFilter,
  summaryEmployeeFilter,
  setSummaryEmployeeFilter,
  visibleOffices,
  summaryEmployeeOptions,
  summaryRows,
  summaryLoading,
  isPending,
  handleExportSummary,
}) {
  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:flex xl:h-full xl:min-h-0 xl:flex-col"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-dark">Summary</div>
          <h2 className="mt-2 font-display text-3xl text-ink">Daily attendance report</h2>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-4">
          <Field label="Summary date">
            <input
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              onChange={event => setSummaryDate(event.target.value)}
              type="date"
              value={summaryDate}
            />
          </Field>
          <Field label="Office filter">
            <select
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              onChange={event => setSummaryOfficeFilter(event.target.value)}
              value={summaryOfficeFilter}
            >
              <option value="all">All offices</option>
              {visibleOffices.map(office => (
                <option key={`summary-office-${office.id}`} value={office.id}>{office.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Employee filter">
            <select
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              disabled={summaryLoading}
              onChange={event => setSummaryEmployeeFilter(event.target.value)}
              value={summaryEmployeeFilter}
            >
              <option value="all">All employees</option>
              {summaryEmployeeOptions.map(person => (
                <option key={`summary-person-${person.employeeId}`} value={person.employeeId}>
                  {person.name} ({person.employeeId})
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <ActionButton
              busy={isPending('summary-export')}
              busyLabel="Exporting..."
              className="w-full bg-navy text-white hover:bg-navy-dark"
              label="Export CSV"
              onClick={handleExportSummary}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 xl:min-h-0 xl:flex-1">
        <div className="overflow-x-auto xl:min-h-0 xl:overflow-auto">
          {!firebaseEnabled ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Attendance summary requires Firebase-backed server records. Client-derived summary fallback has been disabled.
            </div>
          ) : null}

          {summaryLoading ? (
            <LoadingPanel
              body="Loading daily attendance records and summary metrics."
              title="Loading summary"
            />
          ) : (
            <table className="min-w-[980px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-5 py-4">Employee</th>
                  <th className="px-5 py-4">Office</th>
                  <th className="px-5 py-4">AM In</th>
                  <th className="px-5 py-4">AM Out</th>
                  <th className="px-5 py-4">PM In</th>
                  <th className="px-5 py-4">PM Out</th>
                  <th className="px-5 py-4">Late</th>
                  <th className="px-5 py-4">Undertime</th>
                  <th className="px-5 py-4">Working Hours</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {summaryRows.length === 0 ? (
                  <tr>
                    <td className="px-5 py-10 text-center text-sm text-muted" colSpan={10}>
                      {firebaseEnabled
                        ? 'No attendance summary rows for the selected date yet.'
                        : 'Attendance summary is unavailable without Firebase.'}
                    </td>
                  </tr>
                ) : (
                  summaryRows.map(row => (
                    <tr key={`${row.employeeId}-${row.dateKey}`} className="bg-white">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-ink">{row.name}</div>
                        <div className="text-xs uppercase tracking-[0.12em] text-muted">{row.employeeId}</div>
                      </td>
                      <td className="px-5 py-4 text-muted">{row.officeName}</td>
                      <td className="px-5 py-4">{row.amIn}</td>
                      <td className="px-5 py-4">{row.amOut}</td>
                      <td className="px-5 py-4">{row.pmIn}</td>
                      <td className="px-5 py-4">{row.pmOut}</td>
                      <td className="px-5 py-4">{row.lateMinutes} min</td>
                      <td className="px-5 py-4">{row.undertimeMinutes} min</td>
                      <td className="px-5 py-4">{row.workingHours}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${row.status === 'Complete' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </motion.section>
  )
}






