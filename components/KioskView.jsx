'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioCue } from '@/hooks/useAudioCue'
import { useKioskState } from '@/hooks/useKioskState'
import { useVerificationBurst } from '@/hooks/useVerificationBurst'
import { useKioskLoop } from '@/hooks/useKioskLoop'
import { useKioskMetrics } from '@/hooks/useKioskMetrics'
import AppShell from './AppShell'
import { useKioskClock } from '@/hooks/useKioskClock'
import AttendanceTableView from './kiosk/AttendanceTableView'
import KioskScanningOverlay from './kiosk/KioskScanningOverlay'
import KioskAlert from './kiosk/KioskAlert'
import { formatAttendanceDateKey } from '@/lib/attendance-time'
import { saveAttendanceMatch } from '@/lib/attendance-match'

export default function KioskView({
  camera,
  modelsReady,
  workspaceReady,
  locationState,
  onLogAttendance,
  errorMessage,
}) {
  const playAudioCue = useAudioCue()
  useKioskMetrics()
  const previousStateRef = useRef('idle')
  const [todaysCount, setTodaysCount] = useState(null)

  const {
    kioskState,
    setKioskState,
    currentMatch,
    setCurrentMatch,
    capturedFrameUrl,
    setCapturedFrameUrl,
    flashKey,
    setFlashKey,
    alertState,
    setAlertState,
    resumeKey,
    faceDistanceInfo,
    setFaceDistanceInfo,
    confirmRef,
    confirmedTimer,
    unknownTimer,
    attemptCooldownUntilRef,
    faceLossTimerRef,
    pausedRef,
    stopLoop: stopKioskLoop,
    scheduleResume,
    showAlertAndResume,
    pauseScanning,
  } = useKioskState(camera)

  const { captureVerificationBurst } = useVerificationBurst(camera)

  const { runScan, startLoop, stopLoop } = useKioskLoop({
    camera,
    modelsReady,
    locationState,
    onLogAttendance,
    kioskState,
    setKioskState,
    setCurrentMatch,
    setCapturedFrameUrl,
    setFlashKey,
    setAlertState,
    setFaceDistanceInfo,
    confirmRef,
    confirmedTimer,
    unknownTimer,
    attemptCooldownUntilRef,
    faceLossTimerRef,
    pausedRef,
    scheduleResume,
    showAlertAndResume,
  })

  const { clock, dateStr } = useKioskClock()

  const fetchTodaysCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/attendance/count?date=${formatAttendanceDateKey(new Date())}`)
      const data = await res.json()
      if (data.ok) setTodaysCount(data.count)
    } catch {}
  }, [])

  useEffect(() => { fetchTodaysCount() }, [fetchTodaysCount])

  const handleRunScan = useCallback(() => {
    return runScan(captureVerificationBurst)
  }, [runScan, captureVerificationBurst])

  useEffect(() => {
    if (!workspaceReady || !modelsReady || !camera.camOn) return () => {}
    stopLoop()
    startLoop(handleRunScan)
    return stopLoop
  }, [camera.camOn, modelsReady, resumeKey, startLoop, stopLoop, workspaceReady, handleRunScan])

  useEffect(() => {
    const previous = previousStateRef.current
    if (previous === kioskState) return

    if (kioskState === 'confirmed') {
      playAudioCue('success')
      setTodaysCount(prev => (prev ?? 0) + 1)
      if (currentMatch?.employeeId) {
        try {
          sessionStorage.setItem('currentEmployeeId', currentMatch.employeeId)
          saveAttendanceMatch(currentMatch)
        } catch {}
      }
    }
    if (kioskState === 'blocked' && previous !== 'blocked') {
      playAudioCue('notify')
      // Only save if employee was identified (has employeeId) - not for unknown faces
      if (currentMatch?.employeeId) {
        try {
          saveAttendanceMatch(currentMatch)
        } catch {}
      }
    }
    if (kioskState === 'unknown' && previous !== 'unknown') {
      playAudioCue('notify')
      // Don't save - face was not recognized, we don't know who they are
    }
    previousStateRef.current = kioskState
  }, [kioskState, playAudioCue])

  const isConfirmed = kioskState === 'confirmed'
  const isUnknown = kioskState === 'unknown'
  const isBlocked = kioskState === 'blocked'
  const showSuccessScreen = Boolean(isConfirmed && currentMatch)

  const handleBackToKiosk = useCallback(() => {
    scheduleResume(250)
  }, [scheduleResume])

  return (
    <AppShell
      fitViewport
      contentClassName="px-4 py-4 sm:px-6 lg:px-8"
      onBeforeNavigate={pauseScanning}
    >
      <div className="page-frame h-full min-h-0">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`relative min-h-0 w-full flex-1 overflow-hidden rounded-[1.4rem] border border-black/5 shadow-glow sm:rounded-[1.75rem] ${showSuccessScreen ? 'bg-white' : 'bg-black'}`}
        >
          {showSuccessScreen ? (
            <AttendanceTableView
              currentMatch={currentMatch}
              onBack={handleBackToKiosk}
            />
          ) : (
            <KioskScanningOverlay
              camera={camera}
              kioskState={kioskState}
              capturedFrameUrl={capturedFrameUrl}
              isConfirmed={isConfirmed}
              isBlocked={isBlocked}
              isUnknown={isUnknown}
              flashKey={flashKey}
              clock={clock}
              dateStr={dateStr}
              locationState={locationState}
              errorMessage={errorMessage}
              faceDistanceInfo={faceDistanceInfo}
              todaysCount={todaysCount}
            />
          )}
          <KioskAlert alertState={alertState} />
          {errorMessage ? (
            <div className="absolute inset-x-3 bottom-3 z-[4] rounded-2xl bg-red-50/95 px-4 py-3 text-sm text-warn shadow-lg backdrop-blur sm:inset-x-5 sm:bottom-5">
              {errorMessage}
            </div>
          ) : null}
        </motion.section>
      </div>
    </AppShell>
  )
}
