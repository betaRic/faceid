'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, Surface, TableFrame } from '@/components/ui'
import { formatAttendanceDateKey } from '@/lib/attendance-time'
import { buildEmployeeViewHeaders, clearAttendanceMatch, loadEmployeeViewAccess } from '@/lib/attendance-match'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatTime(timestamp) {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function SummaryContent() {
  const searchParams = useSearchParams()
  const urlEmployeeId = searchParams.get('employeeId') || ''
  const [employeeId, setEmployeeId] = useState(urlEmployeeId)
  const [employeeViewAccess, setEmployeeViewAccess] = useState(null)
  const [monthlyData, setMonthlyData] = useState(null)
  const [dailyData, setDailyData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const hasEmployeeIdentity = Boolean(employeeId || employeeViewAccess?.personId)

  useEffect(() => {
    const storedAccess = loadEmployeeViewAccess()
    setEmployeeViewAccess(storedAccess)
    setEmployeeId(urlEmployeeId || storedAccess?.employeeId || '')
  }, [urlEmployeeId])

  useEffect(() => {
    if (!hasEmployeeIdentity) {
      setLoading(false)
      return
    }

    let cancelled = false
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const authHeaders = buildEmployeeViewHeaders(employeeViewAccess)
        const date = formatAttendanceDateKey(Date.now())
        const [monthlyResponse, dailyResponse] = await Promise.all([
          fetch(`/api/attendance/monthly?employeeId=${encodeURIComponent(employeeId)}`, { headers: authHeaders, cache: 'no-store' }),
          fetch(`/api/attendance/me?employeeId=${encodeURIComponent(employeeId)}&date=${date}`, { headers: authHeaders, cache: 'no-store' }),
        ])
        const [monthlyJson, dailyJson] = await Promise.all([monthlyResponse.json(), dailyResponse.json()])
        if (cancelled) return
        if (monthlyJson.ok) setMonthlyData(monthlyJson)
        if (dailyJson.ok) setDailyData(dailyJson.entries || [])
        if (!monthlyJson.ok && !dailyJson.ok) {
          const accessDenied = [monthlyResponse.status, dailyResponse.status].some((status) => status === 401 || status === 403)
          if (accessDenied) {
            clearAttendanceMatch()
            setError('Attendance view expired. Scan again on the scan page.')
          } else {
            setError(monthlyJson.message || dailyJson.message || 'Failed to load attendance')
          }
        }
      } catch {
        if (!cancelled) setError('Failed to load attendance')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [employeeId, employeeViewAccess, hasEmployeeIdentity])

  const sortedDaily = [...dailyData].sort((left, right) => Number(left.timestamp || 0) - Number(right.timestamp || 0))

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader actions={<Button onClick={() => window.history.back()} variant="quiet">Back</Button>} description="Today’s activity and the current monthly totals." title="My attendance" />

      <div className="mt-5">
        {loading ? <LoadingState className="justify-center py-16" label="Loading attendance summary…" /> : !hasEmployeeIdentity ? (
          <EmptyState description="Complete a scan attendance session first to view your attendance." title="Attendance access required" />
        ) : error ? (
          <ErrorState description={error} title="Attendance unavailable" />
        ) : (
          <div className="grid gap-5">
            {monthlyData ? (
              <Surface className="p-5">
                <h2 className="text-base font-semibold text-primary">{MONTH_NAMES[monthlyData.month - 1]} {monthlyData.year} summary</h2>
                <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div><dt className="text-xs text-secondary">Days</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{monthlyData.totalDays}</dd></div>
                  <div><dt className="text-xs text-secondary">Check-ins</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{monthlyData.checkIns}</dd></div>
                  <div><dt className="text-xs text-secondary">Check-outs</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{monthlyData.checkOuts}</dd></div>
                  <div><dt className="text-xs text-secondary">WFH</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{monthlyData.wfhCount}</dd></div>
                </dl>
              </Surface>
            ) : null}

            {sortedDaily.length === 0 ? <EmptyState description="No attendance activity is recorded for today." title="No record today" /> : (
              <TableFrame>
                <table aria-label="Today’s attendance" className="w-full text-sm">
                  <thead className="bg-canvas text-xs text-secondary"><tr><th className="px-4 py-3 text-left">Action</th><th className="px-4 py-3 text-left">Mode</th><th className="px-4 py-3 text-right">Time</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {sortedDaily.map((record, index) => (
                      <tr key={record.id || index}>
                        <td className="px-4 py-3 font-medium text-foreground">{record.action === 'checkin' ? 'Check in' : 'Check out'}</td>
                        <td className="px-4 py-3 text-secondary">{record.attendanceMode || 'On-site'}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{formatTime(record.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SummaryPage() {
  return (
    <AppShell fitViewport contentClassName="overflow-y-auto px-4 py-5 sm:px-6">
      <Suspense fallback={<LoadingState className="m-auto" label="Loading attendance summary…" />}>
        <SummaryContent />
      </Suspense>
    </AppShell>
  )
}
