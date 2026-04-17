'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import AppShell from '@/components/AppShell'
import AttendanceTableView from '@/components/kiosk/AttendanceTableView'
import { clearAttendanceMatch, loadAttendanceMatch } from '@/lib/attendance-match'

function BlockedStateView({ match }) {
  return (
    <AppShell fitViewport contentClassName="px-4 py-4 sm:px-6">
      <div className="page-frame h-full min-h-0">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="flex h-full flex-col items-center justify-center gap-5 rounded-[2rem] border border-amber-200 bg-amber-50/80 p-8 text-center shadow-glow backdrop-blur"
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35 }}
        >
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-700">Already Recorded</div>
          <h2 className="font-display text-3xl font-bold text-ink">{match.name}</h2>
          <p className="max-w-md text-sm leading-7 text-muted">
            {match.blockReason || 'Full day attendance already recorded for today.'}
          </p>
          <div className="mt-2 rounded-xl bg-white px-5 py-3 text-sm text-muted">
            You can still view your attendance history below.
          </div>
        </motion.section>
      </div>
    </AppShell>
  )
}

function UnauthorizedView() {
  return (
    <AppShell fitViewport contentClassName="px-4 py-4 sm:px-6">
      <div className="page-frame h-full min-h-0">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="flex h-full flex-col items-center justify-center gap-5 rounded-[2rem] border border-black/5 bg-white/80 p-8 text-center shadow-glow backdrop-blur"
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35 }}
        >
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Attendance</div>
          <h2 className="font-display text-3xl font-bold text-ink">Your Attendance</h2>
          <p className="max-w-md text-sm leading-7 text-muted">
            Complete a scan attendance session to record your attendance. Your attendance history will appear here after your first check-in.
          </p>
          <div className="mt-2 rounded-xl bg-stone-100 px-5 py-3 text-sm text-muted">
            Open the scan page on your device to start a new attendance session.
          </div>
        </motion.section>
      </div>
    </AppShell>
  )
}

export default function EmployeeSummaryPage() {
  const [scanMatch, setScanMatch] = useState(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setScanMatch(loadAttendanceMatch())
    setChecked(true)
  }, [])

  const handleClearMatch = useCallback(() => {
    clearAttendanceMatch()
    setScanMatch(null)
  }, [])

  if (!checked) return null

  if (scanMatch) {
    if (scanMatch.blocked) {
      return (
        <>
          <BlockedStateView match={scanMatch} />
          <div className="mt-4">
            <AttendanceTableView
              currentMatch={scanMatch}
              onBack={handleClearMatch}
            />
          </div>
        </>
      )
    }

    return (
      <AppShell fitViewport contentClassName="px-0 py-0 sm:px-0">
        <div className="relative h-full min-h-0">
          <AttendanceTableView
            currentMatch={scanMatch}
            onBack={handleClearMatch}
          />
        </div>
      </AppShell>
    )
  }

  return <UnauthorizedView />
}
