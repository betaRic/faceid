'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import AppShell from '@/components/AppShell'
import { Field, Badge } from '@/components/shared/ui'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function LoadingPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
      <span className="text-sm text-muted">Loading...</span>
    </div>
  )
}

export default function EmployeeSummaryPage() {
  const [summaryDate, setSummaryDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [officeFilter, setOfficeFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [offices, setOffices] = useState([])
  const abortRef = useRef(null)

  const fetchOffices = useCallback(async () => {
    try {
      const res = await fetch('/api/offices')
      const data = await res.json()
      if (data.ok) {
        setOffices(data.offices || [])
      }
    } catch (err) {
      console.error('Failed to load offices', err)
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    const params = new URLSearchParams({ date: summaryDate })
    if (officeFilter !== 'all') params.set('officeId', officeFilter)

    try {
      const res = await fetch(`/api/attendance/daily?${params.toString()}`, { signal: abortRef.current.signal })
      const data = await res.json()
      if (data.ok) {
        setRows(data.records || [])
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load summary', err)
      }
    }
    setLoading(false)
  }, [summaryDate, officeFilter])

  useEffect(() => {
    fetchOffices()
  }, [fetchOffices])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const todayStr = new Date().toISOString().split('T')[0]
  const isToday = summaryDate === todayStr

  return (
    <AppShell contentClassName="px-4 py-4 sm:px-6">
      <div className="page-frame min-h-[calc(100dvh-8.25rem)] xl:min-h-[calc(100dvh-10.5rem)]">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="flex h-full flex-col gap-5 rounded-[2rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur"
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35 }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Attendance</div>
              <h2 className="mt-1 font-display text-3xl font-bold text-ink">Daily Report</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
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
                  onChange={e => setOfficeFilter(e.target.value)}
                  value={officeFilter}
                >
                  <option value="all">All offices</option>
                  {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <div className="flex items-end">
                <div className="rounded-xl bg-stone-100 px-4 py-2 text-sm text-muted">
                  View only
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-black/5">
            {loading ? (
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
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-5 py-10 text-center text-muted" colSpan={9}>
                        No attendance records for this date.
                      </td>
                    </tr>
                  ) : (
                    rows.map(row => (
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
      </div>
    </AppShell>
  )
}