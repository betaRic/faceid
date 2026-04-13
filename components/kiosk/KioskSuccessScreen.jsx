'use client'

import { getGreeting, formatTime } from '@/lib/kiosk-utils'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

const FileTextIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
)

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function MonthlySummary({ employeeId }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!employeeId) {
      setLoading(false)
      return
    }

    async function fetchSummary() {
      try {
        const res = await fetch(`/api/attendance/monthly?employeeId=${encodeURIComponent(employeeId)}`)
        const data = await res.json()
        if (data.ok) {
          setSummary(data)
        }
      } catch (e) {
        console.error('Summary fetch error:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [employeeId])

  if (loading) {
    return (
      <div className="mt-6 grid animate-pulse gap-3 rounded-[1.5rem] border border-black/5 bg-stone-50 p-5 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-black/5" />
        ))}
      </div>
    )
  }

  if (!summary) return null

  const monthName = MONTH_NAMES[summary.month - 1] || ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mt-6 rounded-[1.5rem] border border-black/5 bg-stone-50 p-5"
    >
      <div className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {monthName} {summary.year} Summary
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center">
          <div className="font-display text-2xl text-ink">{summary.totalDays}</div>
          <div className="text-xs text-muted">Days</div>
        </div>
        <div className="text-center">
          <div className="font-display text-2xl text-emerald-600">{summary.checkIns}</div>
          <div className="text-xs text-muted">Check In</div>
        </div>
        <div className="text-center">
          <div className="font-display text-2xl text-amber-600">{summary.checkOuts}</div>
          <div className="text-xs text-muted">Check Out</div>
        </div>
        <div className="text-center">
          <div className="font-display text-2xl text-navy">{summary.wfhCount}</div>
          <div className="text-xs text-muted">WFH</div>
        </div>
      </div>
    </motion.div>
  )
}

export default function KioskSuccessScreen({ currentMatch, flashKey, onBack, onViewTable }) {
  const attendanceMode = currentMatch?.attendanceMode || ''
  const isWfh = attendanceMode.toLowerCase() === 'wfh'
  
  return (
    <div className="absolute inset-0 z-[6] flex items-center justify-center overflow-auto px-4 py-6 sm:px-6">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-xl rounded-[2rem] border border-black/5 bg-white/85 px-6 py-8 text-center shadow-2xl backdrop-blur sm:px-10 sm:py-10"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700/90">
          {currentMatch.detail || 'Attendance recorded'}
        </div>
        <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
          {getGreeting(currentMatch.timestamp || Date.now())}
        </h2>
        <div className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
          {currentMatch.name}
        </div>
        <div className="mt-2 text-sm text-muted sm:text-base">
          {currentMatch.officeName || 'Unassigned office'}
        </div>
        {attendanceMode && (
          <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
            isWfh ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {isWfh ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9,22 9,12 15,12 15,22" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            )}
            {isWfh ? 'WFH' : 'On-site'}
          </div>
        )}

        <div className="mt-7 grid gap-3 rounded-[1.5rem] border border-black/5 bg-stone-50 p-5 text-left sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Time</div>
            <div className="mt-2 font-display text-2xl text-ink">{currentMatch.time || formatTime(currentMatch.timestamp || Date.now())}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Employee ID</div>
            <div className="mt-2 text-lg font-semibold text-ink">{currentMatch.employeeId || '--'}</div>
          </div>
        </div>

        <MonthlySummary employeeId={currentMatch?.employeeId} />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {onViewTable && (
            <button
              onClick={onViewTable}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-navy/20 bg-navy/5 px-6 py-3.5 text-sm font-semibold text-navy transition hover:bg-navy/10"
            >
              <FileTextIcon className="h-4 w-4" />
              View Attendance Table
            </button>
          )}
          <button
            onClick={onBack}
            className="flex-1 rounded-2xl bg-navy px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-navy/90"
          >
            Back to Kiosk
          </button>
        </div>
      </motion.div>
    </div>
  )
}