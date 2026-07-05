'use client'

import { motion } from 'framer-motion'
import { useEffect, useMemo } from 'react'
import { formatAttendanceTimeLabel } from '@/lib/attendance-time'

const AUTO_RETURN_MS = 2200

function getRecordedTime(currentMatch) {
  const timestamp = Number(currentMatch?.timestamp || 0)
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return formatAttendanceTimeLabel(timestamp)
  }
  return String(currentMatch?.time || '').trim() || formatAttendanceTimeLabel(Date.now())
}

export default function KioskSuccessScreen({
  currentMatch,
  onBack,
}) {
  const recordedTime = useMemo(() => getRecordedTime(currentMatch), [currentMatch])
  const employeeName = String(currentMatch?.name || 'Employee').trim()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onBack?.()
    }, AUTO_RETURN_MS)
    return () => window.clearTimeout(timer)
  }, [onBack, currentMatch?.employeeId, currentMatch?.timestamp])

  return (
    <div className="absolute inset-0 z-[6] grid place-items-center bg-white px-5 py-6">
      <motion.div
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="grid w-full max-w-md justify-items-center text-center"
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        <div className="font-display text-[clamp(3.5rem,13vw,7rem)] font-bold leading-none text-ink">
          {recordedTime}
        </div>
        <div className="mt-5 max-w-full break-words font-display text-[clamp(1.6rem,6vw,3rem)] font-semibold leading-tight text-navy">
          {employeeName}
        </div>

        <button
          className="mt-10 rounded-full bg-navy px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-navy/90"
          onClick={onBack}
          type="button"
        >
          Scan next
        </button>
      </motion.div>
    </div>
  )
}
