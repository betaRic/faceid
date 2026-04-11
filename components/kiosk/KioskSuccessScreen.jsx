import { getGreeting, formatTime } from '@/lib/kiosk-utils'
import { motion } from 'framer-motion'

export default function KioskSuccessScreen({ currentMatch, flashKey, onBack, onViewSummary }) {
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