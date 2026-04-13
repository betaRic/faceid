'use client'

import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioCue } from '@/hooks/useAudioCue'
import { useKioskState } from '@/hooks/useKioskState'
import { useVerificationBurst } from '@/hooks/useVerificationBurst'
import { useKioskLoop } from '@/hooks/useKioskLoop'
import AppShell from './AppShell'
import KioskClock from './kiosk/KioskClock'
import { useKioskClock } from '@/hooks/useKioskClock'
import KioskSuccessScreen from './kiosk/KioskSuccessScreen'
import KioskScanningOverlay from './kiosk/KioskScanningOverlay'
import KioskAlert from './kiosk/KioskAlert'
import { formatAttendanceDateKey } from '@/lib/attendance-time'

export default function KioskView({
  camera,
  modelsReady,
  workspaceReady,
  locationState,
  onLogAttendance,
  errorMessage,
}) {
  const playAudioCue = useAudioCue()
  const previousStateRef = useRef('idle')

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
    alertDebug,
    setAlertDebug,
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

    if (kioskState === 'confirmed') playAudioCue('success')
    if ((kioskState === 'blocked' || kioskState === 'unknown') && previous !== 'blocked' && previous !== 'unknown') {
      playAudioCue('notify')
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

  const handleViewSummary = useCallback(() => {
    if (currentMatch?.employeeId) {
      window.location.href = `/summary?employeeId=${encodeURIComponent(currentMatch.employeeId)}`
    }
  }, [currentMatch])

  return (
    <AppShell
      contentClassName="px-4 py-4 sm:px-6 lg:px-8"
      onBeforeNavigate={pauseScanning}
    >
      <div className="page-frame min-h-[calc(100dvh-8.25rem)] xl:min-h-[calc(100dvh-10.5rem)]">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`relative min-h-[calc(100dvh-8.25rem)] overflow-hidden rounded-[1.4rem] border border-black/5 shadow-glow sm:rounded-[1.75rem] xl:min-h-[calc(100dvh-10.5rem)] ${showSuccessScreen ? 'bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),rgba(255,255,255,0.96))]' : 'bg-black'}`}
        >
          {showSuccessScreen ? (
            <KioskSuccessScreen 
              currentMatch={currentMatch} 
              flashKey={flashKey}
              onBack={handleBackToKiosk}
              onViewSummary={handleViewSummary}
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
            />
          )}
          <KioskAlert alertState={alertState} alertDebug={alertDebug} />
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