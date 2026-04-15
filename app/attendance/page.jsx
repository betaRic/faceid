'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import AppShell from '@/components/AppShell'
import AttendanceTableView from '@/components/kiosk/AttendanceTableView'

const SCAN_MATCH_TTL_MS = 30 * 60 * 1000

function getLastScanMatch() {
  try {
    const raw = localStorage.getItem('lastScanMatch')
    if (!raw) return null
    const match = JSON.parse(raw)
    if (!match?.employeeId || !match?.timestamp) return null
    if (Date.now() - match.timestamp > SCAN_MATCH_TTL_MS) {
      localStorage.removeItem('lastScanMatch')
      return null
    }
    return match
  } catch {
    return null
  }
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
            Log in at the kiosk to record your attendance. Your attendance history will appear here after your first check-in.
          </p>
          <div className="mt-2 rounded-xl bg-stone-100 px-5 py-3 text-sm text-muted">
            Ask your HR or admin to direct you to a kiosk station.
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
    setScanMatch(getLastScanMatch())
    setChecked(true)
  }, [])

  const handleClearMatch = useCallback(() => {
    localStorage.removeItem('lastScanMatch')
    setScanMatch(null)
  }, [])

  if (!checked) return null

  if (scanMatch) {
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
