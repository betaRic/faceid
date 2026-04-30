'use client'

import { formatTime } from '@/lib/kiosk-utils'
import { buildEmployeeViewHeaders } from '@/lib/attendance-match'
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

function ResultStat({ label, value, subtext = '' }) {
  return (
    <div className="rounded-[1.25rem] border border-black/5 bg-white px-3 py-3 sm:px-4 sm:py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted sm:text-[11px]">{label}</div>
      <div className="mt-1 text-base font-semibold text-ink sm:mt-2 sm:text-xl">{value || '--'}</div>
      {subtext ? <div className="mt-1 text-xs text-muted">{subtext}</div> : null}
    </div>
  )
}

function MonthlySummary({ employeeId, currentMatch }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!employeeId) {
      setLoading(false)
      return
    }

    async function fetchSummary() {
      try {
        const res = await fetch(`/api/attendance/monthly?employeeId=${encodeURIComponent(employeeId)}`, {
          headers: buildEmployeeViewHeaders(currentMatch),
          cache: 'no-store',
        })
        const data = await res.json().catch(() => null)
        if (res.ok && data?.ok) {
          setSummary(data)
        }
      } catch {
        setSummary(null)
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [currentMatch, employeeId])

  if (loading) {
    return (
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-[1.5rem] border border-black/5 bg-stone-50 p-3 sm:mt-6 sm:gap-3 sm:p-4 xl:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl bg-black/5" />
        ))}
      </div>
    )
  }

  if (!summary) return null

  const monthName = MONTH_NAMES[summary.month - 1] || ''

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-3 sm:mt-6 sm:p-4"
      initial={{ opacity: 0, y: 8 }}
      transition={{ delay: 0.15 }}
    >
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {monthName} {summary.year} Activity
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <ResultStat label="Days" value={summary.totalDays} />
        <ResultStat label="Check-ins" value={summary.checkIns} />
        <ResultStat label="Check-outs" value={summary.checkOuts} />
        <ResultStat label="WFH" value={summary.wfhCount} />
      </div>
    </motion.section>
  )
}

export default function KioskSuccessScreen({
  currentMatch,
  onBack,
  onViewTable,
  privacyReturnCountdown = null,
}) {
  const attendanceMode = String(currentMatch?.attendanceMode || '')
  const isWfh = attendanceMode.toLowerCase() === 'wfh'
  const isReviewOnly = currentMatch?.resultState === 'already-recorded'
  const successTitle = isReviewOnly
    ? 'Attendance already recorded'
    : currentMatch?.action === 'checkout'
      ? 'Check-out recorded'
      : 'Check-in recorded'

  const statusTone = isReviewOnly
    ? {
        edge: 'bg-amber-500',
        icon: 'bg-amber-100 text-amber-700',
        banner: 'text-amber-700',
        summary: 'border-amber-200 bg-amber-50',
        primaryButton: 'bg-amber-500 hover:bg-amber-600',
      }
    : {
        edge: 'bg-emerald-500',
        icon: 'bg-emerald-100 text-emerald-700',
        banner: 'text-emerald-700',
        summary: 'border-black/5 bg-stone-50',
        primaryButton: 'bg-navy hover:bg-navy/90',
      }

  const modeLabel = attendanceMode ? (isWfh ? 'WFH' : 'On-site') : 'Attendance'
  const recordedTime = currentMatch?.time || formatTime(currentMatch?.timestamp || Date.now())

  return (
    <div className="absolute inset-0 z-[6] overflow-y-auto overscroll-contain bg-white px-3 py-3 sm:bg-transparent sm:px-6 sm:py-6">
      <motion.div
        animate={{ scale: 1, opacity: 1 }}
        className="mx-auto w-full max-w-5xl overflow-hidden rounded-[1.25rem] border border-black/5 bg-white/95 shadow-2xl backdrop-blur sm:rounded-[2rem]"
        initial={{ scale: 0.97, opacity: 0 }}
      >
        <div className={`h-1.5 w-full ${statusTone.edge}`} />

        <div className="grid gap-3 p-3 sm:gap-6 sm:p-7 lg:grid-cols-[minmax(0,1.35fr)_340px]">
          <div className="min-w-0">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-14 sm:w-14 ${statusTone.icon}`}>
                {isReviewOnly ? (
                  <svg className="h-5 w-5 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8v4l3 3" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </div>

              <div className="min-w-0">
                <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${statusTone.banner}`}>
                  {currentMatch?.detail || 'Attendance recorded'}
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-ink sm:mt-2 sm:text-4xl">{successTitle}</h2>
                <div className="mt-2 break-words text-xl font-semibold leading-tight text-ink sm:mt-3 sm:text-3xl">{currentMatch?.name || 'Employee'}</div>
                <div className="mt-1 text-sm text-muted sm:mt-2 sm:text-base">
                  {currentMatch?.officeName || 'Unassigned office'}
                </div>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink">
                  <span className={`h-2 w-2 rounded-full ${isWfh ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  {modeLabel}
                </div>
              </div>
            </div>

            <div className={`mt-4 grid grid-cols-2 gap-2 rounded-[1.5rem] border p-3 sm:mt-6 sm:gap-3 sm:p-4 ${statusTone.summary} xl:grid-cols-4`}>
              <ResultStat
                label={isReviewOnly ? 'Latest recorded time' : 'Time'}
                value={recordedTime}
              />
              <ResultStat label="Employee ID" value={currentMatch?.employeeId || '--'} />
              <ResultStat label="Office" value={currentMatch?.officeName || '--'} />
              <ResultStat label="Mode" value={modeLabel} />
            </div>

            <MonthlySummary currentMatch={currentMatch} employeeId={currentMatch?.employeeId} />
          </div>

          <aside className="flex flex-col gap-3 rounded-[1.25rem] border border-black/5 bg-stone-50 p-3 sm:gap-4 sm:rounded-[1.5rem] sm:p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-navy-dark">Next actions</div>
              <h3 className="mt-2 text-lg font-semibold text-ink">
                {isReviewOnly ? 'Record already exists' : `Recorded at ${recordedTime}`}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                {isReviewOnly
                  ? 'No duplicate attendance log was added. Review the table if the employee needs a correction.'
                  : 'The employee can leave this screen. It will close automatically for privacy.'}
              </p>
            </div>

            {privacyReturnCountdown ? (
              <div className="rounded-[1.25rem] border border-black/5 bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Privacy return</div>
                <div className="mt-2 text-lg font-semibold text-ink">{privacyReturnCountdown}s</div>
                <div className="mt-1 text-xs text-muted">This result closes automatically to protect employee privacy.</div>
              </div>
            ) : null}

            <div className="grid gap-3">
              {onViewTable ? (
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-navy/20 bg-white px-6 py-3.5 text-sm font-semibold text-navy transition hover:bg-navy/5"
                  onClick={onViewTable}
                >
                  <FileTextIcon className="h-4 w-4" />
                  View attendance table
                </button>
              ) : null}

              <button
                className={`w-full rounded-2xl px-6 py-3.5 text-sm font-semibold text-white transition ${statusTone.primaryButton}`}
                onClick={onBack}
              >
                Back to scan
              </button>
            </div>
          </aside>
        </div>
      </motion.div>
    </div>
  )
}
