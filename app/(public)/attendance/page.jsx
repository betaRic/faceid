'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import AttendanceTableView from '@/components/kiosk/AttendanceTableView'
import { Button, EmptyState, LoadingState } from '@/components/ui'
import { clearAttendanceMatch, loadAttendanceMatch } from '@/lib/attendance-match'

export default function EmployeeAttendancePage() {
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

  if (!checked) {
    return <AppShell fitViewport><LoadingState className="m-auto" label="Loading attendance access…" /></AppShell>
  }

  if (!scanMatch) {
    return (
      <AppShell fitViewport contentClassName="p-4 sm:p-6">
        <div className="m-auto w-full max-w-xl">
          <EmptyState
            action={<Button onClick={() => { window.location.href = '/scan' }}>Open scan</Button>}
            description="Complete a scan attendance session first. Your attendance history will become available after identity verification."
            headingLevel={1}
            title="Attendance access required"
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell fitViewport contentClassName="min-h-0 p-0">
      <div className="flex h-full min-h-0 flex-col">
        {scanMatch.blocked ? (
          <div className="mx-3 mt-3 rounded-control border border-warning-line bg-warning-surface px-4 py-3 text-sm text-warning sm:mx-4" role="status">
            <strong>Attendance already recorded.</strong> {scanMatch.blockReason || 'Full-day attendance is complete. You can still review your history.'}
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <AttendanceTableView currentMatch={scanMatch} onBack={handleClearMatch} />
        </div>
      </div>
    </AppShell>
  )
}
