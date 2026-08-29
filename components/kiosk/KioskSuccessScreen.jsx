'use client'

import { useEffect, useMemo } from 'react'
import { formatAttendanceTimeLabel } from '@/lib/attendance-time'
import { Button, Icon, Status } from '@/components/ui'

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
  const alreadyRecorded = currentMatch?.resultState === 'already-recorded'
  const resultTone = alreadyRecorded ? 'warning' : 'success'

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onBack?.()
    }, AUTO_RETURN_MS)
    return () => window.clearTimeout(timer)
  }, [onBack, currentMatch?.employeeId, currentMatch?.personId, currentMatch?.timestamp])

  return (
    <div className="absolute inset-0 z-[6] grid place-items-center bg-surface px-5 py-6">
      <div className="grid w-full max-w-md justify-items-center text-center">
        <div
          className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${alreadyRecorded ? 'bg-warning-surface text-warning' : 'bg-success-surface text-success'}`}
          data-tone={resultTone}
        >
          <Icon name={alreadyRecorded ? 'clock' : 'check'} size={36} strokeWidth={2.5} />
        </div>
        <Status tone={resultTone}>{alreadyRecorded ? 'Already recorded' : 'Attendance recorded'}</Status>

        <div className="font-display text-[clamp(3.5rem,13vw,7rem)] font-bold leading-none text-ink">
          {recordedTime}
        </div>
        <div className="mt-5 max-w-full break-words font-display text-[clamp(1.6rem,6vw,3rem)] font-semibold leading-tight text-primary">
          {employeeName}
        </div>

        <Button
          className="mt-10"
          onClick={onBack}
          type="button"
        >
          Scan next
        </Button>
      </div>
    </div>
  )
}
