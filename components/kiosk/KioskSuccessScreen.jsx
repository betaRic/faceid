import { getGreeting, formatTime } from '@/lib/kiosk-utils'
import { motion } from 'framer-motion'

export default function KioskSuccessScreen({ currentMatch, flashKey, onBack, onViewSummary }) {
  const attendanceMode = currentMatch?.attendanceMode || ''
  const isWfh = attendanceMode.toLowerCase() === 'wfh'
  
  return (
    <div className="absolute inset-0 z-[6] flex items-center justify-center px-4 py-6 sm:px-6">
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

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={onViewSummary}
            className="flex-1 rounded-2xl border border-navy/20 bg-navy/5 px-6 py-3.5 text-sm font-semibold text-navy transition hover:bg-navy/10"
          >
            View My Attendance
          </button>
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