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
import KioskScanningOverlay from './kiosk/KioskScanningOverlay'
import KioskAlert from './kiosk/KioskAlert'
import KioskSuccessScreen from './kiosk/KioskSuccessScreen'
import { clearAttendanceMatch, saveAttendanceMatch } from '@/lib/attendance-match'

const CLAIMED_EMPLOYEE_ID_STORAGE_KEY = 'faceattend:claimed-employee-id'

function normalizeEmployeeIdInput(value) {
  return String(value || '').trim().replace(/\s+/g, '')
}

function validateEmployeeIdInput(value) {
  if (!value) return 'Employee ID is required.'
  if (value.length < 3) return 'Employee ID must be at least 3 characters.'
  if (value.length > 20) return 'Employee ID must be 20 characters or fewer.'
  if (!/^[A-Za-z0-9-]+$/.test(value)) return 'Use letters, numbers, and dashes only.'
  return ''
}

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
  const [employeeIdInput, setEmployeeIdInput] = useState('')
  const [employeeIdError, setEmployeeIdError] = useState('')
  const [claimedEmployeeId, setClaimedEmployeeId] = useState('')

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

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(CLAIMED_EMPLOYEE_ID_STORAGE_KEY) || ''
      if (saved) setEmployeeIdInput(saved)
    } catch {}
  }, [])

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
    claimedEmployeeId,
  })

  const { clock, dateStr } = useKioskClock()

  useEffect(() => {
    clearAttendanceMatch()
  }, [])

  const handleRunScan = useCallback(() => {
    return runScan(captureVerificationBurst)
  }, [runScan, captureVerificationBurst])

  useEffect(() => {
    if (!claimedEmployeeId || !workspaceReady || !modelsReady || !camera.camOn) {
      stopLoop()
      return () => {}
    }
    stopLoop()
    startLoop(handleRunScan)
    return stopLoop
  }, [camera.camOn, claimedEmployeeId, modelsReady, resumeKey, startLoop, stopLoop, workspaceReady, handleRunScan])

  const handleEmployeeIdChange = useCallback(event => {
    setEmployeeIdInput(String(event.target.value || '').replace(/\s+/g, '').slice(0, 20))
    if (employeeIdError) setEmployeeIdError('')
  }, [employeeIdError])

  const handleConfirmEmployeeId = useCallback(event => {
    event?.preventDefault?.()
    const normalized = normalizeEmployeeIdInput(employeeIdInput)
    const validation = validateEmployeeIdInput(normalized)
    if (validation) {
      setEmployeeIdError(validation)
      return
    }

    setEmployeeIdError('')
    setClaimedEmployeeId(normalized)
    try {
      window.sessionStorage.setItem(CLAIMED_EMPLOYEE_ID_STORAGE_KEY, normalized)
    } catch {}
  }, [employeeIdInput])

  const handleChangeEmployeeId = useCallback(() => {
    pauseScanning()
    clearAttendanceMatch()
    setCurrentMatch(null)
    setCapturedFrameUrl(null)
    setAlertState(null)
    setKioskState('idle')
    setClaimedEmployeeId('')
    if (camera?.clearOverlay) camera.clearOverlay()
  }, [camera, pauseScanning, setAlertState, setCapturedFrameUrl, setCurrentMatch, setKioskState])

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
    if (!showResultScreen) {
      resultKeyRef.current = ''
      return
    }

    const resultKey = `${currentMatch?.employeeId || ''}:${currentMatch?.timestamp || ''}:${currentMatch?.resultState || 'confirmed'}`
    if (resultKey && resultKey !== resultKeyRef.current) {
      resultKeyRef.current = resultKey
    }
  }, [currentMatch?.employeeId, currentMatch?.resultState, currentMatch?.timestamp, showResultScreen])

  const handleBackToKiosk = useCallback(() => {
    clearAttendanceMatch()
    scheduleResume(250)
  }, [scheduleResume])

  if (!claimedEmployeeId) {
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
            className="grid h-full min-h-0 place-items-center overflow-hidden rounded-[1.4rem] border border-black/5 bg-white px-4 py-6 shadow-glow sm:rounded-[1.75rem]"
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <form className="grid w-full max-w-sm gap-4" onSubmit={handleConfirmEmployeeId}>
              <div className="text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Face Scan</div>
                <h1 className="mt-2 font-display text-3xl font-bold text-ink">Employee ID</h1>
              </div>

              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Employee ID</span>
                <input
                  autoCapitalize="characters"
                  autoComplete="username"
                  autoFocus
                  className={`input h-14 text-center font-display text-xl tracking-[0.08em] ${employeeIdError ? 'border-amber-400' : ''}`}
                  inputMode="text"
                  onChange={handleEmployeeIdChange}
                  placeholder="EMP-001"
                  type="text"
                  value={employeeIdInput}
                />
                {employeeIdError ? <span className="text-center text-xs font-medium text-amber-600">{employeeIdError}</span> : null}
              </label>

              <button className="btn btn-primary h-12 w-full" type="submit">
                Continue to Scan
              </button>
            </form>
          </motion.section>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      actions={(
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[8rem] truncate rounded-full border border-navy/10 bg-white px-3 py-1.5 text-xs font-semibold text-navy sm:inline">
            {claimedEmployeeId}
          </span>
          <button className="btn btn-ghost px-3 py-2 text-xs" onClick={handleChangeEmployeeId} type="button">
            Change ID
          </button>
        </div>
      )}
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
            <KioskSuccessScreen
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
