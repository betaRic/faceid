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
import KioskSuccessScreen from './kiosk/KioskSuccessScreen'
import { clearAttendanceMatch, saveAttendanceMatch } from '@/lib/attendance-match'

const RESULT_PRIVACY_RETURN_MS = 20_000

export default function KioskView({
  camera,
  modelsReady,
  workspaceReady,
  locationState,
  onLogAttendance,
  errorMessage,
}) {
  const playAudioCue = useAudioCue()
  const { recordScan, recordVerification, recordNetwork } = useKioskMetrics()
  const previousStateRef = useRef('idle')
  const resultKeyRef = useRef('')
  const privacyReturnTimerRef = useRef(null)
  const privacyReturnIntervalRef = useRef(null)
  const [postScanView, setPostScanView] = useState('success')
  const [privacyReturnCountdown, setPrivacyReturnCountdown] = useState(null)

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
    showAlertAndResume,
    recordScan,
    recordVerification,
    recordNetwork,
  })

  const { clock, dateStr } = useKioskClock()

  useEffect(() => {
    clearAttendanceMatch()
  }, [])

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
      if (currentMatch?.employeeId) {
        try {
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
  }, [currentMatch, kioskState, playAudioCue])

  const isConfirmed = kioskState === 'confirmed'
  const isUnknown = kioskState === 'unknown'
  const isBlocked = kioskState === 'blocked'
  const isReviewableBlockedState = Boolean(
    isBlocked
    && currentMatch?.resultState === 'already-recorded'
    && currentMatch?.employeeId,
  )
  const showResultScreen = Boolean(currentMatch && (isConfirmed || isReviewableBlockedState))

  useEffect(() => {
    if (privacyReturnTimerRef.current) {
      window.clearTimeout(privacyReturnTimerRef.current)
      privacyReturnTimerRef.current = null
    }
    if (privacyReturnIntervalRef.current) {
      window.clearInterval(privacyReturnIntervalRef.current)
      privacyReturnIntervalRef.current = null
    }
    setPrivacyReturnCountdown(null)

    if (!showResultScreen) {
      return
    }

    const deadline = Date.now() + RESULT_PRIVACY_RETURN_MS
    const syncCountdown = () => {
      const remainingMs = Math.max(0, deadline - Date.now())
      setPrivacyReturnCountdown(Math.max(1, Math.ceil(remainingMs / 1000)))
    }

    syncCountdown()
    privacyReturnIntervalRef.current = window.setInterval(syncCountdown, 250)
    privacyReturnTimerRef.current = window.setTimeout(() => {
      clearAttendanceMatch()
      setPostScanView('success')
      scheduleResume(250)
    }, RESULT_PRIVACY_RETURN_MS)

    return () => {
      if (privacyReturnTimerRef.current) {
        window.clearTimeout(privacyReturnTimerRef.current)
        privacyReturnTimerRef.current = null
      }
      if (privacyReturnIntervalRef.current) {
        window.clearInterval(privacyReturnIntervalRef.current)
        privacyReturnIntervalRef.current = null
      }
      setPrivacyReturnCountdown(null)
    }
  }, [
    currentMatch?.employeeId,
    currentMatch?.resultState,
    currentMatch?.timestamp,
    postScanView,
    scheduleResume,
    showResultScreen,
  ])

  useEffect(() => {
    if (!showResultScreen) {
      setPostScanView('success')
      resultKeyRef.current = ''
      return
    }

    const resultKey = `${currentMatch?.employeeId || ''}:${currentMatch?.timestamp || ''}:${currentMatch?.resultState || 'confirmed'}`
    if (resultKey && resultKey !== resultKeyRef.current) {
      resultKeyRef.current = resultKey
      setPostScanView('success')
    }
  }, [currentMatch?.employeeId, currentMatch?.resultState, currentMatch?.timestamp, showResultScreen])

  const handleBackToKiosk = useCallback(() => {
    clearAttendanceMatch()
    setPostScanView('success')
    scheduleResume(250)
  }, [scheduleResume])

  const handleViewAttendanceTable = useCallback(() => {
    setPostScanView('table')
  }, [])

  return (
    <AppShell
      fitViewport
      contentClassName="px-4 py-4 sm:px-6 lg:px-8"
      onBeforeNavigate={pauseScanning}
      showFooter={false}
    >
      <div className="page-frame h-full min-h-0">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`relative min-h-0 w-full flex-1 overflow-hidden rounded-[1.4rem] border border-black/5 shadow-glow sm:rounded-[1.75rem] ${showResultScreen ? 'bg-white' : 'bg-black'}`}
        >
          {showResultScreen ? (
            postScanView === 'table' ? (
              <AttendanceTableView
                currentMatch={currentMatch}
                onBack={handleBackToKiosk}
                autoReturnCountdown={privacyReturnCountdown}
              />
            ) : (
              <KioskSuccessScreen
                currentMatch={currentMatch}
                onBack={handleBackToKiosk}
                onViewTable={handleViewAttendanceTable}
                privacyReturnCountdown={privacyReturnCountdown}
              />
            )
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
              faceDistanceInfo={faceDistanceInfo}
              modelsReady={modelsReady}
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
