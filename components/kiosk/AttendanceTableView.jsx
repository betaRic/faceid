'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getGreeting, formatTime } from '@/lib/kiosk-utils'

const ChevronLeftIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const ChevronRightIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

const PrinterIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
)

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatUndertime(minutes) {
  if (!minutes || minutes === 0) return '--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

function formatTimeDisplay(timestamp) {
  if (!timestamp) return '--'
  return new Date(timestamp).toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export default function AttendanceTableView({ currentMatch, onBack }) {
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1)
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear())
  const printRef = useRef(null)

  useEffect(() => {
    if (!currentMatch?.employeeId) {
      setLoading(false)
      return
    }

    async function fetchData() {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/attendance/table?employeeId=${encodeURIComponent(currentMatch.employeeId)}&month=${currentMonth}&year=${currentYear}`
        )
        const data = await res.json()
        if (data.ok) {
          setDays(data.days || [])
        } else {
          setError(data.message)
        }
      } catch (e) {
        setError('Failed to load attendance')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [currentMatch?.employeeId, currentMonth, currentYear])

  const goPrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  const goNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const totalDays = days.length
  const totalUndertime = days.reduce((sum, d) => sum + (d.undertime || 0), 0)

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
          <div className="flex shrink-0 items-center justify-between border-b border-black/10 bg-white px-4 py-3">
            <button
              onClick={onBack}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-black/5"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Back
            </button>
            <div className="text-center">
              <h2 className="font-display text-lg text-ink">
                {currentMatch.name}
              </h2>
              <p className="text-xs text-muted">{currentMatch.employeeId}</p>
            </div>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-navy hover:bg-navy/5"
            >
              <PrinterIcon className="h-4 w-4" />
              Print
            </button>
          </div>

          <div className="flex shrink-0 items-center justify-between border-b border-black/5 bg-stone-50 px-4 py-2">
            <button
              onClick={goPrevMonth}
              className="rounded-lg p-2 hover:bg-black/5"
            >
              <ChevronLeftIcon className="h-5 w-5 text-navy" />
            </button>
            <div className="text-center">
              <div className="font-display text-lg text-ink">
                {MONTH_NAMES[currentMonth - 1]} {currentYear}
              </div>
              <div className="text-xs text-muted">
                {totalDays} days • {formatUndertime(totalUndertime)} undertime
              </div>
            </div>
            <button
              onClick={goNextMonth}
              className="rounded-lg p-2 hover:bg-black/5"
            >
              <ChevronRightIcon className="h-5 w-5 text-navy" />
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
              </div>
            ) : error ? (
              <div className="p-4 text-center text-red-600">{error}</div>
            ) : days.length === 0 ? (
              <div className="p-8 text-center text-muted">No attendance records for this month.</div>
            ) : (
              <table ref={printRef} className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-100 text-xs font-semibold uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-center">AM In</th>
                    <th className="px-3 py-2 text-center">AM Out</th>
                    <th className="px-3 py-2 text-center">PM In</th>
                    <th className="px-3 py-2 text-center">PM Out</th>
                    <th className="px-3 py-2 text-right">Under</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {days.map((day, idx) => (
                    <tr key={day.dateKey || idx} className="hover:bg-stone-50">
                      <td className="px-3 py-2.5 text-left font-medium text-ink">
                        {day.date}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-ink">
                        {day.amIn}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-ink">
                        {day.amOut}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-ink">
                        {day.pmIn}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-ink">
                        {day.pmOut}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono ${
                        day.undertime > 0 ? 'text-amber-600' : 'text-muted'
                      }`}>
                        {day.undertimeDisplay}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          table, table * { visibility: visible; }
          table { position: absolute; left: 0; top: 0; width: 100%; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}