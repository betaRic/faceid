'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Form48Renderer } from '@/components/hr/Form48Dtr'
import {
  buildDtrDocument,
  buildDtrRangeSpec,
  DTR_MONTH_NAMES,
  DTR_RANGE_OPTIONS,
  filterAttendanceDaysByRange,
  formatDtrRangeForFilename,
  getDaysInMonth,
} from '@/lib/dtr'
import { downloadDtrPdf } from '@/lib/dtr-pdf'

const ChevronLeftIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

function buildYearOptions(currentYear) {
  const anchorYear = new Date().getFullYear()
  const values = new Set()
  for (let year = anchorYear - 3; year <= anchorYear + 3; year += 1) {
    values.add(year)
  }
  values.add(currentYear)
  return [...values].sort((left, right) => left - right)
}

function formatUndertime(minutes) {
  if (!minutes || minutes === 0) return '--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

function DayCard({ day }) {
  const hasData = day.amIn !== '--' || day.pmIn !== '--'

  return (
    <div className={`rounded-xl border p-3 ${hasData ? 'border-black/5 bg-white' : 'border-black/5 bg-stone-50/50'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-ink">{day.date}</span>
        {day.undertime > 0 ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            {formatUndertime(day.undertime)}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <span className="text-muted">AM In: </span>
          <span className="font-mono font-medium text-ink">{day.amIn}</span>
        </div>
        <div>
          <span className="text-muted">AM Out: </span>
          <span className="font-mono font-medium text-ink">{day.amOut}</span>
        </div>
        <div>
          <span className="text-muted">PM In: </span>
          <span className="font-mono font-medium text-ink">{day.pmIn}</span>
        </div>
        <div>
          <span className="text-muted">PM Out: </span>
          <span className="font-mono font-medium text-ink">{day.pmOut}</span>
        </div>
      </div>
    </div>
  )
}

function FilterField({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</span>
      {children}
    </label>
  )
}

export default function AttendanceTableView({ currentMatch, onBack }) {
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1)
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear())
  const [selectedRange, setSelectedRange] = useState('full')
  const [customStartDay, setCustomStartDay] = useState(1)
  const [customEndDay, setCustomEndDay] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate())
  const [downloading, setDownloading] = useState(false)
  const [downloadRequest, setDownloadRequest] = useState(null)
  const hiddenRenderRef = useRef(null)

  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const yearOptions = buildYearOptions(currentYear)
  const rangeSpec = buildDtrRangeSpec({
    month: currentMonth,
    year: currentYear,
    range: selectedRange,
    customStartDay,
    customEndDay,
  })
  const visibleDays = filterAttendanceDaysByRange(days, rangeSpec)
  const totalDays = visibleDays.length
  const totalUndertime = visibleDays.reduce((sum, day) => sum + (day.undertime || 0), 0)

  useEffect(() => {
    setCustomStartDay((previous) => Math.min(previous, daysInMonth))
    setCustomEndDay((previous) => Math.min(Math.max(previous, 1), daysInMonth))
  }, [daysInMonth])

  useEffect(() => {
    if (customStartDay > customEndDay) {
      setCustomEndDay(customStartDay)
    }
  }, [customStartDay, customEndDay])

  useEffect(() => {
    if (!currentMatch?.employeeId) {
      setLoading(false)
      return
    }

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(
          `/api/attendance/table?employeeId=${encodeURIComponent(currentMatch.employeeId)}&month=${currentMonth}&year=${currentYear}`,
        )
        const data = await res.json()
        if (data.ok) {
          setDays(data.days || [])
        } else {
          setError(
            res.status === 401 || res.status === 403
              ? 'Attendance session expired. Scan again at the kiosk.'
              : (data.message || 'Failed to load attendance'),
          )
        }
      } catch {
        setError('Failed to load attendance')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [currentMatch?.employeeId, currentMonth, currentYear])

  useEffect(() => {
    if (!downloadRequest || !hiddenRenderRef.current) return

    let cancelled = false

    async function runDownload() {
      try {
        setDownloading(true)
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        })

        const target = hiddenRenderRef.current.querySelector('.form48-container')
        if (!target) {
          throw new Error('DTR render target not ready')
        }

        await downloadDtrPdf(downloadRequest.filename, target)
      } catch (downloadError) {
        console.error('DTR download failed:', downloadError)
        if (!cancelled) {
          setError('Failed to generate DTR')
        }
      } finally {
        if (!cancelled) {
          setDownloading(false)
          setDownloadRequest(null)
        }
      }
    }

    runDownload()

    return () => {
      cancelled = true
    }
  }, [downloadRequest])

  const handleGenerateDtr = useCallback(() => {
    const dtr = buildDtrDocument({
      employee: {
        name: currentMatch.name || '',
        employeeId: currentMatch.employeeId || '',
        office: currentMatch.officeName || '',
        position: currentMatch.position || '',
      },
      month: currentMonth,
      year: currentYear,
      range: selectedRange,
      customStartDay,
      customEndDay,
      dayRecords: days,
    })

    const filenameRange = formatDtrRangeForFilename(dtr.rangeSpec)
    const filename = `DTR_${currentMatch.employeeId}_${DTR_MONTH_NAMES[currentMonth - 1]}_${currentYear}_${filenameRange}`

    setError(null)
    setDownloadRequest({ dtr, filename })
  }, [currentMatch, currentMonth, currentYear, selectedRange, customStartDay, customEndDay, days])

  return (
    <div className="absolute inset-0 z-[6] flex flex-col overflow-hidden bg-white">
      <AnimatePresence mode="wait">
        <motion.div
          key="table-view"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          className="flex h-full flex-col"
        >
          <div className="shrink-0 border-b border-black/10 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={onBack}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted hover:bg-black/5 sm:text-sm"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                <span className="hidden xs:inline">Back</span>
              </button>

              <div className="min-w-0 flex-1 text-center">
                <h2 className="truncate text-sm font-semibold text-ink sm:text-lg">{currentMatch.name}</h2>
                <p className="text-[10px] text-muted sm:text-xs">{currentMatch.employeeId}</p>
              </div>

              <button
                onClick={handleGenerateDtr}
                disabled={loading || downloading}
                className="rounded-lg bg-navy px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-navy-dark disabled:opacity-50 sm:px-3 sm:py-2 sm:text-xs"
              >
                {downloading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-white border-t-transparent" />
                    <span className="hidden sm:inline">Downloading...</span>
                    <span className="sm:hidden">...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    <span className="hidden sm:inline">Generate DTR</span>
                    <span className="sm:hidden">DTR</span>
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="shrink-0 border-b border-black/5 bg-stone-50 px-3 py-3 sm:px-4">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <FilterField label="Month">
                <select
                  value={currentMonth}
                  onChange={(event) => setCurrentMonth(Number.parseInt(event.target.value, 10))}
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                >
                  {DTR_MONTH_NAMES.map((monthName, index) => (
                    <option key={monthName} value={index + 1}>{monthName}</option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="Year">
                <select
                  value={currentYear}
                  onChange={(event) => setCurrentYear(Number.parseInt(event.target.value, 10))}
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="Date Range">
                <select
                  value={selectedRange}
                  onChange={(event) => setSelectedRange(event.target.value)}
                  className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                >
                  {DTR_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FilterField>

              {selectedRange === 'custom' ? (
                <>
                  <FilterField label="Start Day">
                    <select
                      value={customStartDay}
                      onChange={(event) => setCustomStartDay(Number.parseInt(event.target.value, 10))}
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                    >
                      {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </FilterField>

                  <FilterField label="End Day">
                    <select
                      value={customEndDay}
                      onChange={(event) => setCustomEndDay(Number.parseInt(event.target.value, 10))}
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                    >
                      {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </FilterField>
                </>
              ) : (
                <div className="flex items-end sm:col-span-2">
                  <div className="w-full rounded-lg border border-black/5 bg-white px-3 py-2 text-xs text-muted">
                    Range: <span className="font-semibold text-ink">{rangeSpec.startDay} - {rangeSpec.endDay}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 text-[11px] text-muted sm:text-xs">
              {DTR_MONTH_NAMES[currentMonth - 1]} {currentYear} • {totalDays} record{totalDays === 1 ? '' : 's'}
              {totalUndertime > 0 ? ` • ${formatUndertime(totalUndertime)} undertime` : ''}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
              </div>
            ) : error ? (
              <div className="p-4 text-center text-sm text-red-600">{error}</div>
            ) : visibleDays.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">No attendance records for the selected range.</div>
            ) : (
              <>
                <div className="flex flex-col gap-2 p-3 sm:hidden">
                  {visibleDays.map((day) => (
                    <DayCard key={day.dateKey} day={day} />
                  ))}
                </div>

                <div className="hidden sm:block">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-stone-100 text-[10px] font-semibold uppercase text-muted sm:text-xs">
                      <tr>
                        <th className="px-3 py-2.5 text-left">Date</th>
                        <th className="px-3 py-2.5 text-center">AM In</th>
                        <th className="px-3 py-2.5 text-center">AM Out</th>
                        <th className="px-3 py-2.5 text-center">PM In</th>
                        <th className="px-3 py-2.5 text-center">PM Out</th>
                        <th className="px-3 py-2.5 text-right">Undertime</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {visibleDays.map((day) => (
                        <tr key={day.dateKey} className="hover:bg-stone-50">
                          <td className="whitespace-nowrap px-3 py-2.5 text-left text-sm font-medium text-ink">{day.date}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-sm text-ink">{day.amIn}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-sm text-ink">{day.amOut}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-sm text-ink">{day.pmIn}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-sm text-ink">{day.pmOut}</td>
                          <td className={`whitespace-nowrap px-3 py-2.5 text-right font-mono text-sm ${day.undertime > 0 ? 'text-amber-700' : 'text-muted'}`}>
                            {day.undertimeDisplay}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div
            ref={hiddenRenderRef}
            aria-hidden="true"
            style={{ position: 'fixed', left: '-200vw', top: 0 }}
          >
            {downloadRequest?.dtr ? <Form48Renderer dtr={downloadRequest.dtr} /> : null}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
