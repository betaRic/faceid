'use client'

import { useCallback, useEffect, useState } from 'react'
import { buildEmployeeViewHeaders } from '@/lib/attendance-match'
import { downloadResponseBlob } from '@/lib/browser-download'
import {
  buildDtrRangeSpec,
  DTR_MONTH_NAMES,
  DTR_RANGE_OPTIONS,
  filterAttendanceDaysByRange,
  getDaysInMonth,
} from '@/lib/dtr'
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  Icon,
  LoadingState,
  PageHeader,
  ResponsiveRecordList,
  Select,
  TableFrame,
} from '@/components/ui'

function buildYearOptions(currentYear) {
  const anchorYear = new Date().getFullYear()
  const values = new Set()
  for (let year = anchorYear - 3; year <= anchorYear + 3; year += 1) values.add(year)
  values.add(currentYear)
  return [...values].sort((left, right) => left - right)
}

function formatUndertime(minutes) {
  if (!minutes) return '—'
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function display(value) {
  return value || '—'
}

export default function AttendanceTableView({ currentMatch, onBack }) {
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1)
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear())
  const [selectedRange, setSelectedRange] = useState('full')
  const [customStartDay, setCustomStartDay] = useState(1)
  const [customEndDay, setCustomEndDay] = useState(() => getDaysInMonth(new Date().getFullYear(), new Date().getMonth() + 1))
  const [downloading, setDownloading] = useState(false)

  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const yearOptions = buildYearOptions(currentYear)
  const rangeSpec = buildDtrRangeSpec({ month: currentMonth, year: currentYear, range: selectedRange, customStartDay, customEndDay })
  const visibleDays = filterAttendanceDaysByRange(days, rangeSpec)
  const totalUndertime = visibleDays.reduce((sum, day) => sum + (day.undertime || 0), 0)

  useEffect(() => {
    setCustomStartDay((previous) => Math.min(previous, daysInMonth))
    setCustomEndDay((previous) => Math.min(Math.max(previous, 1), daysInMonth))
  }, [daysInMonth])

  useEffect(() => {
    if (customStartDay > customEndDay) setCustomEndDay(customStartDay)
  }, [customEndDay, customStartDay])

  useEffect(() => {
    if (!currentMatch?.personId && !currentMatch?.employeeId) {
      setLoading(false)
      return
    }

    let cancelled = false
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/attendance/table?employeeId=${encodeURIComponent(currentMatch.employeeId || '')}&month=${currentMonth}&year=${currentYear}`,
          { headers: buildEmployeeViewHeaders(currentMatch), cache: 'no-store' },
        )
        const data = await response.json()
        if (cancelled) return
        if (data.ok) {
          setDays(data.days || [])
        } else {
          setError(response.status === 401 || response.status === 403
            ? 'Attendance session expired. Scan again on the scan page.'
            : (data.message || 'Failed to load attendance'))
        }
      } catch {
        if (!cancelled) setError('Failed to load attendance')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [currentMatch?.employeeId, currentMatch?.employeeViewSession, currentMatch?.personId, currentMonth, currentYear])

  const handleGenerateDtr = useCallback(async () => {
    if (!currentMatch?.personId && !currentMatch?.employeeId) return
    setError(null)
    setDownloading(true)
    try {
      const params = new URLSearchParams({
        employeeId: currentMatch.employeeId || '',
        month: String(currentMonth),
        year: String(currentYear),
        range: selectedRange,
      })
      if (selectedRange === 'custom') {
        params.set('customStartDay', String(customStartDay))
        params.set('customEndDay', String(customEndDay))
      }
      const response = await fetch(`/api/attendance/dtr?${params}`, {
        headers: buildEmployeeViewHeaders(currentMatch),
        cache: 'no-store',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to generate DTR Excel workbook.')
      }
      await downloadResponseBlob(response, 'DTR.xlsx')
    } catch (downloadError) {
      console.error('DTR download failed:', downloadError)
      setError(downloadError instanceof Error ? downloadError.message : 'Failed to generate DTR Excel workbook.')
    } finally {
      setDownloading(false)
    }
  }, [currentMatch, currentMonth, currentYear, selectedRange, customStartDay, customEndDay])

  const mobileRecords = visibleDays.map((day) => ({
    id: day.dateKey || day.date,
    fields: [
      { label: 'Date', value: day.date },
      { label: 'AM in', value: display(day.amIn) },
      { label: 'AM out', value: display(day.amOut) },
      { label: 'PM in', value: display(day.pmIn) },
      { label: 'PM out', value: display(day.pmOut) },
      { label: 'Status', value: display(day.status) },
      { label: 'Mode', value: display(day.attendanceMode || day.mode) },
      { label: 'Undertime', value: day.undertimeDisplay || formatUndertime(day.undertime) },
    ],
  }))

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas p-3 sm:p-4">
      <PageHeader
        actions={(
          <>
            <Button onClick={onBack} variant="quiet"><Icon name="arrow-left" />Back</Button>
            <Button disabled={loading || downloading} onClick={handleGenerateDtr} variant="secondary">
              <Icon name={downloading ? 'loading' : 'download'} className={downloading ? 'animate-spin' : ''} />
              {downloading ? 'Downloading…' : 'Generate DTR'}
            </Button>
          </>
        )}
        description={currentMatch.employeeId || 'Employee ID not provided'}
        title={currentMatch.name || 'Attendance records'}
      />

      <FilterBar className="mt-4">
        <Field htmlFor="attendance-month" label="Month">
          <Select id="attendance-month" onChange={(event) => setCurrentMonth(Number.parseInt(event.target.value, 10))} value={currentMonth}>
            {DTR_MONTH_NAMES.map((monthName, index) => <option key={monthName} value={index + 1}>{monthName}</option>)}
          </Select>
        </Field>
        <Field htmlFor="attendance-year" label="Year">
          <Select id="attendance-year" onChange={(event) => setCurrentYear(Number.parseInt(event.target.value, 10))} value={currentYear}>
            {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
          </Select>
        </Field>
        <Field htmlFor="attendance-range" label="Date range">
          <Select id="attendance-range" onChange={(event) => setSelectedRange(event.target.value)} value={selectedRange}>
            {DTR_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        {selectedRange === 'custom' ? (
          <>
            <Field htmlFor="attendance-start-day" label="Start day">
              <Select id="attendance-start-day" onChange={(event) => setCustomStartDay(Number.parseInt(event.target.value, 10))} value={customStartDay}>
                {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
              </Select>
            </Field>
            <Field htmlFor="attendance-end-day" label="End day">
              <Select id="attendance-end-day" onChange={(event) => setCustomEndDay(Number.parseInt(event.target.value, 10))} value={customEndDay}>
                {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
              </Select>
            </Field>
          </>
        ) : null}
      </FilterBar>

      <p className="my-3 text-xs text-secondary">
        {DTR_MONTH_NAMES[currentMonth - 1]} {currentYear} · {visibleDays.length} record{visibleDays.length === 1 ? '' : 's'}
        {totalUndertime > 0 ? ` · ${formatUndertime(totalUndertime)} undertime` : ''}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <LoadingState className="justify-center py-16" label="Loading attendance records…" /> : error ? (
          <ErrorState description={error} onRetry={onBack} title="Attendance view unavailable" />
        ) : visibleDays.length === 0 ? (
          <EmptyState action={<Button onClick={onBack} variant="secondary">Back to scan</Button>} description="No attendance records were found for the selected range." title="No attendance records" />
        ) : (
          <>
            <div className="md:hidden"><ResponsiveRecordList records={mobileRecords} /></div>
            <div className="hidden md:block">
              <TableFrame>
                <table aria-label="Attendance records" className="w-full text-sm">
                  <thead className="bg-canvas text-xs text-secondary">
                    <tr><th className="px-3 py-3 text-left">Date</th><th className="px-3 py-3 text-center">AM in</th><th className="px-3 py-3 text-center">AM out</th><th className="px-3 py-3 text-center">PM in</th><th className="px-3 py-3 text-center">PM out</th><th className="px-3 py-3 text-left">Status</th><th className="px-3 py-3 text-left">Mode</th><th className="px-3 py-3 text-right">Undertime</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visibleDays.map((day) => (
                      <tr key={day.dateKey || day.date}>
                        <td className="whitespace-nowrap px-3 py-3 font-medium text-foreground">{day.date}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-center font-mono tabular-nums">{display(day.amIn)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-center font-mono tabular-nums">{display(day.amOut)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-center font-mono tabular-nums">{display(day.pmIn)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-center font-mono tabular-nums">{display(day.pmOut)}</td>
                        <td className="px-3 py-3">{display(day.status)}</td>
                        <td className="px-3 py-3">{display(day.attendanceMode || day.mode)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums">{day.undertimeDisplay || formatUndertime(day.undertime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
