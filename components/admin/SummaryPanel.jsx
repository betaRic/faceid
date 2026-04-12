'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { useSummary, useOffices } from '@/lib/admin/hooks'
import { Field, Badge } from '@/components/shared/ui'

function LoadingPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
      <span className="text-sm text-muted">Loading...</span>
    </div>
  )
}

function SummaryPanelInner() {
  const {
    summaryDate, setSummaryDate,
    summaryOfficeFilter, setSummaryOfficeFilter,
    summaryEmployeeFilter, setSummaryEmployeeFilter,
    summaryRows, summaryLoading,
    summaryEmployeeOptions,
    handleExport, isPending,
  } = useSummary()
  const { visibleOffices } = useOffices()

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col gap-5 rounded-[2rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Summary</div>
          <h2 className="mt-1 font-display text-3xl font-bold text-ink">Daily Report</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Date">
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              onChange={(e) => setSummaryDate(e.target.value)}
              type="date"
              value={summaryDate}
            />
          </Field>
          <Field label="Office">
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              onChange={(e) => setSummaryOfficeFilter(e.target.value)}
              value={summaryOfficeFilter}
            >
              <option value="all">All offices</option>
              {visibleOffices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Employee">
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              disabled={summaryLoading}
              onChange={(e) => setSummaryEmployeeFilter(e.target.value)}
              value={summaryEmployeeFilter}
            >
              <option value="all">All employees</option>
              {summaryEmployeeOptions.map((p) => (
                <option key={p.employeeId} value={p.employeeId}>{p.name} ({p.employeeId})</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button
              className={`w-full rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-dark ${isPending('summary-export') ? 'opacity-50' : ''}`}
              disabled={isPending('summary-export')}
              onClick={handleExport}
              type="button"
            >
              {isPending('summary-export') ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-black/5">
        {summaryLoading ? (
          <LoadingPanel />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-stone-100 text-xs uppercase tracking-widest text-muted">
              <tr>
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Office</th>
                <th className="px-5 py-3">AM In</th>
                <th className="px-5 py-3">AM Out</th>
                <th className="px-5 py-3">PM In</th>
                <th className="px-5 py-3">PM Out</th>
                <th className="px-5 py-3">Late</th>
                <th className="px-5 py-3">Hours</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 bg-white">
              {summaryRows.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-muted" colSpan={9}>
                    No attendance records for this date.
                  </td>
                </tr>
              ) : (
                summaryRows.map((row) => (
                  <tr key={`${row.employeeId}-${row.dateKey}`} className="bg-white">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{row.name}</div>
                      <div className="text-xs uppercase tracking-wider text-muted">{row.employeeId}</div>
                    </td>
                    <td className="px-5 py-3 text-muted">{row.officeName}</td>
                    <td className="px-5 py-3">{row.amIn || '--'}</td>
                    <td className="px-5 py-3">{row.amOut || '--'}</td>
                    <td className="px-5 py-3">{row.pmIn || '--'}</td>
                    <td className="px-5 py-3">{row.pmOut || '--'}</td>
                    <td className="px-5 py-3">{row.lateMinutes ? `${row.lateMinutes}m` : '--'}</td>
                    <td className="px-5 py-3">{row.workingHours || '--'}</td>
                    <td className="px-5 py-3">
                      <Badge variant={row.status === 'Complete' ? 'success' : 'warning'}>
                        {row.status || '--'}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </motion.section>
  )
}

export const SummaryPanel = memo(SummaryPanelInner)
