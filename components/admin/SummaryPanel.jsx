'use client'

import { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSummary, useOffices } from '@/lib/admin/hooks'
import { Field, Badge } from '@/components/shared/ui'
import { MassDtrRenderer } from '@/components/hr/Form48Dtr'
import { MassRawAttendanceRenderer } from '@/components/hr/RawAttendancePdf'
import { downloadDtrPdf } from '@/lib/dtr-pdf'
import { DTR_MONTH_NAMES, DTR_RANGE_OPTIONS, formatDtrRangeForFilename, getDaysInMonth } from '@/lib/dtr'
import AttendanceOverrideModal from './AttendanceOverrideModal'

function SummaryPanelInner() {
  const {
    summaryDate, setSummaryDate,
    summaryOfficeFilter, setSummaryOfficeFilter,
    summaryEmployeeFilter, setSummaryEmployeeFilter,
    summaryRows, summaryLoading,
    summaryEmployeeOptions,
    handleRawExport, isPending,
  } = useSummary()
  const { visibleOffices } = useOffices()

  const [overrideRow, setOverrideRow] = useState(null)

  // DTR modal state
  const [showDtr, setShowDtr] = useState(false)

  function handleOverrideSaved() {
    setSummaryDate(summaryDate)
  }

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col gap-5 rounded-[2rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      {/* Filters row */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Summary</div>
          <h2 className="mt-1 font-display text-3xl font-bold text-ink">Daily Report</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Date">
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              onChange={e => setSummaryDate(e.target.value)}
              type="date"
              value={summaryDate}
            />
          </Field>
          <Field label="Office">
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              onChange={e => setSummaryOfficeFilter(e.target.value)}
              value={summaryOfficeFilter}
            >
              <option value="all">All offices</option>
              {visibleOffices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Employee">
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              disabled={summaryLoading}
              onChange={e => setSummaryEmployeeFilter(e.target.value)}
              value={summaryEmployeeFilter}
            >
              <option value="all">All employees</option>
              {summaryEmployeeOptions.map(p => (
                <option key={p.employeeId} value={p.employeeId}>{p.name} ({p.employeeId})</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button
              className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100 disabled:opacity-50"
              disabled={summaryRows.length === 0 || isPending('summary-raw-export')}
              onClick={handleRawExport}
              type="button"
            >
              {isPending('summary-raw-export') ? 'Downloading...' : 'Raw Download'}
            </button>
          </div>
          <div className="flex items-end">
            <button
              className="w-full rounded-xl border border-navy px-4 py-2 text-sm font-semibold text-navy transition hover:bg-navy/5 disabled:opacity-50"
              disabled={summaryRows.length === 0}
              onClick={() => setShowDtr(true)}
              type="button"
            >
              Generate DTR
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-black/5">
        {summaryLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
            <span className="text-sm text-muted">Loading...</span>
          </div>
        ) : (
          <>
            <div className="divide-y divide-black/5 bg-white md:hidden">
              {summaryRows.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted">
                  No attendance records for this date.
                </div>
              ) : (
                summaryRows.map(row => (
                  <div key={`${row.employeeId}-${row.dateKey}`} className="grid gap-3 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-ink">{row.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-wider text-muted">{row.employeeId}</div>
                      </div>
                      <Badge variant={row.status === 'Complete' ? 'success' : 'warning'}>
                        {row.status || '--'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-stone-50 px-3 py-2"><span className="block text-[11px] uppercase tracking-widest text-muted">AM In</span>{row.amIn || '--'}</div>
                      <div className="rounded-xl bg-stone-50 px-3 py-2"><span className="block text-[11px] uppercase tracking-widest text-muted">AM Out</span>{row.amOut || '--'}</div>
                      <div className="rounded-xl bg-stone-50 px-3 py-2"><span className="block text-[11px] uppercase tracking-widest text-muted">PM In</span>{row.pmIn || '--'}</div>
                      <div className="rounded-xl bg-stone-50 px-3 py-2"><span className="block text-[11px] uppercase tracking-widest text-muted">PM Out</span>{row.pmOut || '--'}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted">
                      <span>{row.officeName}</span>
                      <span>{`Late: ${row.lateMinutes ? `${row.lateMinutes}m` : '--'}`}</span>
                      <span>{`Hours: ${row.workingHours || '--'}`}</span>
                    </div>
                    <button
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                      onClick={() => setOverrideRow(row)}
                      type="button"
                    >
                      Edit attendance
                    </button>
                  </div>
                ))
              )}
            </div>

            <table className="hidden w-full text-left text-sm md:table">
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
                <th className="px-5 py-3">Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 bg-white">
              {summaryRows.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-muted" colSpan={10}>
                    No attendance records for this date.
                  </td>
                </tr>
              ) : (
                summaryRows.map(row => (
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
                    <td className="px-5 py-3">
                      <button
                        className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                        onClick={() => setOverrideRow(row)}
                        type="button"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </>
        )}
      </div>

      {/* Override modal */}
      {overrideRow && (
        <AttendanceOverrideModal
          row={overrideRow}
          onClose={() => setOverrideRow(null)}
          onSaved={handleOverrideSaved}
        />
      )}

      {/* DTR Modal */}
      <AnimatePresence>
        {showDtr && (
          <DtrModal
            summaryRows={summaryRows}
            onClose={() => setShowDtr(false)}
          />
        )}
      </AnimatePresence>
    </motion.section>
  )
}

/**
 * DTR Modal — handles employee selection, generation, and printing.
 * Designed for 1000+ employees: searchable list with checkboxes,
 * batch generation with progress, auto-print on complete.
 */
function DtrModal({ summaryRows, onClose }) {
  const [dtrMonth, setDtrMonth] = useState(new Date().getMonth() + 1)
  const [dtrYear, setDtrYear] = useState(new Date().getFullYear())
  const [dtrRange, setDtrRange] = useState('full')
  const [customStartDay, setCustomStartDay] = useState(1)
  const [customEndDay, setCustomEndDay] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate())
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [dtrLoading, setDtrLoading] = useState(false)
  const [dtrProgress, setDtrProgress] = useState({ current: 0, total: 0 })
  const [dtrEmployees, setDtrEmployees] = useState([])
  const [downloadKind, setDownloadKind] = useState('dtr')
  const abortRef = useRef(false)
  const daysInMonth = getDaysInMonth(dtrYear, dtrMonth)

  useEffect(() => {
    setCustomStartDay(prev => Math.min(prev, daysInMonth))
    setCustomEndDay(prev => Math.min(Math.max(prev, 1), daysInMonth))
  }, [daysInMonth])

  useEffect(() => {
    if (customStartDay > customEndDay) {
      setCustomEndDay(customStartDay)
    }
  }, [customStartDay, customEndDay])

  // Deduplicated employee list from summary rows
  const uniqueEmployees = useMemo(() => {
    return [...new Map(summaryRows.map(r => [r.employeeId, r])).values()]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [summaryRows])

  // Filtered by search
  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return uniqueEmployees
    const q = search.toLowerCase()
    return uniqueEmployees.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.employeeId || '').toLowerCase().includes(q) ||
      (e.officeName || '').toLowerCase().includes(q)
    )
  }, [uniqueEmployees, search])

  // Select all visible
  const handleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allVisible = filteredEmployees.map(e => e.employeeId)
      const allSelected = allVisible.every(id => next.has(id))
      if (allSelected) {
        allVisible.forEach(id => next.delete(id))
      } else {
        allVisible.forEach(id => next.add(id))
      }
      return next
    })
  }, [filteredEmployees])

  const toggleEmployee = useCallback((employeeId) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(employeeId)) next.delete(employeeId)
      else next.add(employeeId)
      return next
    })
  }, [])

  const allVisibleSelected = filteredEmployees.length > 0 &&
    filteredEmployees.every(e => selectedIds.has(e.employeeId))

  const handleGenerate = useCallback(async () => {
    const selected = uniqueEmployees.filter(e => selectedIds.has(e.employeeId))
    if (selected.length === 0) return

    setDtrLoading(true)
    setDtrEmployees([])
    setDtrProgress({ current: 0, total: selected.length })
    abortRef.current = false

    try {
      // Fetch employee doc IDs
      const empRes = await fetch('/api/hr/dtr/employees', { credentials: 'include' })
      const empData = await empRes.json()
      if (!empData.ok) { setDtrLoading(false); return }

      const employeeMap = new Map(empData.employees.map(e => [e.employeeId, e]))
      const results = []

      for (let i = 0; i < selected.length; i++) {
        if (abortRef.current) break

        const emp = selected[i]
        const personDoc = employeeMap.get(emp.employeeId)
        if (!personDoc) {
          setDtrProgress({ current: i + 1, total: selected.length })
          continue
        }

        const params = new URLSearchParams({
          employeeId: personDoc.id,
          month: String(dtrMonth),
          year: String(dtrYear),
          range: dtrRange,
        })
        if (dtrRange === 'custom') {
          params.set('customStartDay', String(customStartDay))
          params.set('customEndDay', String(customEndDay))
        }

        const res = await fetch(`/api/hr/dtr?${params}`, { credentials: 'include' })
        const data = await res.json()
        if (data.ok && data.dtr) {
          results.push(data.dtr)
        }
        setDtrProgress({ current: i + 1, total: selected.length })
      }

      setDtrEmployees(results)
      // Auto-download PDF after DOM render
      if (results.length > 0) {
        setTimeout(async () => {
          const suffix = formatDtrRangeForFilename(results[0]?.rangeSpec)
          if (downloadKind === 'raw') {
            const name = `RAW_ATTENDANCE_${DTR_MONTH_NAMES[dtrMonth - 1]}_${dtrYear}_${suffix}_${results.length}employees`
            await downloadDtrPdf(name, '.form48-container', { orientation: 'portrait' })
          } else {
            const name = `DTR_${DTR_MONTH_NAMES[dtrMonth - 1]}_${dtrYear}_${suffix}_${results.length}employees`
            await downloadDtrPdf(name)
          }
        }, 600)
      }
    } catch (err) {
      console.error('DTR generation failed:', err)
    }
    setDtrLoading(false)
  }, [uniqueEmployees, selectedIds, dtrMonth, dtrYear, dtrRange, customStartDay, customEndDay, downloadKind])

  const [pdfDownloading, setPdfDownloading] = useState(false)

  const handleDownloadAgain = useCallback(async () => {
    setPdfDownloading(true)
    const suffix = formatDtrRangeForFilename(dtrEmployees[0]?.rangeSpec)
    if (downloadKind === 'raw') {
      const name = `RAW_ATTENDANCE_${DTR_MONTH_NAMES[dtrMonth - 1]}_${dtrYear}_${suffix}_${dtrEmployees.length}employees`
      await downloadDtrPdf(name, '.form48-container', { orientation: 'portrait' })
    } else {
      const name = `DTR_${DTR_MONTH_NAMES[dtrMonth - 1]}_${dtrYear}_${suffix}_${dtrEmployees.length}employees`
      await downloadDtrPdf(name)
    }
    setPdfDownloading(false)
  }, [dtrMonth, dtrYear, dtrEmployees, downloadKind])

  const handleCancel = useCallback(() => {
    abortRef.current = true
  }, [])

  // Phase: 'select' (picking employees) or 'preview' (showing generated DTRs)
  const phase = dtrEmployees.length > 0 ? 'preview' : 'select'
  const totalRawRows = dtrEmployees.reduce((sum, dtr) => {
    const rows = (dtr?.rows || []).filter(row => row.inMonth && row.isActive)
    return sum + rows.length
  }, 0)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 p-4 print:bg-white print:p-0"
      onClick={e => { if (e.target === e.currentTarget && !dtrLoading) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        className="w-full max-w-2xl rounded-2xl bg-white shadow-xl print:max-w-none print:rounded-none print:shadow-none"
      >
        {phase === 'select' ? (
          <div className="flex flex-col">
            {/* Header */}
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
                onClick={onClose}
                disabled={dtrLoading}
                className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-stone-100 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            {/* Options */}
            <div className="grid gap-3 border-b border-black/5 px-6 py-4 sm:grid-cols-4">
              <Field label="Export Type">
                <select
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  value={downloadKind}
                  onChange={e => setDownloadKind(e.target.value)}
                  disabled={dtrLoading}
                >
                  <option value="dtr">Official DTR PDF</option>
                  <option value="raw">Raw Time In/Out PDF</option>
                </select>
              </Field>
              <Field label="Month">
                <select
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  value={dtrMonth}
                  onChange={e => setDtrMonth(parseInt(e.target.value))}
                  disabled={dtrLoading}
                >
                  {DTR_MONTH_NAMES.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Year">
                <select
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  value={dtrYear}
                  onChange={e => setDtrYear(parseInt(e.target.value))}
                  disabled={dtrLoading}
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </Field>
              <Field label="Range">
                <select
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  value={dtrRange}
                  onChange={e => setDtrRange(e.target.value)}
                  disabled={dtrLoading}
                >
                  {DTR_RANGE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            {dtrRange === 'custom' ? (
              <div className="grid gap-3 border-b border-black/5 px-6 py-4 sm:grid-cols-2">
                <Field label="Start Day">
                  <select
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    value={customStartDay}
                    onChange={e => setCustomStartDay(parseInt(e.target.value, 10))}
                    disabled={dtrLoading}
                  >
                    {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </Field>
                <Field label="End Day">
                  <select
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    value={customEndDay}
                    onChange={e => setCustomEndDay(parseInt(e.target.value, 10))}
                    disabled={dtrLoading}
                  >
                    {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}

            {/* Search + select all */}
            <div className="flex items-center gap-3 border-b border-black/5 px-6 py-3">
              <input
                className="flex-1 rounded-lg border border-black/10 bg-stone-50 px-3 py-2 text-sm outline-none transition focus:border-navy"
                placeholder="Search employees..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                disabled={dtrLoading}
              />
              <button
                onClick={handleSelectAll}
                disabled={dtrLoading}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-navy hover:bg-navy/5 disabled:opacity-50"
              >
                {allVisibleSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="whitespace-nowrap text-xs text-muted">
                {selectedIds.size} selected
              </span>
            </div>

            {/* Employee list */}
            <div className="max-h-[40vh] overflow-auto">
              {filteredEmployees.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted">
                  {search ? 'No employees match your search.' : 'No employees available.'}
                </div>
              ) : (
                filteredEmployees.map(emp => (
                  <label
                    key={emp.employeeId}
                    className="flex cursor-pointer items-center gap-3 border-b border-black/5 px-6 py-2.5 transition hover:bg-stone-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(emp.employeeId)}
                      onChange={() => toggleEmployee(emp.employeeId)}
                      disabled={dtrLoading}
                      className="h-4 w-4 rounded border-black/20 text-navy accent-navy"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{emp.name}</div>
                      <div className="text-xs text-muted">{emp.employeeId} — {emp.officeName}</div>
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Footer / Generate button */}
            <div className="flex items-center justify-between border-t border-black/5 px-6 py-4">
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
                    onClick={handleCancel}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
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
                    onClick={handleGenerate}
                    disabled={selectedIds.size === 0}
                    className="rounded-xl bg-navy px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-50"
                  >
                    Generate & Download ({selectedIds.size})
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          /* Preview phase — show generated DTRs with print/re-print */
          <div className="print:contents">
            <div className="flex items-center justify-between border-b border-black/5 px-6 py-4 print:hidden">
              <div>
                <h3 className="font-display text-lg font-bold text-ink">
                  {downloadKind === 'raw' ? 'Raw Attendance PDF Generated' : 'DTR Generated'}
                </h3>
                <p className="text-xs text-muted">{dtrEmployees.length} employee(s) — {DTR_MONTH_NAMES[dtrMonth - 1]} {dtrYear}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadAgain}
                  disabled={pdfDownloading}
                  className="rounded-xl border border-navy px-4 py-2 text-sm font-semibold text-navy transition hover:bg-navy/5 disabled:opacity-50"
                >
                  {pdfDownloading ? 'Downloading...' : 'Download Again'}
                </button>
                <button
                  onClick={() => { setDtrEmployees([]); setSelectedIds(new Set()) }}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-stone-100"
                >
                  Back
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-stone-100"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto print:max-h-none print:overflow-visible">
              {downloadKind === 'raw' ? (
                <div className="p-6 print:hidden">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-black/5 bg-stone-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Employees</div>
                      <div className="mt-2 text-3xl font-bold text-ink">{dtrEmployees.length}</div>
                    </div>
                    <div className="rounded-2xl border border-black/5 bg-stone-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Covered Days</div>
                      <div className="mt-2 text-3xl font-bold text-ink">{totalRawRows}</div>
                    </div>
                    <div className="rounded-2xl border border-black/5 bg-stone-50 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Document Type</div>
                      <div className="mt-2 text-lg font-bold text-ink">Raw Time In/Out</div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-black/5 bg-white">
                    <div className="border-b border-black/5 px-5 py-4">
                      <h4 className="text-sm font-semibold text-ink">Included Employees</h4>
                      <p className="mt-1 text-xs text-muted">
                        The PDF is ready. This preview keeps the modal readable and shows who is included instead of rendering the full raw sheet.
                      </p>
                    </div>
                    <div className="divide-y divide-black/5">
                      {dtrEmployees.map((dtr, index) => {
                        const rows = (dtr?.rows || []).filter(row => row.inMonth && row.isActive)
                        const withLogs = rows.filter(row => row.amIn || row.amOut || row.pmIn || row.pmOut).length
                        return (
                          <div key={`${dtr.employee?.employeeId || 'employee'}-${index}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] sm:items-center">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-ink">{dtr.employee?.name || 'Unknown employee'}</div>
                              <div className="mt-1 text-xs text-muted">
                                {(dtr.employee?.employeeId || '--')} • {(dtr.employee?.office || 'Unassigned')}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Period</div>
                              <div className="mt-1 text-sm text-ink">{dtr.period?.periodLabel || '--'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Rows</div>
                              <div className="mt-1 text-sm text-ink">{rows.length}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">With Logs</div>
                              <div className="mt-1 text-sm text-ink">{withLogs}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <MassDtrRenderer employees={dtrEmployees} />
              )}
            </div>
            <div aria-hidden="true" className="fixed left-[-200vw] top-0">
              {downloadKind === 'raw'
                ? <MassRawAttendanceRenderer employees={dtrEmployees} />
                : <MassDtrRenderer employees={dtrEmployees} />}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

export const SummaryPanel = memo(SummaryPanelInner)
